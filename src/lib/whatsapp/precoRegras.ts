// src/lib/whatsapp/precoRegras.ts
// Regras de preço do orçamento automático: do custo da peça no fornecedor ao
// preço para o cliente. Só dados e contas, sem acesso a banco nem a rede, para
// servir tanto ao agente quanto à tela de Configurações.

/** Cada linha de preço que a loja pode oferecer. */
export const CHAVES_DE_REGRA = [
  'lcd_sem_aro', 'lcd_com_aro', 'lcd_iphone',
  'oled', 'oled_sem_aro', 'soft_oled', 'soft_oled_genuina', 'nacional',
  'bateria', 'bateria_genuina',
  'placa_conector', 'conector_iphone',
] as const
export type ChaveDeRegra = (typeof CHAVES_DE_REGRA)[number]

export type Faixa = { ate: number; preco: number }

export type RegraDePreco = {
  /** Desligada, a opção não entra no orçamento. */
  oferecer: boolean
  /** Entre as marcas de um mesmo tipo, qual custo vale. */
  custo: 'menor' | 'meio' | 'maior'
  /** Custo até o valor (inclusive) → preço fixo. Em ordem crescente. */
  faixas: Faixa[]
  /** Acima da última faixa: custo × mult + soma, arredondado para cima. */
  mult: number
  soma: number
  /** O preço nunca fica abaixo disto. */
  minimo: number
}

/** Guardado em wa_config.bot_config.precos. */
export type ConfigPrecos = {
  /** Desligado, o agente não calcula preço e consulta o responsável, como antes. */
  ativo: boolean
  /** O preço calculado sobe para o próximo múltiplo deste valor. */
  arredondar: number
  /** A tela "original/nacional" só entra quando custa pelo menos isto vezes a OLED do mesmo aparelho. */
  nacionalMinimoSobreOled: number
  regras: Record<ChaveDeRegra, RegraDePreco>
}

/** Como a loja e o cliente chamam cada opção. */
export const ROTULO_DA_REGRA: Record<ChaveDeRegra, { tela: string; cliente: string; servico: 'tela' | 'bateria' | 'conector' }> = {
  lcd_sem_aro: { tela: 'LCD sem aro (Android)', cliente: 'Tela LCD sem aro', servico: 'tela' },
  lcd_com_aro: { tela: 'LCD com aro (Android)', cliente: 'Tela LCD com aro', servico: 'tela' },
  lcd_iphone: { tela: 'LCD de iPhone (Incell)', cliente: 'Tela LCD', servico: 'tela' },
  oled: { tela: 'OLED com aro (Android) e OLED de iPhone', cliente: 'Tela OLED', servico: 'tela' },
  oled_sem_aro: { tela: 'OLED sem aro (Android)', cliente: 'Tela OLED sem aro', servico: 'tela' },
  soft_oled: { tela: 'Soft OLED', cliente: 'Tela Soft OLED', servico: 'tela' },
  soft_oled_genuina: { tela: 'Soft OLED com mensagem genuína', cliente: 'Tela Soft OLED com mensagem genuína', servico: 'tela' },
  nacional: { tela: 'Original / nacional (só em aparelho OLED, com aro)', cliente: 'Tela original', servico: 'tela' },
  bateria: { tela: 'Bateria', cliente: 'Bateria', servico: 'bateria' },
  bateria_genuina: { tela: 'Bateria com calibração genuína', cliente: 'Bateria com calibração genuína', servico: 'bateria' },
  placa_conector: { tela: 'Placa do conector (Android)', cliente: 'Conector de carga', servico: 'conector' },
  conector_iphone: { tela: 'Conector de carga de iPhone', cliente: 'Conector de carga', servico: 'conector' },
}

const regra = (r: Partial<RegraDePreco>): RegraDePreco => ({ oferecer: true, custo: 'meio', faixas: [], mult: 1, soma: 0, minimo: 0, ...r })
const faixas = (...pares: [number, number][]): Faixa[] => pares.map(([ate, preco]) => ({ ate, preco }))

/**
 * Regras deduzidas dos preços que o dono da SOS Celulares digitou para 160
 * orçamentos em 21/11/2026 (reproduzem 97 de 115 exatamente). Cada loja edita
 * as suas em Configurações; o cálculo só vale depois de ligado.
 */
export const PRECOS_PADRAO: ConfigPrecos = {
  ativo: false,
  arredondar: 10,
  nacionalMinimoSobreOled: 1.35,
  regras: {
    lcd_sem_aro: regra({ faixas: faixas([80, 180], [90, 190], [120, 220]), mult: 1.65 }),
    lcd_com_aro: regra({ faixas: faixas([109.99, 230], [150, 250]), mult: 1.65 }),
    lcd_iphone: regra({ faixas: faixas([80, 180], [109.99, 230], [150, 250]), mult: 1.65 }),
    oled: regra({ faixas: faixas([175, 280], [200, 290], [210, 320], [218, 330], [240, 350], [258, 380], [270, 390]), mult: 1.43 }),
    oled_sem_aro: regra({ oferecer: false, soma: 120 }),
    soft_oled: regra({ faixas: faixas([300, 450], [350, 520], [400, 550]), mult: 1.45 }),
    soft_oled_genuina: regra({ custo: 'maior', mult: 1.38 }),
    nacional: regra({ mult: 1.4 }),
    bateria: regra({ mult: 2, minimo: 150 }),
    bateria_genuina: regra({ mult: 0, soma: 350 }),
    placa_conector: regra({ soma: 100 }),
    conector_iphone: regra({ soma: 120, minimo: 180 }),
  },
}

const numero = (v: unknown, padrao: number, minimo = 0) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n >= minimo ? n : padrao
}

function lerFaixas(bruto: unknown, padrao: Faixa[]): Faixa[] {
  if (!Array.isArray(bruto)) return padrao
  return bruto
    .map(f => ({ ate: numero((f as Faixa)?.ate, NaN), preco: numero((f as Faixa)?.preco, NaN) }))
    .filter(f => Number.isFinite(f.ate) && Number.isFinite(f.preco) && f.ate > 0 && f.preco > 0)
    .sort((a, b) => a.ate - b.ate)
}

/** Lê o JSON do banco tolerando campos ausentes ou inválidos: o que faltar vem do padrão. */
export function lerConfigPrecos(bruto: unknown): ConfigPrecos {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const brutas = (b.regras && typeof b.regras === 'object' ? b.regras : {}) as Record<string, Record<string, unknown> | undefined>
  const regras = {} as Record<ChaveDeRegra, RegraDePreco>
  for (const chave of CHAVES_DE_REGRA) {
    const p = PRECOS_PADRAO.regras[chave]
    const r = brutas[chave]
    regras[chave] = !r ? { ...p, faixas: [...p.faixas] } : {
      oferecer: typeof r.oferecer === 'boolean' ? r.oferecer : p.oferecer,
      custo: r.custo === 'menor' || r.custo === 'meio' || r.custo === 'maior' ? r.custo : p.custo,
      faixas: lerFaixas(r.faixas, p.faixas),
      mult: numero(r.mult, p.mult),
      soma: numero(r.soma, p.soma),
      minimo: numero(r.minimo, p.minimo),
    }
  }
  return {
    ativo: b.ativo === true,
    arredondar: numero(b.arredondar, PRECOS_PADRAO.arredondar, 1),
    nacionalMinimoSobreOled: numero(b.nacionalMinimoSobreOled, PRECOS_PADRAO.nacionalMinimoSobreOled, 1),
    regras,
  }
}

/** Entre os custos das marcas, o que serve de base para o preço. */
export function custoDeReferencia(custos: number[], criterio: RegraDePreco['custo']): number {
  const ordenados = [...custos].sort((a, b) => a - b)
  if (criterio === 'menor') return ordenados[0]
  if (criterio === 'maior') return ordenados[ordenados.length - 1]
  // Com quantidade par fica o mais barato dos dois centrais, que é o preço de uma peça real
  return ordenados[Math.floor((ordenados.length - 1) / 2)]
}

export function precoPelaRegra(custo: number, r: RegraDePreco, arredondar = 10): number {
  const faixa = r.faixas.find(f => custo <= f.ate)
  const multiplo = arredondar > 0 ? arredondar : 1
  // A folga evita que 250,0000001 suba para 260 por erro de ponto flutuante
  const calculado = Math.ceil((custo * r.mult + r.soma - 1e-6) / multiplo) * multiplo
  return Math.max(r.minimo, faixa ? faixa.preco : calculado)
}

// ── Texto das faixas, para editar na tela: "80=180; 90=190; 120=220" ──────
export const faixasParaTexto = (f: Faixa[]) =>
  f.map(x => `${String(Math.round(x.ate * 100) / 100).replace('.', ',')}=${x.preco}`).join('; ')

export function textoParaFaixas(texto: string): Faixa[] {
  return lerFaixas(
    texto.split(/[;\n]+/).map(par => {
      const [ate, preco] = par.split('=').map(s => s.trim().replace(/[^\d.,]/g, ''))
      return { ate, preco }
    }),
    []
  )
}
