// src/app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { processBot } from '@/lib/whatsapp/bot'
import { escalateToHuman } from '@/lib/whatsapp/escalate'
import { sendMessage } from '@/lib/whatsapp/send'
import { baixarESalvarMidia } from '@/lib/whatsapp/media'

// Download de mídia + resposta do bot podem passar do limite padrão
export const maxDuration = 60

type MidiaRecebida = { id: string; mime_type?: string; caption?: string; filename?: string }

type MensagemRecebida = {
  from: string
  id?: string
  type?: string
  text?: { body?: string }
  image?: MidiaRecebida
  audio?: MidiaRecebida
  video?: MidiaRecebida
  document?: MidiaRecebida
  sticker?: MidiaRecebida
  button?: { text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[]
}

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

// Estados que podem anteceder cada um: os avisos chegam fora de ordem e um
// "delivered" atrasado não pode apagar um "read".
const STATUS_ANTERIORES: Record<string, string[]> = {
  sent: [],
  delivered: ['sent'],
  read: ['sent', 'delivered'],
}

/** Grava na mensagem enviada o estado de entrega avisado pela Meta. */
async function registrarStatus(st: StatusRecebido, supabase: SupabaseClient): Promise<void> {
  if (!st.id || !st.status) return

  if (st.status === 'failed') {
    const erro = st.errors?.[0]
    console.warn('[WA webhook] entrega falhou', { codigo: erro?.code, motivo: erro?.title })
    const { error } = await supabase
      .from('wa_mensagens')
      .update({
        status_entrega: 'failed',
        erro_entrega: erro ? `${erro.code ?? ''} ${erro.title ?? erro.message ?? ''}`.trim() : null,
      })
      .eq('wa_message_id', st.id)
    if (error) console.error('[WA webhook] gravar status', error.message)
    return
  }

  const anteriores = STATUS_ANTERIORES[st.status]
  if (!anteriores) return
  const { error } = await supabase
    .from('wa_mensagens')
    .update({ status_entrega: st.status })
    .eq('wa_message_id', st.id)
    .or(['status_entrega.is.null', ...anteriores.map(s => `status_entrega.eq.${s}`)].join(','))
  if (error) console.error('[WA webhook] gravar status', error.message)
}

type ConfigFilial = { filial_id: string; phone_number_id: string; access_token: string; bot_ativo: boolean }

type MensagemNormalizada = {
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha'
  conteudo: string
  media?: { id: string; mime: string | null; nome: string | null }
}

function normalizar(msg: MensagemRecebida): MensagemNormalizada | null {
  const midia = (m: MidiaRecebida) => ({ id: m.id, mime: m.mime_type ?? null, nome: m.filename ?? null })

  switch (msg.type) {
    case 'text':
      return msg.text?.body ? { tipo: 'texto', conteudo: msg.text.body } : null
    case 'button':
      return msg.button?.text ? { tipo: 'texto', conteudo: msg.button.text } : null
    case 'interactive': {
      const titulo = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
      return titulo ? { tipo: 'texto', conteudo: titulo } : null
    }
    case 'image':
      return msg.image ? { tipo: 'imagem', conteudo: msg.image.caption || '📷 Foto', media: midia(msg.image) } : null
    case 'audio':
      return msg.audio ? { tipo: 'audio', conteudo: '🎤 Áudio', media: midia(msg.audio) } : null
    case 'video':
      return msg.video ? { tipo: 'video', conteudo: msg.video.caption || '🎬 Vídeo', media: midia(msg.video) } : null
    case 'document':
      return msg.document
        ? { tipo: 'documento', conteudo: msg.document.caption || msg.document.filename || '📄 Documento', media: midia(msg.document) }
        : null
    case 'sticker':
      return msg.sticker ? { tipo: 'figurinha', conteudo: 'Figurinha', media: midia(msg.sticker) } : null
    case 'location': {
      const l = msg.location
      if (l?.latitude == null || l?.longitude == null) return null
      const rotulo = [l.name, l.address].filter(Boolean).join(' — ')
      return { tipo: 'texto', conteudo: `📍 Localização${rotulo ? `: ${rotulo}` : ''}\nhttps://maps.google.com/?q=${l.latitude},${l.longitude}` }
    }
    case 'contacts': {
      const lista = (msg.contacts ?? [])
        .map(c => [c.name?.formatted_name, c.phones?.[0]?.phone].filter(Boolean).join(' '))
        .filter(Boolean)
      return { tipo: 'texto', conteudo: `👤 Contato compartilhado: ${lista.join(', ') || 'sem dados'}` }
    }
    case 'reaction':
      return null
    default:
      return { tipo: 'texto', conteudo: `[Mensagem do tipo "${msg.type ?? 'desconhecido'}" não suportada]` }
  }
}

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

async function processarMensagem(
  msg: MensagemRecebida,
  nomeContato: string | null,
  config: ConfigFilial,
  supabase: SupabaseClient
): Promise<void> {
  const norm = normalizar(msg)
  if (!norm) return

  const waConfig = { phone_number_id: config.phone_number_id, access_token: config.access_token }
  const statusInicial = config.bot_ativo ? 'bot' : 'humano'

  // Busca ou cria conversa
  const { data: existente } = await supabase
    .from('wa_conversas')
    .select('id, status')
    .eq('telefone', msg.from)
    .eq('filial_id', config.filial_id)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversaId: string
  let status: string
  if (existente) {
    conversaId = existente.id
    // Conversa resolvida que recebe mensagem nova volta para a fila
    status = existente.status === 'resolvida' ? statusInicial : existente.status
    await supabase
      .from('wa_conversas')
      .update({
        atualizado_em: new Date().toISOString(),
        status,
        ...(nomeContato ? { nome_contato: nomeContato } : {}),
      })
      .eq('id', conversaId)
  } else {
    const { data: nova, error } = await supabase
      .from('wa_conversas')
      .insert({ telefone: msg.from, filial_id: config.filial_id, status: statusInicial, nome_contato: nomeContato })
      .select('id')
      .single()
    if (error || !nova) throw new Error(`criar conversa: ${error?.message}`)
    conversaId = nova.id
    status = statusInicial
  }

  // Grava antes de qualquer trabalho lento: o índice único em wa_message_id
  // faz a reentrega do mesmo evento pela Meta parar aqui.
  const { data: gravada, error: erroMsg } = await supabase
    .from('wa_mensagens')
    .insert({
      conversa_id: conversaId,
      direcao: 'entrada',
      conteudo: norm.conteudo,
      tipo: norm.tipo,
      wa_message_id: msg.id ?? null,
      media_mime: norm.media?.mime ?? null,
      media_nome: norm.media?.nome ?? null,
    })
    .select('id')
    .single()

  if (erroMsg) {
    if (erroMsg.code === '23505') return
    throw new Error(`gravar mensagem: ${erroMsg.message}`)
  }

  // A partir daqui a mensagem já está salva: falhas são registradas, mas não
  // devolvem erro à Meta (uma reentrega não refaria estas etapas).
  try {
    if (norm.media) {
      const salvo = await baixarESalvarMidia(waConfig, norm.media.id, `${config.filial_id}/${conversaId}`, supabase)
      if (salvo) {
        const { error: erroMidia } = await supabase
          .from('wa_mensagens')
          .update({ media_path: salvo.path, media_mime: salvo.mime })
          .eq('id', gravada.id)
        if (erroMidia) console.error('[WA media] gravar caminho', erroMidia.message)
        else console.log('[WA media] arquivo salvo', { tipo: norm.tipo, mime: salvo.mime })
      } else {
        console.error('[WA media] arquivo não salvo', { tipo: norm.tipo })
      }
    }

    if (status !== 'bot' || !config.bot_ativo) return

    // O bot só entende texto: áudio, foto e arquivo vão direto para uma pessoa
    if (norm.tipo !== 'texto') {
      await escalateToHuman(conversaId, { ...waConfig, filial_id: config.filial_id }, supabase)
      return
    }

    const { resposta, escalou } = await processBot(norm.conteudo, msg.from, conversaId, supabase, config.filial_id)

    if (escalou) {
      await escalateToHuman(conversaId, { ...waConfig, filial_id: config.filial_id }, supabase)
    } else {
      const waMessageId = await sendMessage(waConfig, msg.from, resposta)
      await supabase.from('wa_mensagens').insert({ conversa_id: conversaId, direcao: 'saida', conteudo: resposta, wa_message_id: waMessageId })
    }
  } catch (err) {
    console.error('[WA webhook] pós-gravação', msg.id, err)
    // Se o bot falhou, a conversa não pode ficar presa sem resposta
    await supabase.from('wa_conversas').update({ status: 'humano' }).eq('id', conversaId)
  }
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
      for (const st of value?.statuses ?? []) await registrarStatus(st, supabase)

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

      const nomeContato = value.contacts?.[0]?.profile?.name ?? null
      for (const msg of value.messages) {
        try {
          await processarMensagem(msg, nomeContato, config, supabase)
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
