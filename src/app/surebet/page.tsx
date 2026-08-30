'use client'

import { useMemo, useState } from 'react'
import { CASAS, calcularPorTotal, calcularPorStakeFixa, type Perna } from '@/lib/surebet'

type Modo = 'total' | 'fixa'

const ROTULOS_2 = ['Resultado 1', 'Resultado 2']
const ROTULOS_3 = ['1 (Casa)', 'X (Empate)', '2 (Fora)']

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: 20 }
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, color: '#0f172a', background: '#fff', outline: 'none' }

function parseNum(v: string): number {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function SurebetPage() {
  const [numPernas, setNumPernas] = useState<2 | 3>(2)
  const [modo, setModo] = useState<Modo>('total')
  const [totalStr, setTotalStr] = useState('1000')
  const [stakeFixaStr, setStakeFixaStr] = useState('500')
  const [pernaFixa, setPernaFixa] = useState(0)
  const [passo, setPasso] = useState(0)
  const [casas, setCasas] = useState<string[]>(['pinnacle', 'betboom', 'pinnacle'])
  const [odds, setOdds] = useState<string[]>(['2.10', '2.05', ''])

  const rotulos = numPernas === 2 ? ROTULOS_2 : ROTULOS_3

  const resultado = useMemo(() => {
    const pernas: Perna[] = Array.from({ length: numPernas }, (_, i) => ({
      casaId: casas[i],
      odd: parseNum(odds[i]),
    }))
    if (pernas.some(p => !(p.odd > 1))) return null
    if (modo === 'total') return calcularPorTotal(pernas, parseNum(totalStr), passo)
    const idx = Math.min(pernaFixa, numPernas - 1)
    return calcularPorStakeFixa(pernas, idx, parseNum(stakeFixaStr), passo)
  }, [numPernas, modo, totalStr, stakeFixaStr, pernaFixa, passo, casas, odds])

  const setOdd = (i: number, v: string) => setOdds(prev => prev.map((o, j) => (j === i ? v : o)))
  const setCasa = (i: number, v: string) => setCasas(prev => prev.map((c, j) => (j === i ? v : c)))

  const nomeCasa = (id: string) => CASAS.find(c => c.id === id)?.nome ?? id

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Calculadora de Surebet</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Arbitragem entre casas licenciadas no Brasil — distribua o valor entre as odds e garanta o mesmo lucro em qualquer resultado.
        </p>
      </div>

      {/* Configuração */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <span style={label}>Mercado</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {([2, 3] as const).map(n => (
                <button
                  key={n}
                  onClick={() => { setNumPernas(n); setPernaFixa(p => Math.min(p, n - 1)) }}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: numPernas === n ? '1px solid #2563eb' : '1px solid #cbd5e1',
                    background: numPernas === n ? '#eff6ff' : '#fff',
                    color: numPernas === n ? '#1d4ed8' : '#64748b',
                  }}
                >
                  {n} resultados
                </button>
              ))}
            </div>
          </div>

          <div>
            <span style={label}>Modo de cálculo</span>
            <select value={modo} onChange={e => setModo(e.target.value as Modo)} style={input}>
              <option value="total">Distribuir valor total</option>
              <option value="fixa">Fixar aposta em uma casa</option>
            </select>
          </div>

          {modo === 'total' ? (
            <div>
              <span style={label}>Valor total (R$)</span>
              <input value={totalStr} onChange={e => setTotalStr(e.target.value)} inputMode="decimal" style={input} />
            </div>
          ) : (
            <>
              <div>
                <span style={label}>Aposta fixa (R$)</span>
                <input value={stakeFixaStr} onChange={e => setStakeFixaStr(e.target.value)} inputMode="decimal" style={input} />
              </div>
              <div>
                <span style={label}>Fixar na perna</span>
                <select value={pernaFixa} onChange={e => setPernaFixa(Number(e.target.value))} style={input}>
                  {rotulos.map((r, i) => (
                    <option key={i} value={i}>{r} — {nomeCasa(casas[i])}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <span style={label}>Arredondar apostas</span>
            <select value={passo} onChange={e => setPasso(Number(e.target.value))} style={input}>
              <option value={0}>Sem arredondamento</option>
              <option value={0.5}>R$ 0,50</option>
              <option value={1}>R$ 1,00</option>
              <option value={5}>R$ 5,00</option>
              <option value={10}>R$ 10,00</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pernas */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numPernas}, 1fr)`, gap: 16 }}>
          {rotulos.map((rotulo, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, background: '#f8fafc' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotulo}</p>
              <span style={label}>Casa de aposta</span>
              <select value={casas[i]} onChange={e => setCasa(i, e.target.value)} style={{ ...input, marginBottom: 10 }}>
                {CASAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <span style={label}>Odd (decimal)</span>
              <input value={odds[i]} onChange={e => setOdd(i, e.target.value)} inputMode="decimal" placeholder="ex.: 2.10" style={input} />
            </div>
          ))}
        </div>
      </div>

      {/* Resultado */}
      {!resultado ? (
        <div style={{ ...card, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Preencha as odds (maiores que 1) e os valores para ver o resultado.
        </div>
      ) : (
        <>
          <div
            style={{
              ...card,
              marginBottom: 16,
              border: resultado.ehSurebet ? '1px solid #6ee7b7' : '1px solid #fca5a5',
              background: resultado.ehSurebet ? '#ecfdf5' : '#fef2f2',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Situação</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: resultado.ehSurebet ? '#047857' : '#b91c1c' }}>
                  {resultado.ehSurebet ? '✓ Surebet encontrada' : '✗ Sem arbitragem'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Margem</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{fmtPct(resultado.margem)}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Total investido</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{fmtBRL(resultado.totalInvestido)}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Lucro garantido</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: resultado.lucroGarantido >= 0 ? '#047857' : '#b91c1c' }}>
                  {fmtBRL(resultado.lucroGarantido)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>ROI garantido</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: resultado.roi >= 0 ? '#047857' : '#b91c1c' }}>{fmtPct(resultado.roi)}</p>
              </div>
            </div>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Perna</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Casa</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Odd</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Apostar</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Retorno se vencer</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Lucro se vencer</th>
                </tr>
              </thead>
              <tbody>
                {resultado.pernas.map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #e2e8f0', color: '#0f172a' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{rotulos[i]}</td>
                    <td style={{ padding: '10px 16px' }}>{nomeCasa(p.casaId)}</td>
                    <td style={{ padding: '10px 16px' }}>{p.odd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1d4ed8' }}>{fmtBRL(p.stake)}</td>
                    <td style={{ padding: '10px 16px' }}>{fmtBRL(p.retorno)}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: p.lucro >= 0 ? '#047857' : '#b91c1c' }}>{fmtBRL(p.lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14 }}>
            As odds mudam rapidamente — confirme os valores nas duas casas antes de apostar. Aposte com responsabilidade (+18).
          </p>
        </>
      )}
    </div>
  )
}
