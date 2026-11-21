// src/lib/whatsapp/transcricao.ts
// Transcrição dos áudios recebidos. O modelo de IA do agente não aceita áudio,
// então o áudio vira texto antes: aparece no Inbox e é o que o agente lê.
// Usa um serviço com a API de transcrição no formato da OpenAI (a Groq usa o mesmo).
import { SupabaseClient } from '@supabase/supabase-js'
import { WA_MEDIA_BUCKET } from './media'

const MAX_BYTES = 20 * 1024 * 1024
const TEMPO_LIMITE_MS = 25_000

type Servico = { url: string; modelo: string; chave: string }

function servico(): Servico | null {
  const chave = process.env.TRANSCRICAO_API_KEY
  if (!chave) return null
  // O prefixo da chave diz de quem ela é; as variáveis opcionais permitem trocar de serviço sem mexer no código
  const groq = chave.startsWith('gsk_')
  return {
    chave,
    url: process.env.TRANSCRICAO_API_URL || (groq ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.openai.com/v1/audio/transcriptions'),
    modelo: process.env.TRANSCRICAO_MODELO || (groq ? 'whisper-large-v3-turbo' : 'whisper-1'),
  }
}

export const transcricaoConfigurada = () => servico() !== null

const EXTENSAO: Record<string, string> = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/wav': 'wav' }

/** Texto falado no áudio; null se não houver serviço configurado ou se a transcrição falhar. */
export async function transcreverAudio(bytes: ArrayBuffer, mime: string): Promise<string | null> {
  const s = servico()
  if (!s || bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null

  // "audio/ogg; codecs=opus" → "audio/ogg"
  const tipo = mime.split(';')[0].trim()
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: tipo }), `audio.${EXTENSAO[tipo] ?? 'ogg'}`)
  form.append('model', s.modelo)
  form.append('language', 'pt')
  form.append('response_format', 'json')

  try {
    const res = await fetch(s.url, { method: 'POST', headers: { Authorization: `Bearer ${s.chave}` }, body: form, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
    if (!res.ok) {
      console.error('[WA transcrição]', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const json = await res.json() as { text?: string }
    return json.text?.trim() || null
  } catch (e) {
    console.error('[WA transcrição]', e instanceof Error ? e.message : e)
    return null
  }
}

// Prefixo que marca, no texto da mensagem, que ele veio de um áudio
export const MARCA_DE_AUDIO = '🎤 '

/**
 * Transcreve o áudio de uma mensagem já salva e grava o texto nela.
 * Devolve a transcrição, ou null se não foi possível.
 */
export async function transcreverMensagemDeAudio(supabase: SupabaseClient, mensagemId: string): Promise<string | null> {
  if (!transcricaoConfigurada()) return null
  const { data: msg } = await supabase.from('wa_mensagens').select('media_path, media_mime').eq('id', mensagemId).maybeSingle()
  if (!msg?.media_path) return null

  const { data: arquivo, error } = await supabase.storage.from(WA_MEDIA_BUCKET).download(msg.media_path as string)
  if (error || !arquivo) {
    console.error('[WA transcrição] baixar áudio', error?.message)
    return null
  }
  const texto = await transcreverAudio(await arquivo.arrayBuffer(), (msg.media_mime as string | null) ?? 'audio/ogg')
  if (!texto) return null

  await supabase.from('wa_mensagens').update({ conteudo: `${MARCA_DE_AUDIO}${texto}` }).eq('id', mensagemId)
  return texto
}
