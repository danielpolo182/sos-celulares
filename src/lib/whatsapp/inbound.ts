// src/lib/whatsapp/inbound.ts
// Tratamento das mensagens e avisos recebidos, comum aos dois provedores
// (Cloud API da Meta e YCloud). Cada webhook valida a origem, traduz o evento
// para os tipos daqui e chama estas funções.
import { SupabaseClient } from '@supabase/supabase-js'
import { processBot } from './bot'
import { escalateToHuman } from './escalate'
import { sendMessage, WaConfig } from './send'
import { MidiaSalva } from './media'

export type MidiaRecebida = { id: string; mime_type?: string; caption?: string; filename?: string; link?: string }

/** Formato da mensagem na Cloud API; a YCloud usa os mesmos nomes de campo dentro do seu envelope. */
export type MensagemRecebida = {
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

export type MidiaNormalizada = { id: string; mime: string | null; nome: string | null; link: string | null }

export type MensagemNormalizada = {
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha'
  conteudo: string
  media?: MidiaNormalizada
}

export function normalizar(msg: Omit<MensagemRecebida, 'from'>): MensagemNormalizada | null {
  const midia = (m: MidiaRecebida): MidiaNormalizada => ({
    id: m.id, mime: m.mime_type ?? null, nome: m.filename ?? null, link: m.link ?? null,
  })

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

export type ContextoEntrada = {
  filialId: string
  botAtivo: boolean
  /** Credenciais para responder (bot e transferência); null se o envio não estiver configurado */
  envio: WaConfig | null
  /** Como baixar a mídia depende do provedor */
  baixarMidia: (midia: MidiaNormalizada, pasta: string) => Promise<MidiaSalva | null>
  supabase: SupabaseClient
}

// As conversas são identificadas pelo telefone só com dígitos, igual nos dois provedores
const soDigitos = (telefone: string) => telefone.replace(/\D/g, '')

async function gravarMidia(
  mensagemId: string,
  norm: MensagemNormalizada,
  pasta: string,
  ctx: ContextoEntrada
): Promise<void> {
  if (!norm.media) return
  const salvo = await ctx.baixarMidia(norm.media, pasta)
  if (!salvo) {
    console.error('[WA media] arquivo não salvo', { tipo: norm.tipo })
    return
  }
  const { error } = await ctx.supabase
    .from('wa_mensagens')
    .update({ media_path: salvo.path, media_mime: salvo.mime })
    .eq('id', mensagemId)
  if (error) console.error('[WA media] gravar caminho', error.message)
  else console.log('[WA media] arquivo salvo', { tipo: norm.tipo, mime: salvo.mime })
}

/** Mensagem enviada por um cliente. Lança erro só se não conseguir gravar (o webhook devolve 500 e o provedor reentrega). */
export async function processarMensagem(
  msg: MensagemRecebida,
  nomeContato: string | null,
  ctx: ContextoEntrada
): Promise<void> {
  const norm = normalizar(msg)
  if (!norm) return

  const { supabase } = ctx
  const telefone = soDigitos(msg.from)
  const statusInicial = ctx.botAtivo ? 'bot' : 'humano'

  // Busca ou cria conversa
  const { data: existente } = await supabase
    .from('wa_conversas')
    .select('id, status')
    .eq('telefone', telefone)
    .eq('filial_id', ctx.filialId)
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
      .insert({ telefone, filial_id: ctx.filialId, status: statusInicial, nome_contato: nomeContato })
      .select('id')
      .single()
    if (error || !nova) throw new Error(`criar conversa: ${error?.message}`)
    conversaId = nova.id
    status = statusInicial
  }

  // Grava antes de qualquer trabalho lento: o índice único em wa_message_id
  // faz a reentrega do mesmo evento parar aqui.
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
  // devolvem erro ao provedor (uma reentrega não refaria estas etapas).
  try {
    await gravarMidia(gravada.id, norm, `${ctx.filialId}/${conversaId}`, ctx)

    if (status !== 'bot' || !ctx.botAtivo || !ctx.envio) return
    const envio = { ...ctx.envio, filial_id: ctx.filialId }

    // O bot só entende texto: áudio, foto e arquivo vão direto para uma pessoa
    if (norm.tipo !== 'texto') {
      await escalateToHuman(conversaId, envio, supabase)
      return
    }

    const { resposta, escalou } = await processBot(norm.conteudo, telefone, conversaId, supabase, ctx.filialId)

    if (escalou) {
      await escalateToHuman(conversaId, envio, supabase)
    } else {
      const waMessageId = await sendMessage(ctx.envio, telefone, resposta)
      await supabase.from('wa_mensagens').insert({ conversa_id: conversaId, direcao: 'saida', conteudo: resposta, wa_message_id: waMessageId })
    }
  } catch (err) {
    console.error('[WA webhook] pós-gravação', msg.id, err)
    // Se o bot falhou, a conversa não pode ficar presa sem resposta
    await supabase.from('wa_conversas').update({ status: 'humano' }).eq('id', conversaId)
  }
}

/**
 * Mensagem que a loja enviou pelo aplicativo do celular (coexistência).
 * Entra na conversa como saída, para o Inbox mostrar o atendimento completo.
 */
export async function registrarEco(
  eco: Omit<MensagemRecebida, 'from'> & { clienteTelefone: string },
  ctx: ContextoEntrada
): Promise<void> {
  const norm = normalizar(eco)
  if (!norm) return

  const { supabase } = ctx
  const telefone = soDigitos(eco.clienteTelefone)

  const { data: existente } = await supabase
    .from('wa_conversas')
    .select('id')
    .eq('telefone', telefone)
    .eq('filial_id', ctx.filialId)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversaId = existente?.id as string | undefined
  if (conversaId) {
    // Alguém respondeu pelo celular: a conversa é de uma pessoa, o bot sai de cena
    await supabase
      .from('wa_conversas')
      .update({ atualizado_em: new Date().toISOString(), status: 'humano' })
      .eq('id', conversaId)
  } else {
    const { data: nova, error } = await supabase
      .from('wa_conversas')
      .insert({ telefone, filial_id: ctx.filialId, status: 'humano' })
      .select('id')
      .single()
    if (error || !nova) throw new Error(`criar conversa: ${error?.message}`)
    conversaId = nova.id as string
  }

  const { data: gravada, error: erroMsg } = await supabase
    .from('wa_mensagens')
    .insert({
      conversa_id: conversaId,
      direcao: 'saida',
      conteudo: norm.conteudo,
      tipo: norm.tipo,
      wa_message_id: eco.id ?? null,
      media_mime: norm.media?.mime ?? null,
      media_nome: norm.media?.nome ?? null,
    })
    .select('id')
    .single()

  if (erroMsg) {
    if (erroMsg.code === '23505') return
    throw new Error(`gravar eco: ${erroMsg.message}`)
  }

  try {
    await gravarMidia(gravada.id, norm, `${ctx.filialId}/${conversaId}`, ctx)
  } catch (err) {
    console.error('[WA webhook] mídia do eco', eco.id, err)
  }
}

// Estados que podem anteceder cada um: os avisos chegam fora de ordem e um
// "delivered" atrasado não pode apagar um "read".
const STATUS_ANTERIORES: Record<string, string[]> = {
  sent: [],
  delivered: ['sent'],
  read: ['sent', 'delivered'],
}

/**
 * Grava na mensagem enviada o estado de entrega avisado pelo provedor.
 * `ids` são os identificadores pelos quais a mensagem pode estar guardada
 * (a YCloud informa o id dela e o id do WhatsApp).
 */
export async function registrarStatus(
  ids: string[],
  status: string | undefined,
  erro: { codigo?: string | number; motivo?: string } | null,
  supabase: SupabaseClient
): Promise<void> {
  if (ids.length === 0 || !status) return

  if (status === 'failed') {
    console.warn('[WA webhook] entrega falhou', erro)
    const { error } = await supabase
      .from('wa_mensagens')
      .update({
        status_entrega: 'failed',
        erro_entrega: erro ? `${erro.codigo ?? ''} ${erro.motivo ?? ''}`.trim() || null : null,
      })
      .in('wa_message_id', ids)
    if (error) console.error('[WA webhook] gravar status', error.message)
    return
  }

  const anteriores = STATUS_ANTERIORES[status]
  if (!anteriores) return
  const { error } = await supabase
    .from('wa_mensagens')
    .update({ status_entrega: status })
    .in('wa_message_id', ids)
    .or(['status_entrega.is.null', ...anteriores.map(s => `status_entrega.eq.${s}`)].join(','))
  if (error) console.error('[WA webhook] gravar status', error.message)
}
