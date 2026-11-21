// src/lib/feriados.ts
// Feriados nacionais do Brasil, para o agente avisar que o horário pode mudar.
// Feriados municipais e estaduais não entram: variam por cidade.

const FUSO = 'America/Sao_Paulo'
const DIA_MS = 86_400_000

type Feriado = { data: string; nome: string } // data em aaaa-mm-dd

// Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const mais = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS)

export function feriadosDoAno(ano: number): Feriado[] {
  const p = pascoa(ano)
  const fixo = (mes: number, dia: number, nome: string) => ({ data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, nome })
  return [
    fixo(1, 1, 'Confraternização Universal'),
    { data: iso(mais(p, -48)), nome: 'Carnaval (segunda-feira)' },
    { data: iso(mais(p, -47)), nome: 'Carnaval (terça-feira)' },
    { data: iso(mais(p, -2)), nome: 'Sexta-feira Santa' },
    fixo(4, 21, 'Tiradentes'),
    fixo(5, 1, 'Dia do Trabalho'),
    { data: iso(mais(p, 60)), nome: 'Corpus Christi' },
    fixo(9, 7, 'Independência do Brasil'),
    fixo(10, 12, 'Nossa Senhora Aparecida'),
    fixo(11, 2, 'Finados'),
    fixo(11, 15, 'Proclamação da República'),
    fixo(11, 20, 'Dia da Consciência Negra'),
    fixo(12, 25, 'Natal'),
  ].sort((x, y) => x.data.localeCompare(y.data))
}

/** Data de hoje em São Paulo, em aaaa-mm-dd. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/**
 * Texto para as instruções do agente: dia e hora atuais, se hoje é feriado e
 * quais feriados nacionais caem nos próximos dias.
 */
export function contextoDeDataParaOAgente(agora: Date = new Date(), diasAFrente = 30): string {
  const hoje = hojeEmSaoPaulo(agora)
  const ano = Number(hoje.slice(0, 4))
  const limite = iso(mais(new Date(`${hoje}T12:00:00Z`), diasAFrente))
  const proximos = [...feriadosDoAno(ano), ...feriadosDoAno(ano + 1)].filter(f => f.data >= hoje && f.data <= limite)

  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(agora)
  const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const feriadoDeHoje = proximos.find(f => f.data === hoje)
  const seguintes = proximos.filter(f => f.data !== hoje)

  return [
    `Agora: ${quando} (horário de Brasília).`,
    feriadoDeHoje ? `Hoje é feriado nacional: ${feriadoDeHoje.nome}.` : 'Hoje não é feriado nacional.',
    seguintes.length ? `Próximos feriados nacionais: ${seguintes.map(f => `${dataBR(f.data)} (${f.nome})`).join(', ')}.` : '',
  ].filter(Boolean).join('\n')
}
