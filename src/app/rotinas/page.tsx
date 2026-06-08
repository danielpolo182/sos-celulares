'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Tarefa = {
  id: string
  titulo: string
  descricao: string | null
  categoria: string
  frequencia: string
  dias_semana: number[] | null
  dia_mes: number | null
  horario_limit: string | null
  responsavel_id: string | null
  ativo: boolean
  ordem: number
}

type Execucao = {
  id: string
  tarefa_id: string
  usuario_id: string
  data_ref: string
  feito: boolean
  feito_em: string | null
}

type Perfil = { id: string; nome: string; papel: string }

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_SEMANA_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const CATEGORIA_CONFIG: Record<string, { icon: string; label: string; bg: string; color: string }> = {
  limpeza:        { icon: '🧹', label: 'Limpeza',        bg: '#E1F5EE', color: '#085041' },
  administrativo: { icon: '📋', label: 'Administrativo', bg: '#E6F1FB', color: '#0C447C' },
  atendimento:    { icon: '📞', label: 'Atendimento',    bg: '#EEEDFE', color: '#3C3489' },
  estoque:        { icon: '📦', label: 'Estoque',        bg: '#FAEEDA', color: '#633806' },
  financeiro:     { icon: '💰', label: 'Financeiro',     bg: '#EAF3DE', color: '#27500A' },
  marketing:      { icon: '📣', label: 'Marketing',      bg: '#FAECE7', color: '#712B13' },
  geral:          { icon: '✔',  label: 'Geral',          bg: '#f1f5f9', color: '#475569' },
}

const FREQ_CONFIG: Record<string, { label: string; color: string }> = {
  diaria:  { label: 'Diária',   color: '#6366f1' },
  semanal: { label: 'Semanal',  color: '#0ea5e9' },
  mensal:  { label: 'Mensal',   color: '#8b5cf6' },
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

function hojeAtivo(t: Tarefa): boolean {
  const hoje = new Date()
  if (t.frequencia === 'diaria') return true
  if (t.frequencia === 'semanal') return t.dias_semana?.includes(hoje.getDay()) ?? false
  if (t.frequencia === 'mensal') return t.dia_mes === hoje.getDate()
  return false
}

function isAtrasada(t: Tarefa, exec: Execucao | undefined): boolean {
  if (!t.horario_limit || exec?.feito) return false
  const agora = new Date()
  const [h, m] = t.horario_limit.split(':').map(Number)
  const limite = new Date(agora)
  limite.setHours(h, m, 0, 0)
  return agora > limite
}

export default function RotinasPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'minha' | 'gestor' | 'configurar'>('minha')
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [tarefasInativas, setTarefasInativas] = useState<Tarefa[]>([])
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [meuPerfil, setMeuPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoje] = useState(new Date().toISOString().split('T')[0])
  const [filtroFreq, setFiltroFreq] = useState<'todas' | 'diaria' | 'semanal' | 'mensal'>('diaria')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [fTitulo, setFTitulo] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fCategoria, setFCategoria] = useState('geral')
  const [fFreq, setFFreq] = useState<'diaria' | 'semanal' | 'mensal'>('diaria')
  const [fDiasSemana, setFDiasSemana] = useState<number[]>([])
  const [fDiaMes, setFDiaMes] = useState('')
  const [fHorario, setFHorario] = useState('')
  const [fResponsavel, setFResponsavel] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: tAtivas }, { data: tInativas }, { data: e }, { data: p }, { data: mp }] = await Promise.all([
      supabase.from('rotina_tarefas').select('*').eq('ativo', true).order('ordem'),
      supabase.from('rotina_tarefas').select('*').eq('ativo', false).order('titulo'),
      supabase.from('rotina_execucoes').select('*').eq('data_ref', hoje),
      supabase.from('perfis').select('id,nome,papel').eq('ativo', true),
      user ? supabase.from('perfis').select('id,nome,papel').eq('id', user.id).single() : Promise.resolve({ data: null }),
    ])
    setTarefas((tAtivas ?? []) as Tarefa[])
    setTarefasInativas((tInativas ?? []) as Tarefa[])
    setExecucoes((e ?? []) as Execucao[])
    setPerfis((p ?? []) as Perfil[])
    setMeuPerfil(mp as Perfil | null)
    setLoading(false)
  }, [supabase, hoje])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { const i = setInterval(() => fetchAll(), 60000); return () => clearInterval(i) }, [fetchAll])

  async function toggleExecucao(tarefa: Tarefa) {
    if (!meuPerfil) return
    const existing = execucoes.find(e => e.tarefa_id === tarefa.id && e.usuario_id === meuPerfil.id)
    const agora = new Date()
    const noPrazo = tarefa.horario_limit ? (() => {
      const [h, m] = tarefa.horario_limit!.split(':').map(Number)
      const limite = new Date(agora); limite.setHours(h, m, 0, 0); return agora <= limite
    })() : true
    if (existing) {
      await supabase.from('rotina_execucoes').update({ feito: !existing.feito, feito_em: !existing.feito ? agora.toISOString() : null }).eq('id', existing.id)
    } else {
      await supabase.from('rotina_execucoes').insert({ tarefa_id: tarefa.id, usuario_id: meuPerfil.id, data_ref: hoje, feito: true, feito_em: agora.toISOString(), no_prazo: noPrazo })
    }
    fetchAll()
  }

  function getExec(tarefaId: string, userId?: string) {
    return execucoes.find(e => e.tarefa_id === tarefaId && (userId ? e.usuario_id === userId : e.usuario_id === meuPerfil?.id))
  }

  async function desativar(t: Tarefa) {
    // Apenas desativa — não apaga
    await supabase.from('rotina_tarefas').update({ ativo: false }).eq('id', t.id)
    fetchAll()
  }

  async function reativar(t: Tarefa) {
    await supabase.from('rotina_tarefas').update({ ativo: true }).eq('id', t.id)
    fetchAll()
  }

  const tarefasHoje = tarefas.filter(t => hojeAtivo(t) && (t.responsavel_id === null || t.responsavel_id === meuPerfil?.id))
  const feitas = tarefasHoje.filter(t => getExec(t.id)?.feito)
  const pct = tarefasHoje.length > 0 ? Math.round(feitas.length / tarefasHoje.length * 100) : 0

  const resumoFuncionarios = perfis.map(p => {
    const tp = tarefas.filter(t => hojeAtivo(t) && (t.responsavel_id === null || t.responsavel_id === p.id))
    const fp = tp.filter(t => getExec(t.id, p.id)?.feito)
    const ap = tp.filter(t => !getExec(t.id, p.id)?.feito && isAtrasada(t, getExec(t.id, p.id)))
    return { perfil: p, total: tp.length, feitas: fp.length, pendentes: tp.length - fp.length, atrasadas: ap.length }
  })

  function abrirNovaTarefa() {
    setFTitulo(''); setFDesc(''); setFCategoria('geral'); setFFreq('diaria')
    setFDiasSemana([]); setFDiaMes(''); setFHorario(''); setFResponsavel(''); setEditId(null); setShowModal(true)
  }

  function abrirEdit(t: Tarefa) {
    setFTitulo(t.titulo); setFDesc(t.descricao ?? ''); setFCategoria(t.categoria)
    setFFreq(t.frequencia as typeof fFreq); setFDiasSemana(t.dias_semana ?? [])
    setFDiaMes(t.dia_mes ? String(t.dia_mes) : ''); setFHorario(t.horario_limit ?? '')
    setFResponsavel(t.responsavel_id ?? ''); setEditId(t.id); setShowModal(true)
  }

  async function salvarTarefa() {
    if (!fTitulo.trim()) return
    setSaving(true)
    const payload = {
      titulo: fTitulo.trim(), descricao: fDesc || null, categoria: fCategoria, frequencia: fFreq,
      dias_semana: fFreq === 'semanal' ? fDiasSemana : null,
      dia_mes: fFreq === 'mensal' && fDiaMes ? parseInt(fDiaMes) : null,
      horario_limit: fHorario || null, responsavel_id: fResponsavel || null,
    }
    if (editId) await supabase.from('rotina_tarefas').update(payload).eq('id', editId)
    else await supabase.from('rotina_tarefas').insert({ ...payload, ativo: true })
    setSaving(false); setShowModal(false); fetchAll()
  }

  const tarefasFiltradas = tarefas.filter(t => filtroFreq === 'todas' || t.frequencia === filtroFreq)
  const diaAtual = DIAS_SEMANA_FULL[new Date().getDay()]

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Rotinas & Checklist</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{diaAtual} · {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p>
        </div>
        {aba === 'configurar' && (
          <button onClick={abrirNovaTarefa} style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Nova tarefa</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        {([['minha', '✅ Minhas tarefas'], ['gestor', '👁 Painel gestor'], ['configurar', '⚙ Configurar']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#6366f1' : '#64748b', borderBottom: aba === k ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {/* ═══ MINHAS TAREFAS ═══ */}
      {aba === 'minha' && (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{feitas.length} de {tarefasHoje.length} concluídas</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{pct === 100 ? '🎉 Tudo feito!' : `${tarefasHoje.length - feitas.length} pendente(s)`}</p>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: pct === 100 ? '#10b981' : '#6366f1' }}>{pct}%</div>
            </div>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : '#6366f1', borderRadius: 4, transition: 'width 0.4s ease' }} />
            </div>
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div> :
           tarefasHoje.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhuma tarefa para hoje</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tarefasHoje.filter(t => !getExec(t.id)?.feito && isAtrasada(t, getExec(t.id))).length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 16px', marginBottom: 4, fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
                  ⚠ {tarefasHoje.filter(t => !getExec(t.id)?.feito && isAtrasada(t, getExec(t.id))).length} tarefa(s) atrasada(s)
                </div>
              )}
              {tarefasHoje.map(t => {
                const exec = getExec(t.id); const feita = exec?.feito ?? false; const atrasada = !feita && isAtrasada(t, exec)
                const cat = CATEGORIA_CONFIG[t.categoria] ?? CATEGORIA_CONFIG.geral
                return (
                  <div key={t.id} onClick={() => toggleExecucao(t)} style={{ background: feita ? '#f0fdf4' : atrasada ? '#fef2f2' : '#fff', border: `1px solid ${feita ? '#bbf7d0' : atrasada ? '#fecaca' : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, border: `2px solid ${feita ? '#10b981' : atrasada ? '#ef4444' : '#d1d5db'}`, background: feita ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {feita && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{cat.icon}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: feita ? '#065f46' : '#0f172a', textDecoration: feita ? 'line-through' : 'none', opacity: feita ? 0.7 : 1 }}>{t.titulo}</p>
                      {t.descricao && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{t.descricao}</p>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {t.horario_limit && <p style={{ fontSize: 12, fontWeight: 500, color: atrasada ? '#ef4444' : feita ? '#10b981' : '#64748b' }}>{atrasada ? '⚠ ' : ''}até {t.horario_limit.slice(0, 5)}</p>}
                      {exec?.feito_em && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>às {new Date(exec.feito_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ PAINEL GESTOR ═══ */}
      {aba === 'gestor' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 24 }}>
            {resumoFuncionarios.map(r => {
              const pctF = r.total > 0 ? Math.round(r.feitas / r.total * 100) : 0
              return (
                <div key={r.perfil.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>{r.perfil.nome.charAt(0).toUpperCase()}</div>
                      <div><p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{r.perfil.nome}</p><p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{r.perfil.papel}</p></div>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 700, color: pctF === 100 ? '#10b981' : pctF >= 50 ? '#f59e0b' : '#ef4444' }}>{pctF}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: `${pctF}%`, background: pctF === 100 ? '#10b981' : pctF >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ label: 'Feitas', v: r.feitas, bg: '#ecfdf5', c: '#065f46' }, { label: 'Pendentes', v: r.pendentes, bg: r.pendentes > 0 ? '#fef3c7' : '#f8fafc', c: r.pendentes > 0 ? '#92400e' : '#94a3b8' }, { label: 'Atrasadas', v: r.atrasadas, bg: r.atrasadas > 0 ? '#fef2f2' : '#f8fafc', c: r.atrasadas > 0 ? '#991b1b' : '#94a3b8' }].map(s => (
                      <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</p>
                        <p style={{ fontSize: 11, color: s.c }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ CONFIGURAR ═══ */}
      {aba === 'configurar' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['todas', 'diaria', 'semanal', 'mensal'] as const).map(f => (
              <button key={f} onClick={() => setFiltroFreq(f)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid', fontWeight: filtroFreq === f ? 500 : 400, background: filtroFreq === f ? '#e0e7ff' : '#fff', color: filtroFreq === f ? '#3730a3' : '#64748b', borderColor: filtroFreq === f ? '#818cf8' : '#e2e8f0' }}>
                {f === 'todas' ? 'Todas' : FREQ_CONFIG[f].label}
              </button>
            ))}
          </div>

          {/* Tarefas ativas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {tarefasFiltradas.map(t => {
              const cat = CATEGORIA_CONFIG[t.categoria] ?? CATEGORIA_CONFIG.geral
              const freq = FREQ_CONFIG[t.frequencia]
              return (
                <div key={t.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{cat.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{t.titulo}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: freq.color, fontWeight: 500 }}>{freq.label}</span>
                      {t.frequencia === 'semanal' && t.dias_semana && <span style={{ fontSize: 11, color: '#64748b' }}>{t.dias_semana.map(d => DIAS_SEMANA[d]).join(', ')}</span>}
                      {t.horario_limit && <span style={{ fontSize: 11, color: '#64748b' }}>até {t.horario_limit.slice(0, 5)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => abrirEdit(t)} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: '#fff', cursor: 'pointer', color: '#374151' }}>Editar</button>
                    <button onClick={() => desativar(t)} style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, background: '#fff', cursor: 'pointer', color: '#ef4444' }}>Desativar</button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Tarefas desativadas */}
          {tarefasInativas.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                  {tarefasInativas.length} tarefa{tarefasInativas.length > 1 ? 's' : ''} desativada{tarefasInativas.length > 1 ? 's' : ''}
                </span>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tarefasInativas.map(t => {
                  const cat = CATEGORIA_CONFIG[t.categoria] ?? CATEGORIA_CONFIG.geral
                  const freq = FREQ_CONFIG[t.frequencia]
                  return (
                    <div key={t.id} style={{ background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.7 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{cat.icon}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#64748b', textDecoration: 'line-through' }}>{t.titulo}</p>
                        <span style={{ fontSize: 11, color: freq.color, fontWeight: 500 }}>{freq.label}</span>
                      </div>
                      <button onClick={() => reativar(t)} style={{ padding: '6px 14px', border: '1px solid #86efac', borderRadius: 7, fontSize: 12, fontWeight: 500, background: '#f0fdf4', cursor: 'pointer', color: '#065f46' }}>
                        ↩ Reativar
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{editId ? 'Editar tarefa' : 'Nova tarefa'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lbl}>Título *</label><input style={inp} value={fTitulo} onChange={e => setFTitulo(e.target.value)} placeholder="Ex: Varrer e passar pano" /></div>
              <div><label style={lbl}>Descrição</label><input style={inp} value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Detalhes..." /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Categoria</label><select style={inp} value={fCategoria} onChange={e => setFCategoria(e.target.value)}>{Object.entries(CATEGORIA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
                <div><label style={lbl}>Frequência</label><select style={inp} value={fFreq} onChange={e => setFFreq(e.target.value as typeof fFreq)}><option value="diaria">Diária</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option></select></div>
              </div>
              {fFreq === 'semanal' && (
                <div><label style={lbl}>Dias da semana</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {DIAS_SEMANA.map((d, i) => (
                      <button key={i} onClick={() => setFDiasSemana(ds => ds.includes(i) ? ds.filter(x => x !== i) : [...ds, i])} style={{ flex: 1, padding: '8px 4px', borderRadius: 7, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: fDiasSemana.includes(i) ? '#e0e7ff' : '#fff', color: fDiasSemana.includes(i) ? '#3730a3' : '#64748b', borderColor: fDiasSemana.includes(i) ? '#818cf8' : '#e2e8f0' }}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              {fFreq === 'mensal' && <div><label style={lbl}>Dia do mês (1–31)</label><input style={inp} type="number" min="1" max="31" value={fDiaMes} onChange={e => setFDiaMes(e.target.value)} /></div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Horário limite</label><input style={inp} type="time" value={fHorario} onChange={e => setFHorario(e.target.value)} /></div>
                <div><label style={lbl}>Responsável</label><select style={inp} value={fResponsavel} onChange={e => setFResponsavel(e.target.value)}><option value="">Todos</option>{perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
              </div>
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarTarefa} disabled={saving} style={{ padding: '8px 18px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
