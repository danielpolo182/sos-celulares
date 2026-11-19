// src/lib/whatsapp/notify.ts
// Envio dos avisos automáticos de OS (modelos aprovados do WhatsApp).
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendTemplate, variantesDeTelefone, WaConfig } from './send'
import { buscarConfigEnvio } from './config'
import {
  AvisoOS, ConfigAvisos, DadosAviso, MODELOS_AVISO,
  lerConfigAvisos, parametrosDoAviso, textoDoAviso,
} from './avisos'

const FUSO = 'America/Sao_Paulo'
const DIA_MS = 86_400_000
// Reenvio do aviso de "pronta" só depois deste intervalo: cobre troca de status por engano
const INTERVALO_REAVISO_PRONTA_MS = 12 * 60 * 60 * 1000

export const COLUNAS_OS_AVISO =
  'id, numero, status, marca, modelo, valor_final, valor_orcamento, desconto, pago, created_at, filial_id, pronta_em, wa_avisos, clientes(nome, telefone)'

export type OsParaAviso = {
  id: string
  numero: number
  status: string
  marca: string | null
  modelo: string | null
  valor_final: number | null
  valor_orcamento: number | null
  desconto: number | null
  pago: boolean | null
  created_at: string
  filial_id: string
  pronta_em: string | null
  wa_avisos: Record<string, string> | null
  // O Supabase devolve a relação como objeto ou como lista de um item
  clientes: { nome: string | null; telefone: string | null } | { nome: string | null; telefone: string | null }[] | null
}

export type InfoLoja = { horario: string; taxa: string; garantiaDias: number; prazoRetiradaDias: number }

export type ContextoAviso = { supabase: SupabaseClient; envio: WaConfig; loja: InfoLoja }

export function clienteDeServico(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** null quando a coluna wa_config.avisos ainda não existe (migração não rodada) ou a filial não tem WhatsApp. */
export async function carregarConfigAvisos(supabase: SupabaseClient, filialId: string): Promise<ConfigAvisos | null> {
  const { data, error } = await supabase.from('wa_config').select('avisos').eq('filial_id', filialId).maybeSingle()
  if (error || !data) return null
  return lerConfigAvisos(data.avisos)
}

export async function carregarInfoLoja(supabase: SupabaseClient): Promise<InfoLoja> {
  const { data } = await supabase
    .from('sistema_config')
    .select('chave, valor')
    .in('chave', ['loja_horario', 'retirada_taxa_mensal', 'garantia_dias', 'retirada_prazo_dias'])
  const cfg: Record<string, string> = {}
  for (const c of data ?? []) if (c.valor) cfg[c.chave] = c.valor
  // Mesmos padrões do recibo impresso da OS
  const taxa = Number(String(cfg.retirada_taxa_mensal ?? '10').replace(',', '.'))
  return {
    horario: cfg.loja_horario ?? 'consulte a loja',
    taxa: (Number.isFinite(taxa) ? taxa : 10).toFixed(2).replace('.', ','),
    garantiaDias: parseInt(cfg.garantia_dias ?? '', 10) || 90,
    prazoRetiradaDias: parseInt(cfg.retirada_prazo_dias ?? '', 10) || 90,
  }
}

const dataBR = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: FUSO })

function valorDoServico(os: OsParaAviso): string {
  if (os.pago) return 'já pago'
  const bruto = os.valor_final ?? os.valor_orcamento
  if (bruto == null) return 'a confirmar na loja'
  const total = Math.max(0, Number(bruto) - Number(os.desconto ?? 0))
  return total > 0 ? `R$ ${total.toFixed(2).replace('.', ',')}` : 'sem custo'
}

function dadosDoAviso(os: OsParaAviso, nome: string | null, loja: InfoLoja, agora: Date): DadosAviso {
  const pronta = os.pronta_em ? new Date(os.pronta_em) : agora
  // "Samsung Galaxy A54" costuma já estar inteiro em modelo; marca só entra se faltar
  const aparelho = os.modelo?.trim() || os.marca?.trim() || 'aparelho'
  return {
    nome: nome?.trim().split(/\s+/)[0] || 'cliente',
    aparelho,
    numero: os.numero,
    valor: valorDoServico(os),
    horario: loja.horario,
    dias: Math.floor((agora.getTime() - pronta.getTime()) / DIA_MS),
    prontaDesde: dataBR(pronta),
    taxa: loja.taxa,
    garantiaAte: dataBR(new Date(agora.getTime() + loja.garantiaDias * DIA_MS)),
  }
}

async function registrarNaConversa(
  supabase: SupabaseClient,
  filialId: string,
  destino: string,
  nome: string | null,
  texto: string,
  waMessageId: string | null
) {
  const { data: existente } = await supabase
    .from('wa_conversas')
    .select('id')
    .in('telefone', variantesDeTelefone(destino))
    .eq('filial_id', filialId)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversaId = existente?.id as string | undefined
  if (!conversaId) {
    // Nasce resolvida: é só um aviso, não um atendimento esperando resposta
    const { data: nova } = await supabase
      .from('wa_conversas')
      .insert({ telefone: destino, filial_id: filialId, status: 'resolvida', nome_contato: nome })
      .select('id')
      .single()
    conversaId = nova?.id as string | undefined
  }
  if (!conversaId) return

  await supabase.from('wa_mensagens').insert({
    conversa_id: conversaId, direcao: 'saida', conteudo: texto, wa_message_id: waMessageId,
  })
}

/**
 * Envia um aviso e anota em wa_avisos (chave → data do envio, ou "erro:<data>").
 * `pular` são chaves de lembretes anteriores que ficam marcadas para não saírem depois.
 */
export async function enviarAvisoOS(
  ctx: ContextoAviso,
  os: OsParaAviso,
  aviso: AvisoOS,
  chave: string,
  pular: string[] = []
): Promise<'enviado' | 'falhou' | 'sem_telefone'> {
  const { supabase, envio, loja } = ctx
  const cliente = Array.isArray(os.clientes) ? os.clientes[0] : os.clientes
  const digitos = (cliente?.telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return 'sem_telefone'
  const destino = digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`

  const agora = new Date()
  const dados = dadosDoAviso(os, cliente?.nome ?? null, loja, agora)
  const modelo = MODELOS_AVISO[aviso].modelo

  let waMessageId: string | null = null
  let erro: string | null = null
  try {
    waMessageId = await sendTemplate(envio, destino, modelo, parametrosDoAviso(aviso, dados))
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
    console.error('[WA aviso] envio recusado', { os: os.numero, modelo, erro })
  }

  const carimbo = agora.toISOString()
  const anotacoes: Record<string, string> = { ...(os.wa_avisos ?? {}), [chave]: erro ? `erro:${carimbo}` : carimbo }
  for (const c of pular) anotacoes[c] = `pulado:${carimbo}`
  const { error: erroAnotar } = await supabase.from('ordens_servico').update({ wa_avisos: anotacoes }).eq('id', os.id)
  if (erroAnotar) console.error('[WA aviso] anotar envio', erroAnotar.message)

  try {
    await supabase.from('wa_logs').insert({
      filial_id: os.filial_id,
      tipo: 'notificacao_status',
      telefone: destino,
      mensagem: erro ? `${modelo}: ${erro}`.slice(0, 500) : modelo,
      status: erro ? 'erro' : 'enviado',
    })
    if (!erro) await registrarNaConversa(supabase, os.filial_id, destino, cliente?.nome ?? null, textoDoAviso(aviso, dados), waMessageId)
  } catch (e) {
    // Registro e histórico não podem derrubar o aviso que já saiu
    console.error('[WA aviso] registro', e)
  }

  return erro ? 'falhou' : 'enviado'
}

/** Disparo ligado a um acontecimento da OS: abertura ou mudança de status. */
export async function notificarEventoOS(osId: string, evento: 'entrada' | 'pronta' | 'entregue'): Promise<void> {
  const supabase = clienteDeServico()

  const { data, error } = await supabase.from('ordens_servico').select(COLUNAS_OS_AVISO).eq('id', osId).maybeSingle()
  // Erro aqui é o banco sem as colunas dos avisos: nada a fazer até a migração rodar
  if (error || !data) return
  let os = data as unknown as OsParaAviso

  if (evento === 'pronta') {
    // A contagem dos lembretes recomeça cada vez que a OS volta a ficar pronta
    const anotacoes = Object.fromEntries(
      Object.entries(os.wa_avisos ?? {}).filter(([c]) => !c.startsWith('lembrete_') && c !== 'ultimo_aviso')
    )
    const prontaEm = new Date().toISOString()
    await supabase.from('ordens_servico').update({ pronta_em: prontaEm, wa_avisos: anotacoes }).eq('id', os.id)
    os = { ...os, pronta_em: prontaEm, wa_avisos: anotacoes }
  }

  const config = await carregarConfigAvisos(supabase, os.filial_id)
  if (!config?.[evento]) return

  const anterior = os.wa_avisos?.[evento]
  if (anterior && !anterior.startsWith('erro:')) {
    const recente = Date.now() - new Date(anterior).getTime() < INTERVALO_REAVISO_PRONTA_MS
    if (evento !== 'pronta' || recente) return
  }

  const envio = await buscarConfigEnvio(supabase, os.filial_id)
  if (!envio) return

  await enviarAvisoOS({ supabase, envio, loja: await carregarInfoLoja(supabase) }, os, evento, evento)
}

export async function notifyStatusChange(osId: string, newStatus: string): Promise<void> {
  if (newStatus === 'pronta' || newStatus === 'entregue') await notificarEventoOS(osId, newStatus)
}
