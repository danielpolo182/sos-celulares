'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Tarefa = {
  id: string; titulo: string; descricao: string | null; categoria: string
  frequencia: string; dias_semana: number[] | null; dia_mes: number | null
  horario_limit: string | null; responsavel_id: string | null; ativo: boolean; ordem: number
}

type Execucao = {
  id: string; tarefa_id: string; usuario_id: string
  data_ref: string; feito: boolean; feito_em: string | null
}

type Perfil = { id: string; nome: string; papel: string }

type WAPendencia = {
  tipo: string; cliente_id: string | null; os_id: string | null
  nome: string; telefone: string | null; valor: number | null
  dias: number | null; enviado_hoje: boolean
}

type WAResumo = { tipo: string; total: number; enviados: number; pendentes: number }

const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','SÃ¡b']
const DIAS_SEMANA_FULL = ['Domingo','Segunda','TerÃ§a','Quarta','Quinta','Sexta','SÃ¡bado']

const CATEGORIA_CONFIG: Record<string, { icon: string; label: string; bg: string; color: string }> = {
  limpeza:        { icon: 'ðŸ§¹', label: 'Limpeza',        bg: '#E1F5EE', color: '#085041' },
  administrativo: { icon: 'ðŸ“‹', label: 'Administrativo', bg: '#E6F1FB', color: '#0C447C' },
  atendimento:    { icon: 'ðŸ“ž', label: 'Atendimento',    bg: '#EEEDFE', color: '#3C3489' },
  estoque:        { icon: 'ðŸ“¦', label: 'Estoque',        bg: '#FAEEDA', color: '#633806' },
  financeiro:     { icon: 'ðŸ’°', label: 'Financeiro',     bg: '#EAF3DE', color: '#27500A' },
  marketing:      { icon: 'ðŸ“£', label: 'Marketing',      bg: '#FAECE7', color: '#712B13' },
  geral:          { icon: 'âœ”',  label: 'Geral',          bg: '#f1f5f9', color: '#475569' },
}

const WA_TIPO_CONFIG: Record<string, { label: string; icon: string; templateKey: string }> = {
  aniversario:            { label: 'Aniversariantes',    icon: 'ðŸŽ‚', templateKey: 'wa_aniversario' },
  os_pronta_nao_retirada: { label: 'OS prontas',         icon: 'â°', templateKey: 'wa_os_pronta_nao_retirada' },
  aparelho_90dias:        { label: '+90 dias',           icon: 'ðŸ“¦', templateKey: 'wa_retirada_90dias' },
  cliente_inativo:        { label: 'Inativos',           icon: 'ðŸ˜´', templateKey: 'wa_cliente_inativo' },
  nunca_retornou:         { label: 'NÃ£o retornaram',     icon: 'ðŸ‘‹', templateKey: 'wa_nunca_retornou' },
}

const FREQ_CONFIG: Record<string, { label: string; color: string }> = {
  diaria:  { label: 'DiÃ¡ria',  color: '#2563eb' },
  semanal: { label: 'Semanal', color: '#0ea5e9' },
  mensal:  { label: 'Mensal',  color: '#8b5cf6' },
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

function formatPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
}

function buildMensagem(template: string, p: WAPendencia): string {
  const nome = p.nome?.split(' ')[0] ?? 'cliente'
  return template
    .replace(/{nome}/g, nome)
    .replace(/{modelo}/g, 'aparelho')
    .replace(/{numero}/g, '')
    .replace(/{valor}/g, p.valor ? `R$ ${p.valor.toFixed(2).replace('.', ',')}` : 'a combinar')
    .replace(/{dias}/g, String(p.dias ?? ''))
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

  // WhatsApp integrado
  const [waAtivo, setWaAtivo] = useState(false)
  const [waPendencias, setWaPendencias] = useState<WAPendencia[]>([])
  const [waResumo, setWaResumo] = useState<WAResumo[]>([])
  const [waConfig, setWaConfig] = useState<Record<string, string>>({})
  const [waModal, setWaModal] = useState<{ pendencia: WAPendencia; mensagem: string } | null>(null)

  // Modal tarefa
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [fTitulo, setFTitulo] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fCategoria, setFCategoria] = useState('geral')
  const [fFreq, setFFreq] = useState<'diaria' | 'semanal' | 'mensal'>('diaria')
  const [fDiasSemana, setFDiasSemana] = useState<number[]>([])
  const [fDiaMes, setFDiaMes] = useState('')
  const [fHorario, setFHorario] = useState('')
  const [fResponsavel, setFResponsavel] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [
      { data: tAtivas }, { data: tInativas }, { data: e },
      { data: p }, { data: mp }, { data: cfgWA }, { data: pend }, { data: res }
    ] = await Promise.all([
      supabase.from('rotina_tarefas').select('*').eq('ativo', true).order('ordem'),
      supabase.from('rotina_tarefas').select('*').eq('ativo', false).order('titulo'),
      supabase.from('rotina_execucoes').select('*').eq('data_ref', hoje),
      supabase.from('perfis').select('id,nome,papel').eq('ativo', true),
      user ? supabase.from('perfis').select('id,nome,papel').eq('id', user.id).single() : Promise.resolve({ data: null }),
      supabase.from('sistema_config').select('chave,valor').in('chave', [
        'rotinas_wa_ativo', 'rotinas_wa_aniversario', 'rotinas_wa_os_pronta',
        'rotinas_wa_90dias', 'rotinas_wa_inativos',
        'wa_aniversario', 'wa_os_pronta_nao_retirada', 'wa_retirada_90dias',
        'wa_cliente_inativo', 'wa_nunca_retornou',
      ]),
      supabase.from('vw_wa_pendencias_dia').select('*').order('enviado_hoje').order('dias', { ascending: false }),
      supabase.from('vw_wa_resumo_dia').select('*'),
    ])

    setTarefas((tAtivas ?? []) as Tarefa[])
    setTarefasInativas((tInativas ?? []) as Tarefa[])
    setExecucoes((e ?? []) as Execucao[])
    setPerfis((p ?? []) as Perfil[])
    setMeuPerfil(mp as Perfil | null)
    setWaPendencias((pend ?? []) as WAPendencia[])
    setWaResumo((res ?? []) as WAResumo[])

    const cfg: Record<string, string> = {}
    cfgWA?.forEach(c => { cfg[c.chave] = c.valor })
    setWaConfig(cfg)
    setWaAtivo(cfg.rotinas_wa_ativo === 'true')
    setLoading(false)
  }, [supabase, hoje])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    const i = setInterval(() => fetchAll(), 60000)
    return () => clearInterval(i)
  }, [fetchAll])

  async function toggleExecucao(tarefa: Tarefa) {
    if (!meuPerfil) return

    // Se a tarefa tem WhatsApp pendente, bloqueia
    if (waAtivo && tarefa.categoria === 'marketing') {
      const pendentes = waPendencias.filter(p => !p.enviado_hoje)
      if (pendentes.length > 0) {
        alert(`âš  Ainda hÃ¡ ${pendentes.length} mensagem(ns) de WhatsApp pendente(s). Envie todas antes de marcar esta tarefa como feita.`)
        return
      }
    }

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

  async function enviarWA(p: WAPendencia, mensagem: string) {
    const num = p.telefone!.replace(/\D/g, '')
    window.open(`https://wa.me/55${num}?text=${encodeURIComponent(mensagem)}`, '_blank')
    await supabase.from('wa_logs').insert({
      tipo: p.tipo, cliente_id: p.cliente_id, os_id: p.os_id,
      telefone: p.telefone!, mensagem, data_ref: hoje,
    })
    setWaModal(null)
    fetchAll()
  }

  function getExec(tarefaId: string, userId?: string) {
    return execucoes.find(e => e.tarefa_id === tarefaId && (userId ? e.usuario_id === userId : e.usuario_id === meuPerfil?.id))
  }

  async function desativar(t: Tarefa) { await supabase.from('rotina_tarefas').update({ ativo: false }).eq('id', t.id); fetchAll() }
  async function reativar(t: Tarefa) { await supabase.from('rotina_tarefas').update({ ativo: true }).eq('id', t.id); fetchAll() }

  const tarefasHoje = tarefas.filter(t => hojeAtivo(t) && (t.responsavel_id === null || t.responsavel_id === meuPerfil?.id))
  const feitas = tarefasHoje.filter(t => getExec(t.id)?.feito)
  const waPendentesTotal = waPendencias.filter(p => !p.enviado_hoje).length
  const pct = tarefasHoje.length > 0 ? Math.round(feitas.length / tarefasHoje.length * 100) : 0

  const resumoFuncionarios = perfis.map(p => {
    const tp = tarefas.filter(t => hojeAtivo(t) && (t.responsavel_id === null || t.responsavel_id === p.id))
    const fp = tp.filter(t => getExec(t.id, p.id)?.feito)
    const ap = tp.filter(t => !getExec(t.id, p.id)?.feito && isAtrasada(t, getExec(t.id, p.id)))
    return { perfil: p, total: tp.length, feitas: fp.length, pendentes: tp.length - fp.length, atrasadas: ap.length }
  })

  function abrirNovaTarefa() {
    setFTitulo(''); setFDesc(''); setFCategoria('geral'); setFFreq('diaria')
    setFDiasSemana([]); setFDiaMes(''); setFHorario(''); setFResponsavel('')
    setEditId(null); setShowModal(true)
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

  // Tipos de WA ativos conforme configuraÃ§Ã£o
  const waAtivosTypes = Object.keys(WA_TIPO_CONFIG).filter(tipo => {
    if (tipo === 'aniversario') return waConfig.rotinas_wa_aniversario !== 'false'
    if (tipo === 'os_pronta_nao_retirada') return waConfig.rotinas_wa_os_pronta !== 'false'
    if (tipo === 'aparelho_90dias') return waConfig.rotinas_wa_90dias !== 'false'
    if (tipo === 'cliente_inativo') return waConfig.rotinas_wa_inativos !== 'false'
    return true
  })

  const waPendenciasFiltradas = waPendencias.filter(p => waAtivosTypes.includes(p.tipo))

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Rotinas & Checklist</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{diaAtual} Â· {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p>
        </div>
        {aba === 'configurar' && (
          <button onClick={abrirNovaTarefa} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Nova tarefa</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        {([['minha', 'âœ… Minhas tarefas'], ['gestor', 'ðŸ‘ Painel gestor'], ['configurar', 'âš™ Configurar']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#2563eb' : '#64748b', borderBottom: aba === k ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {/* â•â•â• MINHAS TAREFAS â•â•â• */}
      {aba === 'minha' && (
        <div>
          {/* Progresso geral */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{feitas.length} de {tarefasHoje.length} tarefas concluÃ­das</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {pct === 100 && (!waAtivo || waPendentesTotal === 0) ? 'ðŸŽ‰ Dia completo!' : `${tarefasHoje.length - feitas.length} pendente(s)`}
                  {waAtivo && waPendentesTotal > 0 && <span style={{ color: '#f59e0b', marginLeft: 8 }}>Â· {waPendentesTotal} WhatsApp(s) pendente(s)</span>}
                </p>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: pct === 100 ? '#10b981' : '#2563eb' }}>{pct}%</div>
            </div>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 && (!waAtivo || waPendentesTotal === 0) ? '#10b981' : '#2563eb', borderRadius: 4, transition: 'width 0.4s ease' }} />
            </div>
          </div>

          {/* â”€â”€ SUBLISTA WHATSAPP (se ativo nas configs) */}
          {waAtivo && waPendenciasFiltradas.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>
                    ðŸ’¬ Mensagens WhatsApp do dia
                    {waPendentesTotal > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>
                        {waPendentesTotal} pendente(s)
                      </span>
                    )}
                    {waPendentesTotal === 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 20 }}>âœ“ Todas enviadas</span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: '#065f46', opacity: 0.7, marginTop: 2 }}>Envie todas antes de fechar as tarefas de marketing</p>
                </div>
              </div>

              {/* Agrupado por tipo */}
              {waAtivosTypes.map(tipo => {
                const itens = waPendenciasFiltradas.filter(p => p.tipo === tipo)
                if (itens.length === 0) return null
                const tc = WA_TIPO_CONFIG[tipo]
                const pendentes = itens.filter(p => !p.enviado_hoje).length

                return (
                  <div key={tipo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ padding: '10px 18px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{tc.icon} {tc.label}</span>
                      {pendentes > 0
                        ? <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>{pendentes} pendente(s)</span>
                        : <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>âœ“ ConcluÃ­do</span>
                      }
                    </div>
                    {itens.map((p, i) => {
                      const template = waConfig[tc.templateKey] ?? ''
                      const mensagem = buildMensagem(template, p)
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #f8fafc', background: p.enviado_hoje ? '#f8fffe' : '#fff' }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{p.nome}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8' }}>
                              {p.telefone ? formatPhone(p.telefone) : 'Sem telefone'}
                              {p.dias != null && <span style={{ marginLeft: 8 }}>Â· {p.dias} dias</span>}
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {p.enviado_hoje && <span style={{ fontSize: 11, color: '#065f46', fontWeight: 500 }}>âœ“ Enviado</span>}
                            {p.telefone && (
                              <button onClick={() => setWaModal({ pendencia: p, mensagem })} style={{
                                padding: '6px 12px', borderRadius: 7, border: '1px solid',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                                background: p.enviado_hoje ? '#f0fdf4' : '#fff',
                                color: p.enviado_hoje ? '#065f46' : '#374151',
                                borderColor: p.enviado_hoje ? '#86efac' : '#e2e8f0',
                              }}>
                                ðŸ’¬ {p.enviado_hoje ? 'Reenviar' : 'Enviar'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tarefas do dia */}
          {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div> :
           tarefasHoje.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>ðŸ“‹</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhuma tarefa para hoje</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tarefasHoje.filter(t => !getExec(t.id)?.feito && isAtrasada(t, getExec(t.id))).length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
                  âš  {tarefasHoje.filter(t => !getExec(t.id)?.feito && isAtrasada(t, getExec(t.id))).length} tarefa(s) atrasada(s)
                </div>
              )}
              {tarefasHoje.map(t => {
                const exec = getExec(t.id)
                const feita = exec?.feito ?? false
                const atrasada = !feita && isAtrasada(t, exec)
                const cat = CATEGORIA_CONFIG[t.categoria] ?? CATEGORIA_CONFIG.geral
                const bloqueadaPorWA = waAtivo && t.categoria === 'marketing' && waPendentesTotal > 0 && !feita

                return (
                  <div key={t.id} onClick={() => toggleExecucao(t)} style={{
                    background: feita ? '#f0fdf4' : atrasada ? '#fef2f2' : bloqueadaPorWA ? '#fffbeb' : '#fff',
                    border: `1px solid ${feita ? '#bbf7d0' : atrasada ? '#fecaca' : bloqueadaPorWA ? '#fde68a' : '#e2e8f0'}`,
                    borderRadius: 10, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    cursor: bloqueadaPorWA ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, border: `2px solid ${feita ? '#10b981' : bloqueadaPorWA ? '#fbbf24' : atrasada ? '#ef4444' : '#d1d5db'}`, background: feita ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {feita && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>âœ“</span>}
                      {bloqueadaPorWA && !feita && <span style={{ fontSize: 12 }}>ðŸ”’</span>}
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{cat.icon}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: feita ? '#065f46' : '#0f172a', textDecoration: feita ? 'line-through' : 'none', opacity: feita ? 0.7 : 1 }}>{t.titulo}</p>
                      {bloqueadaPorWA && <p style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>âš  Envie todas as mensagens de WhatsApp primeiro</p>}
                      {t.descricao && !bloqueadaPorWA && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{t.descricao}</p>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {t.horario_limit && <p style={{ fontSize: 12, fontWeight: 500, color: atrasada ? '#ef4444' : feita ? '#10b981' : '#64748b' }}>{atrasada ? 'âš  ' : ''}atÃ© {t.horario_limit.slice(0, 5)}</p>}
                      {exec?.feito_em && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Ã s {new Date(exec.feito_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* â•â•â• PAINEL GESTOR â•â•â• */}
      {aba === 'gestor' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 24 }}>
            {resumoFuncionarios.map(r => {
              const pctF = r.total > 0 ? Math.round(r.feitas / r.total * 100) : 0
              return (
                <div key={r.perfil.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>{r.perfil.nome.charAt(0).toUpperCase()}</div>
                      <div><p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{r.perfil.nome}</p><p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{r.perfil.papel}</p></div>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 700, color: pctF === 100 ? '#10b981' : pctF >= 50 ? '#f59e0b' : '#ef4444' }}>{pctF}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: `${pctF}%`, background: pctF === 100 ? '#10b981' : pctF >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ l: 'Feitas', v: r.feitas, bg: '#ecfdf5', c: '#065f46' }, { l: 'Pendentes', v: r.pendentes, bg: r.pendentes > 0 ? '#fef3c7' : '#f8fafc', c: r.pendentes > 0 ? '#92400e' : '#94a3b8' }, { l: 'Atrasadas', v: r.atrasadas, bg: r.atrasadas > 0 ? '#fef2f2' : '#f8fafc', c: r.atrasadas > 0 ? '#991b1b' : '#94a3b8' }].map(s => (
                      <div key={s.l} style={{ flex: 1, background: s.bg, borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</p>
                        <p style={{ fontSize: 11, color: s.c }}>{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Resumo WA do dia */}
          {waAtivo && waResumo.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>ðŸ’¬ WhatsApp do dia â€” progresso</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {waResumo.map(r => {
                  const tc = WA_TIPO_CONFIG[r.tipo]
                  if (!tc) return null
                  return (
                    <div key={r.tipo} style={{ flex: 1, minWidth: 120, background: r.pendentes === 0 ? '#ecfdf5' : '#fef3c7', border: `1px solid ${r.pendentes === 0 ? '#bbf7d0' : '#fde68a'}`, borderRadius: 10, padding: '10px 14px' }}>
                      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{tc.icon} {tc.label}</p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: r.pendentes === 0 ? '#065f46' : '#92400e' }}>{r.enviados}/{r.total}</p>
                      <p style={{ fontSize: 10, color: r.pendentes === 0 ? '#065f46' : '#92400e' }}>{r.pendentes === 0 ? 'âœ“ Completo' : `${r.pendentes} pendente(s)`}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* â•â•â• CONFIGURAR â•â•â• */}
      {aba === 'configurar' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['todas','diaria','semanal','mensal'] as const).map(f => (
              <button key={f} onClick={() => setFiltroFreq(f)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid', fontWeight: filtroFreq === f ? 500 : 400, background: filtroFreq === f ? '#dbeafe' : '#fff', color: filtroFreq === f ? '#1d4ed8' : '#64748b', borderColor: filtroFreq === f ? '#60a5fa' : '#e2e8f0' }}>
                {f === 'todas' ? 'Todas' : FREQ_CONFIG[f].label}
              </button>
            ))}
          </div>

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
                      {t.horario_limit && <span style={{ fontSize: 11, color: '#64748b' }}>atÃ© {t.horario_limit.slice(0, 5)}</span>}
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

          {/* Desativadas */}
          {tarefasInativas.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{tarefasInativas.length} desativada(s)</span>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tarefasInativas.map(t => {
                  const cat = CATEGORIA_CONFIG[t.categoria] ?? CATEGORIA_CONFIG.geral
                  return (
                    <div key={t.id} style={{ background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.7 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{cat.icon}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#64748b', textDecoration: 'line-through' }}>{t.titulo}</p>
                        <span style={{ fontSize: 11, color: FREQ_CONFIG[t.frequencia]?.color ?? '#94a3b8', fontWeight: 500 }}>{FREQ_CONFIG[t.frequencia]?.label}</span>
                      </div>
                      <button onClick={() => reativar(t)} style={{ padding: '6px 14px', border: '1px solid #86efac', borderRadius: 7, fontSize: 12, fontWeight: 500, background: '#f0fdf4', cursor: 'pointer', color: '#065f46' }}>â†© Reativar</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Nova Tarefa */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{editId ? 'Editar tarefa' : 'Nova tarefa'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>Ã—</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lbl}>TÃ­tulo *</label><input style={inp} value={fTitulo} onChange={e => setFTitulo(e.target.value)} placeholder="Ex: Varrer e passar pano" /></div>
              <div><label style={lbl}>DescriÃ§Ã£o</label><input style={inp} value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Detalhes..." /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Categoria</label><select style={inp} value={fCategoria} onChange={e => setFCategoria(e.target.value)}>{Object.entries(CATEGORIA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
                <div><label style={lbl}>FrequÃªncia</label><select style={inp} value={fFreq} onChange={e => setFFreq(e.target.value as typeof fFreq)}><option value="diaria">DiÃ¡ria</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option></select></div>
              </div>
              {fFreq === 'semanal' && (
                <div><label style={lbl}>Dias da semana</label>
                  <div style={{ display: 'flex', gap: 6 }}>{DIAS_SEMANA.map((d, i) => (<button key={i} onClick={() => setFDiasSemana(ds => ds.includes(i) ? ds.filter(x => x !== i) : [...ds, i])} style={{ flex: 1, padding: '8px 4px', borderRadius: 7, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: fDiasSemana.includes(i) ? '#dbeafe' : '#fff', color: fDiasSemana.includes(i) ? '#1d4ed8' : '#64748b', borderColor: fDiasSemana.includes(i) ? '#60a5fa' : '#e2e8f0' }}>{d}</button>))}</div>
                </div>
              )}
              {fFreq === 'mensal' && <div><label style={lbl}>Dia do mÃªs (1â€“31)</label><input style={inp} type="number" min="1" max="31" value={fDiaMes} onChange={e => setFDiaMes(e.target.value)} /></div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>HorÃ¡rio limite</label><input style={inp} type="time" value={fHorario} onChange={e => setFHorario(e.target.value)} /></div>
                <div><label style={lbl}>ResponsÃ¡vel</label><select style={inp} value={fResponsavel} onChange={e => setFResponsavel(e.target.value)}><option value="">Todos</option>{perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
              </div>
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarTarefa} disabled={saving} style={{ padding: '8px 18px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal WA */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>ðŸ’¬ Confirmar envio</h3>
              <button onClick={() => setWaModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>Ã—</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                Para: <strong style={{ color: '#0f172a' }}>{waModal.pendencia.nome}</strong>
                {waModal.pendencia.telefone && <span style={{ marginLeft: 8, color: '#94a3b8' }}>Â· {formatPhone(waModal.pendencia.telefone)}</span>}
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto', marginBottom: 14 }}>
                {waModal.mensagem}
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Ao confirmar, o WhatsApp abre e o envio fica registrado no sistema. Se nÃ£o enviar, clique em Cancelar.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setWaModal(null)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                <button onClick={() => enviarWA(waModal.pendencia, waModal.mensagem)} style={{ flex: 2, padding: '9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  ðŸ’¬ Abrir WhatsApp e registrar âœ“
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

