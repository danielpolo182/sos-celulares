// src/lib/whatsapp/precos.ts
// Tabela de preços da loja (wa_precos): o que o agente pode informar ao cliente
// sem consultar o responsável. Usado pelo agente e pela tela de edição.
import { SupabaseClient } from '@supabase/supabase-js'
import { nomeBaseDoModelo } from '@/lib/fornecedores'

export type Preco = {
  id: string
  servico: string
  modelo: string
  opcao: string | null
  preco: number
  observacao: string | null
  atualizado_em: string
}

export const SERVICOS_SUGERIDOS = ['Troca de tela', 'Troca de bateria', 'Troca de conector de carga']

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Agrupa as várias formas de pedir o mesmo serviço: "trocar o display", "tela quebrada", "frontal"… */
export function categoriaDoServico(servico: string): string {
  const s = semAcento(servico)
  if (/\b(tela|display|frontal|visor|touch|vidro)\b/.test(s)) return 'tela'
  if (/\bbateria\b/.test(s)) return 'bateria'
  if (/\b(conector|carga|carregamento|carregar|carregador)\b/.test(s)) return 'conector'
  // Serviços fora das três categorias comparam pelo texto inteiro, sem as palavras de enchimento
  return s.replace(/\b(troca|trocar|conserto|consertar|reparo|reparar|de|da|do|o|a)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
}

const geracao = (modelo: string) => {
  const m = semAcento(modelo)
  return /\b5g\b/.test(m) ? '5g' : /\b4g\b/.test(m) ? '4g' : null
}

/** "Samsung Galaxy A54 5G" e "A54" são o mesmo aparelho; "A54 4G" e "A54 5G", não. */
export function mesmoModelo(a: string, b: string): boolean {
  const baseA = nomeBaseDoModelo(a), baseB = nomeBaseDoModelo(b)
  if (!baseA || baseA !== baseB) return false
  const ga = geracao(a), gb = geracao(b)
  return !ga || !gb || ga === gb
}

const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

/** Ferramenta do agente: preços cadastrados para o serviço naquele modelo. */
export async function consultarTabelaDePrecos(supabase: SupabaseClient, filialId: string, modelo: string, servico: string): Promise<string> {
  if (!modelo.trim() || !servico.trim()) return 'Informe o modelo do aparelho e o serviço.'

  const { data, error } = await supabase
    .from('wa_precos')
    .select('servico, modelo, opcao, preco, observacao')
    .eq('filial_id', filialId)
    .limit(5000)
  // Tabela ausente (migração não rodada) ou vazia: o agente segue pelo caminho da consulta
  if (error) return 'A tabela de preços não está disponível. Siga para as respostas anteriores do responsável.'

  const categoria = categoriaDoServico(servico)
  const linhas = (data ?? []).filter(p => categoriaDoServico(p.servico as string) === categoria && mesmoModelo(p.modelo as string, modelo))
  if (linhas.length === 0) return `Não há preço na tabela da loja para "${servico}" no modelo "${modelo}". Siga para as respostas anteriores do responsável.`

  linhas.sort((x, y) => Number(x.preco) - Number(y.preco))
  return `Tabela de preços da loja — ${servico}, ${modelo}. São preços ao cliente; informe as opções e diga que são estimativas sujeitas à avaliação do aparelho:\n` +
    linhas.map(p => `- ${p.opcao?.trim() || 'Preço'}: ${reais(Number(p.preco))}${p.observacao?.trim() ? ` (${p.observacao.trim()})` : ''}`).join('\n')
}

export type LinhaColada = { servico: string; modelo: string; opcao: string | null; preco: number; observacao: string | null }

/**
 * Lê linhas coladas de uma planilha ou de um texto, uma por linha, com os
 * campos separados por ponto e vírgula ou tabulação:
 *   modelo; serviço; opção; preço; observação
 * Devolve as linhas válidas e as que não deu para entender.
 */
export function lerLinhasColadas(texto: string): { linhas: LinhaColada[]; erros: string[] } {
  const linhas: LinhaColada[] = []
  const erros: string[] = []
  for (const bruta of texto.split(/\r?\n/)) {
    if (!bruta.trim()) continue
    const campos = bruta.split(/[;\t]/).map(c => c.trim())
    const [modelo, servico, opcao, precoTxt, observacao] = campos
    // "R$ 1.250,00", "250", "250,5" → número
    const limpo = (precoTxt ?? '').replace(/[^\d.,]/g, '')
    const preco = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
    if (!modelo || !servico || !limpo || !Number.isFinite(preco) || preco <= 0) { erros.push(bruta.trim()); continue }
    linhas.push({ modelo, servico, opcao: opcao || null, preco, observacao: observacao || null })
  }
  return { linhas, erros }
}
