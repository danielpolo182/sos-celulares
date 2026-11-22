// src/lib/whatsapp/botRegras.ts
// Convivência entre o agente de IA e os atendentes: o agente responde primeiro
// e se cala na conversa por um tempo sempre que alguém da loja escreve.
import { SupabaseClient } from '@supabase/supabase-js'
import { variantesDeTelefone } from './send'

/** Guardado em wa_config.bot_config. */
/** Modelos que a loja pode escolher para o agente, do mais rápido ao mais capaz. */
export const MODELOS_DO_AGENTE = [
  { id: 'claude-haiku-5-5', rotulo: 'Haiku 5.5 · mais rápido e de menor custo' },
  { id: 'claude-sonnet-5-5', rotulo: 'Sonnet 5.5 · mais capaz em conversa difícil' },
  { id: 'claude-opus-5-5', rotulo: 'Opus 5.5 · o mais capaz, maior custo' },
] as const

export type ConfigBot = {
  /** Nome com que o agente se apresenta ao cliente; vazio = apresentação genérica. */
  nome: string
  /** Modelo de IA do agente; vazio = o padrão do sistema. */
  modelo: string
  /** Texto livre com o que o agente pode informar sem consultar: pagamento, prazos, agendamento. */
  informacoes: string
  /** Minutos em que o agente fica calado depois de uma resposta da loja. */
  pausa_min: number
  /** Se houver números aqui, o agente só responde a eles (modo de teste). */
  numeros_teste: string[]
  /** WhatsApp de quem o agente consulta quando não sabe responder; vazio desliga as consultas. */
  dono_telefone: string
  /** Minutos que o agente espera a resposta do responsável antes de avisar o cliente e marcar a conversa como pendente. */
  consulta_timeout_min: number
  /** Dias em que uma resposta do responsável continua valendo para perguntas iguais. */
  conhecimento_validade_dias: number
  /**
   * Textos que o próprio aplicativo WhatsApp Business envia sozinho (saudação,
   * ausência). Chegam como mensagem da loja, mas não são alguém assumindo a conversa.
   */
  mensagens_automaticas: string[]
}

export const BOT_PADRAO: ConfigBot = {
  nome: '',
  modelo: '',
  informacoes: '',
  pausa_min: 120,
  numeros_teste: [],
  dono_telefone: '',
  consulta_timeout_min: 30,
  conhecimento_validade_dias: 30,
  mensagens_automaticas: [],
}

const comDDI = (n: string) => (n.startsWith('55') && n.length >= 12 ? n : `55${n}`)

export function lerConfigBot(bruto: unknown): ConfigBot {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const inteiro = (valor: unknown, padrao: number) => {
    const n = Number(valor)
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : padrao
  }
  const numeros = Array.isArray(b.numeros_teste)
    ? b.numeros_teste.map(n => String(n).replace(/\D/g, '')).filter(n => n.length >= 10)
    : []
  const dono = String(b.dono_telefone ?? '').replace(/\D/g, '')
  return {
    nome: String(b.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 30),
    modelo: MODELOS_DO_AGENTE.some(m => m.id === b.modelo) ? String(b.modelo) : '',
    informacoes: String(b.informacoes ?? '').trim().slice(0, 4000),
    pausa_min: inteiro(b.pausa_min, BOT_PADRAO.pausa_min),
    numeros_teste: [...new Set(numeros)],
    dono_telefone: dono.length >= 10 ? dono : '',
    consulta_timeout_min: inteiro(b.consulta_timeout_min, BOT_PADRAO.consulta_timeout_min),
    conhecimento_validade_dias: inteiro(b.conhecimento_validade_dias, BOT_PADRAO.conhecimento_validade_dias),
    mensagens_automaticas: Array.isArray(b.mensagens_automaticas)
      ? b.mensagens_automaticas.map(m => String(m).trim()).filter(m => m.length >= 3)
      : [],
  }
}

// Compara ignorando maiúsculas, acentos, pontuação e espaços a mais
const simplificar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function ehMensagemAutomatica(texto: string, config: ConfigBot): boolean {
  const t = simplificar(texto)
  return t.length > 0 && config.mensagens_automaticas.some(m => simplificar(m) === t)
}

/** Compara dois telefones aceitando DDI ausente e o nono dígito a mais ou a menos. */
export function mesmoTelefone(a: string, b: string): boolean {
  const da = a.replace(/\D/g, ''), db = b.replace(/\D/g, '')
  if (da.length < 10 || db.length < 10) return false
  const formas = new Set(variantesDeTelefone(comDDI(da)))
  return variantesDeTelefone(comDDI(db)).some(v => formas.has(v))
}

/** Converte "41 98703-3569, 41 99999-0000" na lista de números só com dígitos. */
export function lerNumerosDeTeste(texto: string): string[] {
  return [...new Set(texto.split(/[,;\n]+/).map(n => n.replace(/\D/g, '')).filter(n => n.length >= 10))]
}


/** Sem números de teste, vale para todos; com eles, só para quem está na lista (com ou sem o nono dígito). */
export function numeroLiberadoParaBot(telefone: string, config: ConfigBot): boolean {
  if (config.numeros_teste.length === 0) return true
  const formas = new Set(variantesDeTelefone(comDDI(telefone.replace(/\D/g, ''))))
  return config.numeros_teste.some(n => variantesDeTelefone(comDDI(n)).some(v => formas.has(v)))
}

export async function carregarConfigBot(supabase: SupabaseClient, filialId: string): Promise<ConfigBot | null> {
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

// Resposta da loja que chega até este tempo depois da mensagem do cliente é automática
const RESPOSTA_INSTANTANEA_MS = 6000
const ESPERA_PELO_EVENTO_DO_CLIENTE_MS = 1500

/**
 * Mensagem enviada pelo aplicativo do celular. Pausa o agente, a não ser que
 * seja uma das mensagens automáticas do aplicativo cadastradas pela loja.
 */
export async function pausarBotPorMensagemDoApp(supabase: SupabaseClient, filialId: string, conversaId: string, texto: string): Promise<void> {
  const config = await carregarConfigBot(supabase, filialId)
  if (!config || ehMensagemAutomatica(texto, config)) return

  // Saudação e mensagem de ausência saem do aplicativo no mesmo instante em que
  // o cliente escreve; ninguém digita uma resposta nesse tempo. A espera cobre o
  // caso de os dois eventos chegarem juntos e o do cliente ainda não estar gravado.
  await new Promise(r => setTimeout(r, ESPERA_PELO_EVENTO_DO_CLIENTE_MS))
  const { data } = await supabase
    .from('wa_mensagens')
    .select('criado_em')
    .eq('conversa_id', conversaId)
    .eq('direcao', 'entrada')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  const desdeOCliente = data ? Date.now() - new Date(data.criado_em as string).getTime() : Infinity
  if (desdeOCliente < RESPOSTA_INSTANTANEA_MS + ESPERA_PELO_EVENTO_DO_CLIENTE_MS) return

  if (await pareceMensagemAutomatica(supabase, conversaId, texto)) return

  await pausarBot(supabase, filialId, conversaId)
}

const TAMANHO_MINIMO_DE_TEXTO_AUTOMATICO = 40
const DIAS_PARA_RECONHECER_TEXTO_AUTOMATICO = 14

/**
 * A mensagem de ausência do aplicativo nem sempre sai no mesmo instante da
 * mensagem do cliente, e então escapava da regra acima e calava o agente por
 * horas. Um texto longo que já saiu idêntico em outras duas conversas não foi
 * digitado por ninguém. Textos curtos ("ok", "está pronto") ficam de fora:
 * esses um atendente repete de verdade.
 */
async function pareceMensagemAutomatica(supabase: SupabaseClient, conversaId: string, texto: string): Promise<boolean> {
  const limpo = texto.trim()
  if (limpo.length < TAMANHO_MINIMO_DE_TEXTO_AUTOMATICO) return false
  const { data, error } = await supabase
    .from('wa_mensagens')
    .select('conversa_id')
    .eq('direcao', 'saida')
    .eq('conteudo', limpo)
    .neq('conversa_id', conversaId)
    .gte('criado_em', new Date(Date.now() - DIAS_PARA_RECONHECER_TEXTO_AUTOMATICO * 86_400_000).toISOString())
    .limit(50)
  if (error) return false
  return new Set((data ?? []).map(m => m.conversa_id)).size >= 2
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
  return (await motivoDoSilencio(supabase, filialId, conversaId, telefone, statusDaConversa)) === null
}

/** Por que o agente não deve responder a esta mensagem; null quando ele deve responder. */
export async function motivoDoSilencio(
  supabase: SupabaseClient,
  filialId: string,
  conversaId: string,
  telefone: string,
  statusDaConversa: string
): Promise<string | null> {
  const antigo = statusDaConversa === 'bot' ? null : 'regras do agente não instaladas no banco e a conversa não está marcada como "bot"'
  const config = await carregarConfigBot(supabase, filialId)
  if (!config) return antigo
  if (!numeroLiberadoParaBot(telefone, config)) return 'o número não está em "Números de teste"'

  const { data, error } = await supabase.from('wa_conversas').select('bot_pausado_ate').eq('id', conversaId).maybeSingle()
  if (error) return antigo
  const ate = data?.bot_pausado_ate as string | null | undefined
  if (ate && new Date(ate).getTime() > Date.now()) {
    if (pausaEhManual(ate)) return 'agente pausado nesta conversa pelo botão'
    const hora = new Date(ate).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    return 'agente pausado nesta conversa até ' + hora + ' (alguém da loja respondeu)'
  }
  return null
}
