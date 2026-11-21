// src/lib/whatsapp/orcamento.ts
// Orçamento automático: consulta as peças nos fornecedores, agrupa por tipo
// (LCD, OLED, Soft OLED…), escolhe um custo de referência por tipo e aplica a
// regra de margem da loja. O cliente recebe só tipo e preço, sem marca.
import { Fornecedor, PecaFornecedor, TipoPeca, buscarPecasParaModelo } from '@/lib/fornecedores'

export type RegraDoServico = {
  /** Enquanto desligada, o agente não calcula preço para este serviço e consulta o responsável. */
  ativo: boolean
  multiplicador: number
  fixo: number
  minimo: number
}

export type TipoDeTela = { rotulo: string; palavras: string[] }

/** Guardado em wa_config.precificacao. */
export type ConfigPrecos = {
  regras: Record<TipoPeca, RegraDoServico>
  /** O preço sobe para o próximo múltiplo deste valor (1 = sem arredondar). */
  arredondar: number
  /** Entre as marcas de um mesmo tipo, qual custo vale. */
  custo: 'menor' | 'meio' | 'maior'
  /** Quando há tela com aro e sem aro do mesmo tipo. */
  aro: 'mais_barato' | 'sem' | 'com' | 'ambos'
  /** Em ordem de prioridade: a primeira lista de palavras que aparecer no nome da peça define o tipo. */
  tipos: TipoDeTela[]
  /** Tipo das telas cujo nome não traz nenhuma das palavras acima. */
  tipoPadrao: string
}

const REGRA_DESLIGADA: RegraDoServico = { ativo: false, multiplicador: 1, fixo: 0, minimo: 0 }

export const PRECOS_PADRAO: ConfigPrecos = {
  regras: { tela: { ...REGRA_DESLIGADA }, bateria: { ...REGRA_DESLIGADA }, conector: { ...REGRA_DESLIGADA } },
  arredondar: 10,
  custo: 'meio',
  aro: 'mais_barato',
  tipos: [
    { rotulo: 'Soft OLED com mensagem genuína', palavras: ['nao precisa trocar eprom'] },
    { rotulo: 'Original', palavras: ['nacional', 'genuina'] },
    { rotulo: 'Soft OLED', palavras: ['soft oled'] },
    { rotulo: 'OLED', palavras: ['oled', 'amoled'] },
    { rotulo: 'LCD', palavras: ['lcd', 'incell'] },
  ],
  tipoPadrao: 'LCD',
}

const numero = (v: unknown, padrao: number, minimo = 0) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= minimo ? n : padrao
}

/** Lê o JSON do banco tolerando campos ausentes ou inválidos. */
export function lerConfigPrecos(bruto: unknown): ConfigPrecos {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const regrasBrutas = (b.regras && typeof b.regras === 'object' ? b.regras : {}) as Record<string, Record<string, unknown> | undefined>
  const regra = (t: TipoPeca): RegraDoServico => {
    const r = regrasBrutas[t] ?? {}
    return { ativo: r.ativo === true, multiplicador: numero(r.multiplicador, 1, 0.01), fixo: numero(r.fixo, 0), minimo: numero(r.minimo, 0) }
  }
  const tipos = Array.isArray(b.tipos)
    ? (b.tipos as Record<string, unknown>[])
        .map(t => ({ rotulo: String(t?.rotulo ?? '').trim(), palavras: Array.isArray(t?.palavras) ? t.palavras.map(p => String(p).trim()).filter(Boolean) : [] }))
        .filter(t => t.rotulo && t.palavras.length > 0)
    : []
  return {
    regras: { tela: regra('tela'), bateria: regra('bateria'), conector: regra('conector') },
    arredondar: numero(b.arredondar, PRECOS_PADRAO.arredondar, 1),
    custo: b.custo === 'menor' || b.custo === 'maior' ? b.custo : 'meio',
    aro: b.aro === 'sem' || b.aro === 'com' || b.aro === 'ambos' ? b.aro : 'mais_barato',
    tipos: tipos.length > 0 ? tipos : PRECOS_PADRAO.tipos,
    tipoPadrao: String(b.tipoPadrao ?? '').trim() || PRECOS_PADRAO.tipoPadrao,
  }
}

const simples = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')

export function tipoDaTela(nomeDaPeca: string, config: ConfigPrecos): string {
  const nome = simples(nomeDaPeca)
  return config.tipos.find(t => t.palavras.some(p => nome.includes(simples(p))))?.rotulo ?? config.tipoPadrao
}

export type Aro = 'com' | 'sem' | null

export function aroDaPeca(nomeDaPeca: string): Aro {
  const nome = simples(nomeDaPeca)
  if (/\b(sem aro|s\/ ?aro)\b/.test(nome)) return 'sem'
  if (/\b(com aro|c\/ ?aro)\b/.test(nome)) return 'com'
  return null
}

export function precoPelaRegra(custo: number, regra: RegraDoServico, arredondar: number): number {
  const bruto = custo * regra.multiplicador + regra.fixo
  const multiplo = arredondar > 0 ? arredondar : 1
  // A folga evita que 250,0000001 suba para 260 por erro de ponto flutuante
  const arredondado = Math.ceil((bruto - 1e-6) / multiplo) * multiplo
  return Math.max(regra.minimo, arredondado)
}

function custoDeReferencia(precos: number[], criterio: ConfigPrecos['custo']): number {
  const ordenados = [...precos].sort((a, b) => a - b)
  if (criterio === 'menor') return ordenados[0]
  if (criterio === 'maior') return ordenados[ordenados.length - 1]
  // Valor do meio; com quantidade par fica o mais barato dos dois centrais, que é o preço de uma peça real
  return ordenados[Math.floor((ordenados.length - 1) / 2)]
}

export type OpcaoDeOrcamento = {
  tipo: string
  aro: Aro
  custo: number
  preco: number
  pecas: PecaFornecedor[]
}

export type Orcamento = {
  modelo: string
  servico: TipoPeca
  regraAtiva: boolean
  opcoes: OpcaoDeOrcamento[]
  falhas: Fornecedor[]
}

const NOME_DO_SERVICO: Record<TipoPeca, string> = { tela: 'Troca de tela', bateria: 'Troca de bateria', conector: 'Troca de conector de carga' }
const ROTULO_UNICO: Record<TipoPeca, string> = { tela: 'Tela', bateria: 'Bateria', conector: 'Conector de carga' }

/** Agrupa as peças encontradas e calcula uma opção por tipo. Não faz consulta: recebe as peças prontas. */
export function calcularOpcoes(pecas: PecaFornecedor[], servico: TipoPeca, config: ConfigPrecos): OpcaoDeOrcamento[] {
  const regra = config.regras[servico]
  const grupos = new Map<string, PecaFornecedor[]>()
  for (const p of pecas) {
    const tipo = servico === 'tela' ? tipoDaTela(p.nome, config) : ROTULO_UNICO[servico]
    grupos.set(tipo, [...(grupos.get(tipo) ?? []), p])
  }

  const opcoes: OpcaoDeOrcamento[] = []
  for (const [tipo, doTipo] of grupos) {
    // Só tela tem a distinção de aro; nos outros serviços é um grupo só
    const porAro = new Map<Aro, PecaFornecedor[]>()
    for (const p of doTipo) {
      const aro = servico === 'tela' ? aroDaPeca(p.nome) : null
      porAro.set(aro, [...(porAro.get(aro) ?? []), p])
    }
    let candidatos = [...porAro.entries()].map(([aro, lista]) => ({ aro, lista, custo: custoDeReferencia(lista.map(x => x.preco), config.custo) }))
    if (candidatos.length > 1 && config.aro !== 'ambos') {
      const preferido = config.aro === 'mais_barato' ? undefined : candidatos.find(c => c.aro === config.aro)
      candidatos = [preferido ?? candidatos.reduce((a, b) => (b.custo < a.custo ? b : a))]
    }
    for (const c of candidatos) {
      opcoes.push({ tipo, aro: c.aro, custo: c.custo, preco: precoPelaRegra(c.custo, regra, config.arredondar), pecas: [...c.lista].sort((a, b) => a.preco - b.preco) })
    }
  }
  return opcoes.sort((a, b) => a.preco - b.preco)
}

/** Consulta os fornecedores e monta o orçamento do modelo para o serviço. */
export async function montarOrcamento(modelo: string, servico: TipoPeca, config: ConfigPrecos): Promise<Orcamento> {
  const { pecas, falhas } = await buscarPecasParaModelo(modelo, servico)
  return { modelo, servico, regraAtiva: config.regras[servico].ativo, opcoes: calcularOpcoes(pecas, servico, config), falhas }
}

const reais = (v: number) => `R$ ${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')}`
const rotuloDaOpcao = (o: OpcaoDeOrcamento) => (o.aro ? `${o.tipo} ${o.aro} aro` : o.tipo)

/** A mensagem como o cliente a receberia; o agente pode ajustar a redação, não os tipos nem os valores. */
export function mensagemDoOrcamento(o: Orcamento): string {
  if (o.opcoes.length === 0) return ''
  return `${NOME_DO_SERVICO[o.servico]}, ${o.modelo} (valores estimados, sujeitos à avaliação do aparelho):\n` +
    o.opcoes.map(x => `• ${rotuloDaOpcao(x)}: ${reais(x.preco)}`).join('\n')
}

/** Texto devolvido ao agente pela ferramenta montar_orcamento. */
export function orcamentoParaOAgente(o: Orcamento): string {
  if (!o.regraAtiva) return `A loja ainda não definiu regra de preço para ${NOME_DO_SERVICO[o.servico].toLowerCase()}. Siga para as respostas anteriores do responsável.`
  if (o.opcoes.length === 0) {
    const semResposta = o.falhas.length ? ` (fornecedor sem resposta: ${o.falhas.join(', ')})` : ''
    return `Nenhuma peça encontrada nos fornecedores para ${o.modelo}${semResposta}. Confirme o modelo exato com o cliente; se estiver certo, siga para as respostas anteriores do responsável.`
  }
  return 'Preços ao cliente calculados pela regra da loja. Informe exatamente estas opções e valores, sem citar marca nem fornecedor, e diga que são estimativas sujeitas à avaliação do aparelho:\n' +
    o.opcoes.map(x => `- ${rotuloDaOpcao(x)}: ${reais(x.preco)}`).join('\n')
}

/**
 * Deriva multiplicador e valor fixo a partir de exemplos "custo → preço que eu
 * cobraria" (reta de mínimos quadrados). Com um exemplo só, assume valor fixo zero.
 */
export function regraPelosExemplos(exemplos: { custo: number; preco: number }[]): { multiplicador: number; fixo: number } | null {
  const validos = exemplos.filter(e => e.custo > 0 && e.preco > 0)
  if (validos.length === 0) return null
  if (validos.length === 1) return { multiplicador: Math.round((validos[0].preco / validos[0].custo) * 100) / 100, fixo: 0 }
  const n = validos.length
  const mx = validos.reduce((s, e) => s + e.custo, 0) / n
  const my = validos.reduce((s, e) => s + e.preco, 0) / n
  const sxx = validos.reduce((s, e) => s + (e.custo - mx) ** 2, 0)
  if (sxx === 0) return null
  const m = validos.reduce((s, e) => s + (e.custo - mx) * (e.preco - my), 0) / sxx
  // Valor fixo negativo não faz sentido para mão de obra: nesse caso a regra vira só multiplicador
  const fixo = my - m * mx
  if (m <= 0) return null
  if (fixo < 0) return { multiplicador: Math.round((my / mx) * 100) / 100, fixo: 0 }
  return { multiplicador: Math.round(m * 100) / 100, fixo: Math.round(fixo) }
}
