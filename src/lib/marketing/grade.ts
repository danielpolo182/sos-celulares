// Grade de horários da fila de aprovação: em que instante a próxima publicação aprovada vai ao ar.
// Módulo puro, sem dependências do projeto: o roteiro scripts/conferir-grade.mjs o carrega direto.

/** Horários padrão, na hora de Brasília. */
export const HORARIOS_PADRAO: string[] = ['07:30', '12:00', '18:00', '20:30']

// Brasília é UTC-3 o ano inteiro: o Brasil não tem horário de verão desde 2019.
const FUSO_MIN = -180
const MINUTO = 60_000
const DIA = 86_400_000
/** Um horário só serve se ainda faltarem pelo menos estes minutos para ele. */
const ANTECEDENCIA_MIN = 10

function minutosDoDia(horario: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(horario.trim())
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`horário inválido na grade: ${horario}`)
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * O primeiro horário da grade que esteja pelo menos 10 minutos à frente de `agora`
 * e que não conste em `ocupados`. Percorre hoje e os dias seguintes, todos os dias da semana.
 */
export function proximoHorario(agora: Date, horarios: string[], ocupados: Date[]): Date {
  if (!horarios.length) throw new Error('grade sem horários')
  const minutos = [...new Set(horarios.map(minutosDoDia))].sort((a, b) => a - b)
  const tomados = new Set(ocupados.map(o => o.getTime()))
  // Meia-noite de hoje no relógio de Brasília, expressa em UTC
  const local = agora.getTime() + FUSO_MIN * MINUTO
  const meiaNoite = Math.floor(local / DIA) * DIA - FUSO_MIN * MINUTO
  for (let dia = 0; dia < 400; dia++) {
    for (const m of minutos) {
      const instante = meiaNoite + dia * DIA + m * MINUTO
      if (instante - agora.getTime() >= ANTECEDENCIA_MIN * MINUTO && !tomados.has(instante)) return new Date(instante)
    }
  }
  throw new Error('grade sem horário livre')
}

/** `quantos` horários livres, em ordem, sem repetir: um para cada item aprovado de uma vez. */
export function distribuir(agora: Date, horarios: string[], ocupados: Date[], quantos: number): Date[] {
  if (!horarios.length) throw new Error('grade sem horários')
  const tomados = [...ocupados]
  const escolhidos: Date[] = []
  for (let i = 0; i < quantos; i++) {
    const h = proximoHorario(agora, horarios, tomados)
    escolhidos.push(h)
    tomados.push(h)
  }
  return escolhidos
}
