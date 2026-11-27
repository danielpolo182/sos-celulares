// Conferência da grade de horários da fila de aprovação.
// Rodar: node --no-warnings src/lib/marketing/conferir-grade.mjs   (o Node 24 carrega o TypeScript direto)
// Instantes em UTC; Brasília = UTC-3.
import assert from 'node:assert/strict'
import { HORARIOS_PADRAO, proximoHorario, distribuir } from './grade.ts'

const d = (iso) => new Date(iso)
const iso = (x) => x.toISOString().replace('.000Z', 'Z')
let casos = 0
const confere = (nome, obtido, esperado) => { assert.equal(iso(obtido), esperado, nome); casos++ }

assert.deepEqual(HORARIOS_PADRAO, ['07:30', '12:00', '18:00', '20:30'])

confere('antes do primeiro horário', proximoHorario(d('2026-11-27T09:00:00Z'), HORARIOS_PADRAO, []), '2026-11-27T10:30:00Z')
confere('faltam 10 minutos exatos: ainda vale', proximoHorario(d('2026-11-27T10:20:00Z'), HORARIOS_PADRAO, []), '2026-11-27T10:30:00Z')
confere('faltam 5 minutos: pula para o seguinte', proximoHorario(d('2026-11-27T10:25:00Z'), HORARIOS_PADRAO, []), '2026-11-27T15:00:00Z')
confere('dois horários ocupados', proximoHorario(d('2026-11-27T09:00:00Z'), HORARIOS_PADRAO,
  [d('2026-11-27T10:30:00Z'), d('2026-11-27T15:00:00Z')]), '2026-11-27T21:00:00Z')
confere('dia cheio vai para amanhã', proximoHorario(d('2026-11-27T09:00:00Z'), HORARIOS_PADRAO,
  [d('2026-11-27T10:30:00Z'), d('2026-11-27T15:00:00Z'), d('2026-11-27T21:00:00Z'), d('2026-11-27T23:30:00Z')]), '2026-11-28T10:30:00Z')
confere('20h25 em Brasília: o das 20h30 já não dá', proximoHorario(d('2026-11-27T23:25:00Z'), HORARIOS_PADRAO, []), '2026-11-28T10:30:00Z')
confere('22h em Brasília (já é dia 28 em UTC): 7h30 do dia 28', proximoHorario(d('2026-11-28T01:00:00Z'), HORARIOS_PADRAO, []), '2026-11-28T10:30:00Z')
confere('virada de mês', proximoHorario(d('2026-11-30T23:40:00Z'), HORARIOS_PADRAO, []), '2026-12-01T10:30:00Z')

const seis = distribuir(d('2026-11-27T09:00:00Z'), HORARIOS_PADRAO, [], 6).map(iso)
assert.deepEqual(seis, ['2026-11-27T10:30:00Z', '2026-11-27T15:00:00Z', '2026-11-27T21:00:00Z', '2026-11-27T23:30:00Z',
  '2026-11-28T10:30:00Z', '2026-11-28T15:00:00Z'], 'seis itens: quatro hoje, dois amanhã, sem repetir')
casos++

assert.throws(() => proximoHorario(d('2026-11-27T09:00:00Z'), [], []), /grade sem horários/)
assert.throws(() => distribuir(d('2026-11-27T09:00:00Z'), [], [], 2), /grade sem horários/)
casos++

console.log(`grade: ${casos} casos ok`)
