// src/lib/whatsapp/botRegras.ts
// Convivência entre o agente de IA e os atendentes: o agente responde primeiro
// e se cala na conversa por um tempo sempre que alguém da loja escreve.
import { SupabaseClient } from '@supabase/supabase-js'
import { variantesDeTelefone } from './send'

/** Guardado em wa_config.bot_config. */
export type ConfigBot = {
  /** Minutos em que o agente fica calado depois de uma resposta da loja. */
  pausa_min: number
  /** Se houver números aqui, o agente só responde a eles (modo de teste). */
  numeros_teste: string[]
}

export const BOT_PADRAO: ConfigBot = { pausa_min: 120, numeros_teste: [] }

export function lerConfigBot(bruto: unknown): ConfigBot {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const pausa = Number(b.pausa_min)
  const numeros = Array.isArray(b.numeros_teste)
    ? b.numeros_teste.map(n => String(n).replace(/\D/g, '')).filter(n => n.length >= 10)
    : []
  return {
    pausa_min: Number.isFinite(pausa) && pausa >= 1 ? Math.round(pausa) : BOT_PADRAO.pausa_min,
    numeros_teste: [...new Set(numeros)],
  }
}

/** Converte "41 98703-3569, 41 99999-0000" na lista de números só com dígitos. */
export function lerNumerosDeTeste(texto: string): string[] {
  return [...new Set(texto.split(/[,;\n]+/).map(n => n.replace(/\D/g, '')).filter(n => n.length >= 10))]
}

const comDDI = (n: string) => (n.startsWith('55') && n.length >= 12 ? n : `55${n}`)

/** Sem números de teste, vale para todos; com eles, só para quem está na lista (com ou sem o nono dígito). */
export function numeroLiberadoParaBot(telefone: string, config: ConfigBot): boolean {
  if (config.numeros_teste.length === 0) return true
  const formas = new Set(variantesDeTelefone(comDDI(telefone.replace(/\D/g, ''))))
  return config.numeros_teste.some(n => variantesDeTelefone(comDDI(n)).some(v => formas.has(v)))
}

async function carregarConfigBot(supabase: SupabaseClient, filialId: string): Promise<ConfigBot | null> {
  const { data, error } = await supabase.from('wa_config').select('bot_config').eq('filial_id', filialId).maybeSingle()
  // Erro aqui é o banco sem a coluna (migração não rodada)
  if (error) return null
  return lerConfigBot(data?.bot_config)
}

/** Pausa sem prazo, ligada pelo botão da conversa; só termina quando alguém retoma o agente. */
export const PAUSA_MANUAL = '9999-12-31T00:00:00.000Z'

export const pausaEhManual = (ate: string | null | undefined) => !!ate && new Date(ate).getUTCFullYear() >= 9000

export const agentePausado = (ate: string | null | undefined, agora = Date.now()) =>
  !!ate && new Date(ate).getTime() > agora

/** Alguém da loja assumiu a conversa: o agente fica calado nela pelo tempo configurado. */
export async function pausarBot(supabase: SupabaseClient, filialId: string, conversaId: string): Promise<void> {
  const config = await carregarConfigBot(supabase, filialId)
  if (!config) return
  const ate = new Date(Date.now() + config.pausa_min * 60_000).toISOString()

  // Uma pausa mais longa já em vigor (a manual, por exemplo) não pode ser encurtada
  const { data, error: erroLeitura } = await supabase.from('wa_conversas').select('bot_pausado_ate').eq('id', conversaId).maybeSingle()
  if (erroLeitura) return
  const atual = data?.bot_pausado_ate as string | null | undefined
  if (atual && new Date(atual).getTime() >= new Date(ate).getTime()) return

  const { error } = await supabase.from('wa_conversas').update({ bot_pausado_ate: ate }).eq('id', conversaId)
  if (error) console.error('[WA bot] pausar', error.message)
}

/** Conversa encerrada ou agente retomado: a próxima mensagem do cliente volta a ser dele. */
export async function liberarBot(supabase: SupabaseClient, conversaId: string): Promise<boolean> {
  const { error } = await supabase.from('wa_conversas').update({ bot_pausado_ate: null }).eq('id', conversaId)
  return !error
}

/** Pausa pedida pelo atendente no botão da conversa. */
export async function pausarBotManualmente(supabase: SupabaseClient, conversaId: string): Promise<boolean> {
  const { error } = await supabase.from('wa_conversas').update({ bot_pausado_ate: PAUSA_MANUAL, status: 'humano' }).eq('id', conversaId)
  return !error
}

/**
 * Decide se o agente responde a esta mensagem. Sem a migração das regras do
 * agente, vale o comportamento antigo: só responde conversa marcada como "bot".
 */
export async function botPodeResponder(
  supabase: SupabaseClient,
  filialId: string,
  conversaId: string,
  telefone: string,
  statusDaConversa: string
): Promise<boolean> {
  const config = await carregarConfigBot(supabase, filialId)
  if (!config) return statusDaConversa === 'bot'
  if (!numeroLiberadoParaBot(telefone, config)) return false

  const { data, error } = await supabase.from('wa_conversas').select('bot_pausado_ate').eq('id', conversaId).maybeSingle()
  if (error) return statusDaConversa === 'bot'
  const ate = data?.bot_pausado_ate as string | null | undefined
  return !ate || new Date(ate).getTime() <= Date.now()
}
