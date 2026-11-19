// src/app/api/whatsapp/webhook/route.ts
// Webhook da Cloud API da Meta (conexão direta). A YCloud tem rota própria em ../ycloud.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { baixarESalvarMidia } from '@/lib/whatsapp/media'
import { WaConfigMeta } from '@/lib/whatsapp/send'
import { ContextoEntrada, MensagemRecebida, processarMensagem, registrarStatus } from '@/lib/whatsapp/inbound'

// Download de mídia + resposta do bot podem passar do limite padrão
export const maxDuration = 60

type StatusRecebido = {
  id?: string
  status?: string
  errors?: { code?: number; title?: string; message?: string }[]
}

type ValorWebhook = {
  metadata?: { phone_number_id?: string }
  contacts?: { profile?: { name?: string } }[]
  messages?: MensagemRecebida[]
  statuses?: StatusRecebido[]
}

type ConfigFilial = { filial_id: string; phone_number_id: string; access_token: string; bot_ativo: boolean }

// GET: Meta verifica o webhook com um challenge
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('wa_config')
    .select('filial_id')
    .eq('verify_token', token)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: 'invalid token' }, { status: 403 })
  }

  return new NextResponse(challenge, { status: 200 })
}

// POST: recebe mensagens do WhatsApp
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Esta rota é pública; a assinatura HMAC é a única prova de que o evento veio da Meta
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error('[WA webhook] META_APP_SECRET não configurado — evento recusado')
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
  }
  const signature = request.headers.get('x-hub-signature-256') ?? ''
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  const recebida = Buffer.from(signature)
  const esperada = Buffer.from(expected)
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) {
    console.warn('[WA webhook] assinatura inválida', { temAssinatura: signature.length > 0, bytes: rawBody.length })
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: { entry?: { changes?: { value?: ValorWebhook }[] }[] }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const totalMensagens = (body.entry ?? [])
    .flatMap(e => e.changes ?? [])
    .reduce((n, c) => n + (c.value?.messages?.length ?? 0), 0)
  console.log('[WA webhook] evento recebido', { mensagens: totalMensagens })

  const configs = new Map<string, ConfigFilial | null>()
  let falhou = false

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value

      // Avisos de entrega das mensagens que nós enviamos (enviada, entregue, lida, falhou)
      for (const st of value?.statuses ?? []) {
        const erro = st.errors?.[0]
        await registrarStatus(
          st.id ? [st.id] : [],
          st.status,
          erro ? { codigo: erro.code, motivo: erro.title ?? erro.message } : null,
          supabase
        )
      }

      if (!value?.messages?.length) continue

      const phoneNumberId = value.metadata?.phone_number_id
      if (!phoneNumberId) continue

      if (!configs.has(phoneNumberId)) {
        const { data } = await supabase
          .from('wa_config')
          .select('filial_id, phone_number_id, access_token, bot_ativo')
          .eq('phone_number_id', phoneNumberId)
          .maybeSingle()
        configs.set(phoneNumberId, (data as ConfigFilial | null) ?? null)
      }
      const config = configs.get(phoneNumberId)
      if (!config) {
        console.error('[WA webhook] phone_number_id sem configuração:', phoneNumberId)
        continue
      }

      const envio: WaConfigMeta = { provedor: 'meta', phone_number_id: config.phone_number_id, access_token: config.access_token }
      const ctx: ContextoEntrada = {
        filialId: config.filial_id,
        botAtivo: config.bot_ativo,
        envio,
        baixarMidia: (midia, pasta) => baixarESalvarMidia(envio, midia.id, pasta, supabase),
        supabase,
      }

      const nomeContato = value.contacts?.[0]?.profile?.name ?? null
      for (const msg of value.messages) {
        try {
          await processarMensagem(msg, nomeContato, ctx)
          console.log('[WA webhook] mensagem processada', { tipo: msg.type, phoneNumberId })
        } catch (err) {
          console.error('[WA webhook] falha ao gravar', msg.id, err)
          falhou = true
        }
      }
    }
  }

  // 500 faz a Meta reentregar; mensagens já gravadas são ignoradas pelo índice único
  if (falhou) return NextResponse.json({ error: 'storage failure' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
