// src/lib/whatsapp/media.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { META_API, WaConfig } from './send'

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

/**
 * Baixa uma mídia recebida pela Cloud API e guarda no bucket privado.
 * A URL da Meta expira em minutos e o media id em ~30 dias, por isso persistimos o arquivo.
 * Retorna null se não conseguir (a mensagem continua registrada, só sem o arquivo).
 */
export async function baixarESalvarMidia(
  config: WaConfig,
  mediaId: string,
  pasta: string,
  supabase: SupabaseClient
): Promise<{ path: string; mime: string } | null> {
  const auth = { Authorization: `Bearer ${config.access_token}` }

  const metaRes = await fetch(`${META_API}/${mediaId}`, { headers: auth })
  if (!metaRes.ok) {
    console.error('[WA media] metadados', mediaId, await metaRes.text())
    return null
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number }
  if (!meta.url) return null
  if ((meta.file_size ?? 0) > MAX_BYTES) {
    console.error('[WA media] arquivo grande demais', mediaId, meta.file_size)
    return null
  }

  const binRes = await fetch(meta.url, { headers: auth })
  if (!binRes.ok) {
    console.error('[WA media] download', mediaId, binRes.status)
    return null
  }
  const buffer = Buffer.from(await binRes.arrayBuffer())

  // "audio/ogg; codecs=opus" -> "audio/ogg"
  const mime = (meta.mime_type ?? binRes.headers.get('content-type') ?? 'application/octet-stream')
    .split(';')[0]
    .trim()
  const path = `${pasta}/${mediaId}.${EXT_POR_MIME[mime] ?? 'bin'}`

  const { error } = await supabase.storage
    .from(WA_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: true })
  if (error) {
    console.error('[WA media] upload', mediaId, error.message)
    return null
  }
  return { path, mime }
}
