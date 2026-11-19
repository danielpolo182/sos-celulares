// src/app/api/whatsapp/ycloud/[token]/route.ts
// Webhook da YCloud (número em coexistência com o aplicativo WhatsApp Business).
// O [token] é o verify_token da filial: identifica de quem é o evento antes de
// conferir a assinatura, já que nem todo evento traz o número da loja.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { baixarESalvarMidiaYCloud } from '@/lib/whatsapp/media'
import { configDeEnvio } from '@/lib/whatsapp/send'
import { assinaturaYCloudValida } from '@/lib/whatsapp/ycloud'
import { ContextoEntrada, MensagemRecebida, processarMensagem, registrarEco, registrarStatus } from '@/lib/whatsapp/inbound'
import { expirarConsultas } from '@/lib/whatsapp/consultas'

export const maxDuration = 60

type MensagemYCloud = Omit<MensagemRecebida, 'from' | 'id'> & {
  id?: string
  wamid?: string
  from?: string
  to?: string
  status?: string
  errorCode?: string
  errorMessage?: string
  whatsappApiError?: { code?: string | number; message?: string }
  customerProfile?: { name?: string }
}

type EventoYCloud = {
  id?: string
  type?: string
  whatsappInboundMessage?: MensagemYCloud
  whatsappMessage?: MensagemYCloud
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const rawBody = await request.text()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: config } = await supabase
    .from('wa_config')
    .select('filial_id, bot_ativo, provedor, phone_number_id, access_token, ycloud_api_key, ycloud_numero, ycloud_webhook_secret')
    .eq('verify_token', token)
    .maybeSingle()

  if (!config) return NextResponse.json({ error: 'unknown endpoint' }, { status: 404 })

  // Rota pública: sem o segredo do webhook não há como saber se o evento veio da YCloud
  if (!config.ycloud_webhook_secret) {
    console.error('[WA ycloud] segredo do webhook não configurado — evento recusado')
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
  }
  const cabecalho = request.headers.get('ycloud-signature') ?? ''
  if (!assinaturaYCloudValida(cabecalho, rawBody, config.ycloud_webhook_secret)) {
    console.warn('[WA ycloud] assinatura inválida', { temAssinatura: cabecalho.length > 0, bytes: rawBody.length })
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let evento: EventoYCloud
  try {
    evento = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  console.log('[WA ycloud] evento recebido', { tipo: evento.type })

  const apiKey = config.ycloud_api_key as string | null
  const ctx: ContextoEntrada = {
    filialId: config.filial_id,
    botAtivo: config.bot_ativo,
    envio: configDeEnvio(config),
    baixarMidia: async (midia, pasta) => {
      if (!midia.link || !apiKey) return null
      return baixarESalvarMidiaYCloud(apiKey, { link: midia.link, id: midia.id, mime: midia.mime }, pasta, supabase)
    },
    supabase,
  }

  try {
    if (evento.type === 'whatsapp.inbound_message.received' && evento.whatsappInboundMessage?.from) {
      const m = evento.whatsappInboundMessage
      // O id do WhatsApp é o que identifica a mensagem de forma única entre reentregas
      await processarMensagem({ ...m, from: m.from as string, id: m.wamid ?? m.id }, m.customerProfile?.name ?? null, ctx)
    } else if (evento.type === 'whatsapp.message.updated' && evento.whatsappMessage) {
      const m = evento.whatsappMessage
      const temErro = m.errorCode || m.errorMessage || m.whatsappApiError
      await registrarStatus(
        [m.id, m.wamid].filter((v): v is string => !!v),
        m.status,
        temErro
          ? { codigo: m.whatsappApiError?.code ?? m.errorCode, motivo: m.errorMessage ?? m.whatsappApiError?.message }
          : null,
        supabase
      )
    } else if (evento.type === 'whatsapp.smb.message.echoes' && evento.whatsappMessage?.to) {
      // Mensagem que a loja enviou pelo aplicativo do celular
      const m = evento.whatsappMessage
      await registrarEco({ ...m, clienteTelefone: m.to as string, id: m.id ?? m.wamid }, ctx)
    }
  } catch (err) {
    // 500 faz a YCloud reentregar; o que já foi gravado é ignorado pelo índice único
    console.error('[WA ycloud] falha ao processar', evento.type, err)
    return NextResponse.json({ error: 'storage failure' }, { status: 500 })
  }

  // Não há agendador de minutos: o prazo das consultas ao responsável é conferido a cada evento
  if (ctx.botAtivo && ctx.envio) {
    try {
      await expirarConsultas(supabase, ctx.filialId, ctx.envio)
    } catch (err) {
      console.error('[WA ycloud] prazo das consultas', err)
    }
  }

  return NextResponse.json({ ok: true })
}
