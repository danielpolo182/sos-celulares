// src/lib/whatsapp/media.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { META_API, WaConfigMeta } from './send'

export const WA_MEDIA_BUCKET = 'wa-media'

// Acima disso o download não cabe com folga no tempo/memória da função serverless
const MAX_BYTES = 25 * 1024 * 1024

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

export type MidiaSalva = { path: string; mime: string }

/**
 * Baixa um arquivo e guarda no bucket privado. Os links dos provedores expiram
 * (minutos a dias), por isso o arquivo é persistido do nosso lado.
 * Retorna null se não conseguir (a mensagem continua registrada, só sem o arquivo).
 */
async function baixarParaBucket(
  url: string,
  headers: Record<string, string>,
  mimeInformado: string | null | undefined,
  destino: { pasta: string; nome: string },
  supabase: SupabaseClient
): Promise<MidiaSalva | null> {
  const res = await fetch(url, { headers })
  if (!res.ok) {
    console.error('[WA media] download', destino.nome, res.status)
    return null
  }
  const tamanho = Number(res.headers.get('content-length') ?? 0)
  if (tamanho > MAX_BYTES) {
    console.error('[WA media] arquivo grande demais', destino.nome, tamanho)
    return null
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_BYTES) {
    console.error('[WA media] arquivo grande demais', destino.nome, buffer.length)
    return null
  }

  // "audio/ogg; codecs=opus" -> "audio/ogg"
  const mime = (mimeInformado ?? res.headers.get('content-type') ?? 'application/octet-stream')
    .split(';')[0]
    .trim()
  const path = `${destino.pasta}/${destino.nome}.${EXT_POR_MIME[mime] ?? 'bin'}`

  const { error } = await supabase.storage
    .from(WA_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: true })
  if (error) {
    console.error('[WA media] upload', destino.nome, error.message)
    return null
  }
  return { path, mime }
}

/** Mídia recebida direto da Cloud API da Meta: resolve o media id em uma URL temporária e baixa. */
export async function baixarESalvarMidia(
  config: WaConfigMeta,
  mediaId: string,
  pasta: string,
  supabase: SupabaseClient
): Promise<MidiaSalva | null> {
  const auth = { Authorization: `Bearer ${config.access_token}` }

  const metaRes = await fetch(`${META_API}/${mediaId}`, { headers: auth })
  if (!metaRes.ok) {
    console.error('[WA media] metadados', mediaId, await metaRes.text())
    return null
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
  if (!meta.url) {
    console.error('[WA media] metadados sem url', mediaId)
    return null
  }
  return baixarParaBucket(meta.url, auth, meta.mime_type, { pasta, nome: mediaId }, supabase)
}

/** Mídia recebida pela YCloud: o evento já traz o link de download. */
export async function baixarESalvarMidiaYCloud(
  apiKey: string,
  midia: { link: string; id: string; mime: string | null },
  pasta: string,
  supabase: SupabaseClient
): Promise<MidiaSalva | null> {
  // A chave só acompanha o pedido quando o link é mesmo da YCloud
  let headers: Record<string, string> = {}
  try {
    if (new URL(midia.link).hostname === 'api.ycloud.com') headers = { 'X-API-Key': apiKey }
  } catch {
    console.error('[WA media] link inválido', midia.id)
    return null
  }
  return baixarParaBucket(midia.link, headers, midia.mime, { pasta, nome: midia.id }, supabase)
}
