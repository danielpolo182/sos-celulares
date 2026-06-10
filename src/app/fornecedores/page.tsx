'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Fornecedor = {
  id: string
  nome: string
  contato: string | null
  telefone: string | null
  email: string | null
  prazo_entrega: number
  observacoes: string | null
  ativo: boolean
}

type Ranking = {
  id: string
  nome: string
  total_os: number
  total_garantias: number
  taxa_garantia_pct: number | null
  ticket_medio: number | null
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

export default function FornecedoresPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'lista' | 'ranking'>('lista')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [ranking, setRanking] = useState<Ranking[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [fNome, setFNome] = useState('')
  const [fContato, setFContato] = useState('')
  const [fTelefone, setFTelefone] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPrazo, setFPrazo] = useState('1')
  const [fObs, setFObs] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: f }, { data: r }] = await Promise.all([
      supabase.from('fornecedores').select('*').is('deleted_at', null).order('nome'),
      supabase.from('vw_ranking_fornecedores').select('*'),
    ])
    setFornecedores((f ?? []) as Fornecedor[])
    setRanking((r ?? []) as Ranking[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  function abrirNovo() { setFNome(''); setFContato(''); setFTelefone(''); setFEmail(''); setFPrazo('1'); setFObs(''); setEditId(null); setShowModal(true) }
  function abrirEdit(f: Fornecedor) { setFNome(f.nome); setFContato(f.contato ?? ''); setFTelefone(f.telefone ?? ''); setFEmail(f.email ?? ''); setFPrazo(String(f.prazo_entrega)); setFObs(f.observacoes ?? ''); setEditId(f.id); setShowModal(true) }

  async function salvar() {
    if (!fNome.trim()) return
    setSaving(true)
    const payload = { nome: fNome.trim(), contato: fContato || null, telefone: fTelefone || null, email: fEmail || null, prazo_entrega: parseInt(fPrazo) || 1, observacoes: fObs || null }
    if (editId) await supabase.from('fornecedores').update(payload).eq('id', editId)
    else await supabase.from('fornecedores').insert(payload)
    setSaving(false); setShowModal(false); fetchAll()
  }

  async function toggleAtivo(f: Fornecedor) { await supabase.from('fornecedores').update({ ativo: !f.ativo }).eq('id', f.id); fetchAll() }

  function taxaColor(t: number | null) { if (t === null) return '#64748b'; if (t === 0) return '#065f46'; if (t < 5) return '#92400e'; return '#991b1b' }
  function taxaBg(t: number | null) { if (t === null) return '#f8fafc'; if (t === 0) return '#ecfdf5'; if (t < 5) return '#fef3c7'; return '#fef2f2' }

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Fornecedores</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{fornecedores.length} cadastrados</p>
        </div>
        <button onClick={abrirNovo} style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Novo fornecedor</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {([['lista', '📋 Lista'], ['ranking', '🏆 Ranking']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#6366f1' : '#64748b', borderBottom: aba === k ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {aba === 'lista' && (
        loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div> :
        fornecedores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhum fornecedor cadastrado</p>
            <button onClick={abrirNovo} style={{ marginTop: 16, padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ Cadastrar</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {fornecedores.map(f => {
              const r = ranking.find(r => r.id === f.id)
              return (
                <div key={f.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div><p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{f.nome}</p>{f.contato && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{f.contato}</p>}</div>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: f.ativo ? '#ecfdf5' : '#f1f5f9', color: f.ativo ? '#065f46' : '#94a3b8' }}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                    {f.telefone && <p style={{ fontSize: 12, color: '#64748b' }}>📞 {f.telefone}</p>}
                    {f.email && <p style={{ fontSize: 12, color: '#64748b' }}>✉ {f.email}</p>}
                    <p style={{ fontSize: 12, color: '#64748b' }}>⏱ Prazo: {f.prazo_entrega} dia{f.prazo_entrega > 1 ? 's' : ''}</p>
                  </div>
                  {r && r.total_os > 0 && (
                    <div style={{ background: taxaBg(r.taxa_garantia_pct), border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#64748b' }}>Taxa de garantia</span>
                      <span style={{ fontWeight: 600, color: taxaColor(r.taxa_garantia_pct) }}>{r.taxa_garantia_pct !== null ? `${r.taxa_garantia_pct}%` : '—'} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({r.total_os} OS)</span></span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => abrirEdit(f)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', cursor: 'pointer', color: '#374151' }}>Editar</button>
                    <button onClick={() => toggleAtivo(f)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', cursor: 'pointer', color: f.ativo ? '#991b1b' : '#065f46' }}>{f.ativo ? 'Desativar' : 'Ativar'}</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {aba === 'ranking' && (
        <div>
          <div style={{ background: '#fef3c7', border: '1px solid #fef08a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
            📊 Ranking automático baseado em OS e garantias. Menor taxa de garantia = maior confiabilidade.
          </div>
          {ranking.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Nenhum dado ainda. O ranking cresce conforme OS e garantias são registradas.</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Pos.', 'Fornecedor', 'OS', 'Garantias', 'Taxa', 'Score'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const score = r.total_os === 0 ? null : Math.max(0, 100 - (r.taxa_garantia_pct ?? 0) * 3)
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontSize: 16 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{r.nome}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{r.total_os}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{r.total_garantias}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: taxaBg(r.taxa_garantia_pct), color: taxaColor(r.taxa_garantia_pct) }}>
                            {r.taxa_garantia_pct !== null ? `${r.taxa_garantia_pct}%` : 'Sem dados'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {score !== null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 80, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${score}%`, background: score > 80 ? '#10b981' : score > 60 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: score > 80 ? '#065f46' : score > 60 ? '#92400e' : '#991b1b' }}>{Math.round(score)}</span>
                            </div>
                          ) : <span style={{ fontSize: 12, color: '#94a3b8' }}>Aguardando</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{editId ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={lbl}>Nome *</label><input style={inp} value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Nome do fornecedor" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Contato</label><input style={inp} value={fContato} onChange={e => setFContato(e.target.value)} placeholder="Nome da pessoa" /></div>
                <div><label style={lbl}>Telefone / WhatsApp</label><input style={inp} value={fTelefone} onChange={e => setFTelefone(e.target.value)} placeholder="(11) 99999-9999" /></div>
                <div><label style={lbl}>E-mail</label><input style={inp} value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@fornecedor.com" /></div>
                <div><label style={lbl}>Prazo médio (dias)</label><input style={inp} type="number" value={fPrazo} onChange={e => setFPrazo(e.target.value)} min="1" /></div>
              </div>
              <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Condições de pagamento, política de troca..." /></div>
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvar} disabled={saving} style={{ padding: '8px 18px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Salvando...' : editId ? 'Salvar' : 'Cadastrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
