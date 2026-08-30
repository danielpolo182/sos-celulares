// Lógica pura da calculadora de surebet (arbitragem entre casas de apostas)

export type CasaAposta = {
  id: string
  nome: string
}

// Casas licenciadas no Brasil disponíveis na calculadora — adicionar novas aqui
export const CASAS: CasaAposta[] = [
  { id: 'pinnacle', nome: 'Pinnacle' },
  { id: 'betboom',  nome: 'BetBoom' },
]

export type Perna = {
  casaId: string
  odd: number
}

export type ResultadoPerna = {
  casaId: string
  odd: number
  stake: number
  retorno: number
  /** Lucro líquido caso esta perna vença (retorno - total investido) */
  lucro: number
}

export type ResultadoSurebet = {
  /** Σ 1/odd — abaixo de 1 indica surebet */
  somaInversa: number
  /** Margem de arbitragem em % (positiva = surebet) */
  margem: number
  ehSurebet: boolean
  totalInvestido: number
  /** Menor lucro entre os cenários (lucro garantido) */
  lucroGarantido: number
  /** ROI garantido em % sobre o total investido */
  roi: number
  pernas: ResultadoPerna[]
}

function arredondar(valor: number, passo: number): number {
  if (passo <= 0) return valor
  return Math.round(valor / passo) * passo
}

/**
 * Distribui o valor total entre as pernas para igualar o lucro em qualquer resultado.
 * `passoArredondamento` arredonda cada stake (ex.: 1 = R$ 1,00; 0 = sem arredondar).
 */
export function calcularPorTotal(pernas: Perna[], total: number, passoArredondamento = 0): ResultadoSurebet | null {
  if (pernas.length < 2 || total <= 0 || pernas.some(p => !(p.odd > 1))) return null
  const somaInversa = pernas.reduce((s, p) => s + 1 / p.odd, 0)
  const stakes = pernas.map(p => arredondar((total * (1 / p.odd)) / somaInversa, passoArredondamento))
  return montarResultado(pernas, stakes, somaInversa)
}

/**
 * Fixa o valor apostado na perna `indiceFixo` e calcula as demais stakes
 * para igualar o retorno em qualquer resultado.
 */
export function calcularPorStakeFixa(
  pernas: Perna[],
  indiceFixo: number,
  stakeFixa: number,
  passoArredondamento = 0
): ResultadoSurebet | null {
  if (pernas.length < 2 || stakeFixa <= 0 || pernas.some(p => !(p.odd > 1))) return null
  if (indiceFixo < 0 || indiceFixo >= pernas.length) return null
  const somaInversa = pernas.reduce((s, p) => s + 1 / p.odd, 0)
  const retornoAlvo = stakeFixa * pernas[indiceFixo].odd
  const stakes = pernas.map((p, i) =>
    i === indiceFixo ? stakeFixa : arredondar(retornoAlvo / p.odd, passoArredondamento)
  )
  return montarResultado(pernas, stakes, somaInversa)
}

function montarResultado(pernas: Perna[], stakes: number[], somaInversa: number): ResultadoSurebet {
  const totalInvestido = stakes.reduce((s, v) => s + v, 0)
  const resultadoPernas: ResultadoPerna[] = pernas.map((p, i) => {
    const retorno = stakes[i] * p.odd
    return { casaId: p.casaId, odd: p.odd, stake: stakes[i], retorno, lucro: retorno - totalInvestido }
  })
  const lucroGarantido = Math.min(...resultadoPernas.map(p => p.lucro))
  return {
    somaInversa,
    margem: (1 - somaInversa) * 100,
    ehSurebet: somaInversa < 1,
    totalInvestido,
    lucroGarantido,
    roi: totalInvestido > 0 ? (lucroGarantido / totalInvestido) * 100 : 0,
    pernas: resultadoPernas,
  }
}
