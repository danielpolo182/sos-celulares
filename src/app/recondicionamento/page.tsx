'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RecondAparelho, STATUS_CFG, fm } from './tipos'

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }

interface Dispositivo { id: string; marca: string; modelo: string; armazenamento?: string }

const ABAS: { key: string; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'triagem', label: 'Triagem' },
  { key: 'diagnostico', label: 'Em diagnóstico' },
  { key: 'aguardando_pecas', label: 'Aguard. peças' },
  { key: 'reparo', label: 'Em reparo' },
  { key: 'pronto', label: 'Prontos' },
  { key: 'descartado', label: 'Descartados' },
]

export default function RecondicionamentoPage() {
  const supabase = createClient()
  const router = useRouter()
  const [lista, setLista] = useState<RecondAparelho[]>([])
  const [aba, setAba] = useState('todos')
  const [novo, setNovo] = useState(false)
  const [saving, setSaving] = useState(false)

  // form
  const [modeloInput, setModeloInput] = useState('')
  const [modeloSugestoes, setModeloSugestoes] = useState<Dispositivo[]>([])
  const [showSug, setShowSug] = useState(false)
  const [marca, setMarca] = useState('')
  const [capacidade, setCapacidade] = useState('')
  const [cor, setCor] = useState('')
  const [imei, setImei] = useState('')
  const [descricao, setDescricao] = useState('')
  const modeloTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAll = useCallback(async () => {
    const { data } = await supabase.from('recond_aparelhos')
      .select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setLista((data ?? []) as RecondAparelho[])
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  function onModeloChange(val: string) {
    setModeloInput(val)
    if (modeloTimer.current) clearTimeout(modeloTimer.current)
    if (!val.trim()) { setModeloSugestoes([]); setShowSug(false); return }
    modeloTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('dispositivos_modelos')
        .select('id,marca,modelo,armazenamento').ilike('modelo', `%${val}%`).eq('ativo', true)
        .order('verificado', { ascending: false }).limit(6)
      setModeloSugestoes((data ?? []) as Dispositivo[])
      setShowSug(true)
    }, 300)
  }

  function selecionarModelo(d: Dispositivo) {
    setModeloInput(d.modelo)
    setMarca(d.marca)
    if (d.armazenamento) setCapacidade(d.armazenamento)
    setShowSug(false)
  }

  function limpar() {
    setModeloInput(''); setMarca(''); setCapacidade(''); setCor(''); setImei(''); setDescricao(''); setModeloSugestoes([])
  }

  async function salvar() {
    if (!modeloInput.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('recond_aparelhos').insert({
      marca: marca || null,
      modelo: modeloInput.trim(),
      capacidade: capacidade || null,
      cor: cor || null,
      imei: imei || null,
      descricao: descricao || null,
      status: 'triagem',
    }).select().single()
    setSaving(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    limpar(); setNovo(false)
    if (data?.id) router.push(`/recondicionamento/${data.id}`)
    else fetchAll()
  }

  const filtrada = aba === 'todos' ? lista : lista.filter(a => a.status === aba)
  const cont = (k: string) => lista.filter(a => a.status === k).length

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Recondicionamento</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Aparelhos próprios em reparo — custo R$ 0 até ficarem prontos para a venda.</p>
        </div>
        <button type="button" onClick={() => { setNovo(v => !v); limpar() }}
          style={{ padding: '9px 16px', background: novo ? '#e2e8f0' : '#0891b2', color: novo ? '#334155' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {novo ? 'Cancelar' : '+ Novo aparelho'}
        </button>
      </div>

      {novo && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ position: 'relative', gridColumn: '1 / -1' }}>
              <label style={lbl}>Modelo *</label>
              <input style={inp} value={modeloInput} onChange={e => onModeloChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSug(false), 150)}
                placeholder="Ex: iPhone 13, Galaxy A32, Moto G52..." autoFocus />
              {showSug && modeloSugestoes.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                  {modeloSugestoes.map(d => (
                    <button key={d.id} type="button" onMouseDown={() => selecionarModelo(d)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13, color: '#1e293b' }}>
                      <strong>{d.marca}</strong> {d.modelo}{d.armazenamento ? ` · ${d.armazenamento}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div><label style={lbl}>Cor</label><input style={inp} value={cor} onChange={e => setCor(e.target.value)} placeholder="Azul, preto..." /></div>
            <div><label style={lbl}>Capacidade</label><input style={inp} value={capacidade} onChange={e => setCapacidade(e.target.value)} placeholder="128GB..." /></div>
            <div><label style={lbl}>IMEI / Série</label><input style={inp} value={imei} onChange={e => setImei(e.target.value)} placeholder="Opcional" /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Descrição / condições observadas</label>
              <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={descricao} onChange={e => setDescricao(e.target.value)}
                placeholder="Descreva o que você vê e observa: estado da tela e tampa, se liga, consumo ao carregar, etc." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button type="button" onClick={salvar} disabled={saving || !modeloInput.trim()}
              style={{ padding: '9px 18px', background: saving ? '#94a3b8' : '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Salvando...' : 'Cadastrar e abrir'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        {ABAS.map(t => {
          const ativo = aba === t.key
          const n = t.key === 'todos' ? lista.length : cont(t.key)
          return (
            <button key={t.key} type="button" onClick={() => setAba(t.key)}
              style={{ padding: '8px 14px', background: 'none', border: 'none', borderBottom: ativo ? '2px solid #0891b2' : '2px solid transparent', color: ativo ? '#0891b2' : '#64748b', fontSize: 13, fontWeight: ativo ? 600 : 500, cursor: 'pointer', marginBottom: -1 }}>
              {t.label} <span style={{ fontSize: 11, color: '#94a3b8' }}>{n}</span>
            </button>
          )
        })}
      </div>

      {filtrada.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 14 }}>Nenhum aparelho nesta aba.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '10px 16px' }}>Aparelho</th>
                <th style={{ padding: '10px 16px' }}>IMEI</th>
                <th style={{ padding: '10px 16px' }}>Status</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Custo peças</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Venda est.</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map(a => {
                const st = STATUS_CFG[a.status] ?? { label: a.status, cor: '#64748b', bg: '#f1f5f9' }
                return (
                  <tr key={a.id} onClick={() => router.push(`/recondicionamento/${a.id}`)}
                    style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{a.marca ? `${a.marca} ` : ''}{a.modelo}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{[a.cor, a.capacidade].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td style={{ padding: '11px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{a.imei || '—'}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: st.cor, background: st.bg }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right', color: '#64748b' }}>{fm(a.custo_pecas)}</td>
                    <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{a.valor_venda ? fm(a.valor_venda) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
