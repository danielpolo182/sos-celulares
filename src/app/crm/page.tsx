'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Cliente = {
  id: string; nome: string; telefone: string | null; email: string | null
  data_nascimento: string | null; score_crm: number; nivel_crm: string
  total_os: number; total_gasto: number; ultima_os_em: string | null
  status_crm: string; created_at: string
}

type Pendencia = {
  tipo: string; cliente_id: string | null; os_id: string | null
  nome: string; telefone: string | null; valor: number | null
  dias: number | null; idade: number | null; enviado_hoje: boolean
}

type WAResumo = { tipo: string; total: number; enviados: number; pendentes: number }
type Anotacao = { id: string; texto: string; created_at: string; perfis: { nome: string } | null }
type Avaliacao = { id: string; nota: number; comentario: string | null; respondido_em: string | null; created_at: string }
type OSCliente = { id: string; numero: number; status: string; modelo: string | null; valor_final: number | null; valor_orcamento: number | null; created_at: string; defeito_relatado: string }
type Segmento = { id: string; nome: string; cor_hex: string }
type Campanha = { id: string; nome: string; status: string; mensagem: string; segmento_id: string | null; total_destinat: number; total_enviados: number; created_at: string }
type Agendamento = { id: string; tipo: string; mensagem: string; agendado_para: string; status: string; clientes: { nome: string } | null }

const NIVEL_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  vip:      { label: 'VIP',       bg: '#ecfdf5', color: '#065f46', icon: '⭐' },
  regular:  { label: 'Regular',   bg: '#eff6ff', color: '#1d4ed8', icon: '✓' },
  em_risco: { label: 'Em risco',  bg: '#fef3c7', color: '#92400e', icon: '⚠' },
  perdido:  { label: 'Perdido',   bg: '#fef2f2', color: '#991b1b', icon: '✗' },
  novo:     { label: 'Novo',      bg: '#eff6ff', color: '#6b21a8', icon: '✦' },
}

const WA_TIPO_CONFIG: Record<string, { label: string; icon: string; templateKey: string }> = {
  aniversario:            { label: 'Aniversariantes',  icon: '🎂', templateKey: 'wa_aniversario' },
  os_pronta_nao_retirada: { label: 'OS prontas',       icon: '⏰', templateKey: 'wa_os_pronta_nao_retirada' },
  aparelho_90dias:        { label: '+90 dias',         icon: '📦', templateKey: 'wa_retirada_90dias' },
  cliente_inativo:        { label: 'Inativos',         icon: '😴', templateKey: 'wa_cliente_inativo' },
  nunca_retornou:         { label: 'Não retornaram',   icon: '👋', templateKey: 'wa_nunca_retornou' },
}

function formatPhone(v: string) {
  return v.replace(/\D/g,'').slice(0,11).replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4,5})(\d{4})$/,'$1-$2')
}
function fm(v: number) { return `R$ ${v.toFixed(2).replace('.',',')}` }
function buildMsg(template: string, p: Pendencia) {
  return template.replace(/{nome}/g,p.nome?.split(' ')[0]??'cliente').replace(/{modelo}/g,'aparelho').replace(/{numero}/g,'').replace(/{valor}/g,p.valor?`R$ ${p.valor.toFixed(2).replace('.',',')}`:'-').replace(/{dias}/g,String(p.dias??''))
}

const ABAS = [
  ['acompanhamento','💬 Acompanhamento'],
  ['clientes','👥 Clientes'],
  ['timeline','📋 Linha do tempo'],
  ['segmentos','🏷 Segmentos'],
  ['campanhas','📣 Campanhas'],
  ['agendamentos','⏱ Agendamentos'],
  ['avaliacoes','⭐ NPS / Avaliações'],
] as const

const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:7, fontSize:13, color:'#1e293b', background:'#fff', outline:'none', fontFamily:'inherit' }

export default function CRMPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<typeof ABAS[number][0]>('acompanhamento')
  const [loading, setLoading] = useState(true)

  // Acompanhamento
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [waResumo, setWaResumo] = useState<WAResumo[]>([])
  const [waConfig, setWaConfig] = useState<Record<string,string>>({})
  const [waModal, setWaModal] = useState<{p:Pendencia;msg:string}|null>(null)
  const [mostrarEnviados, setMostrarEnviados] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [enviandoId, setEnviandoId] = useState<string|null>(null)

  // Clientes
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteSearch, setClienteSearch] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('todos')
  const [clienteSel, setClienteSel] = useState<Cliente|null>(null)

  // Timeline
  const [timelineOS, setTimelineOS] = useState<OSCliente[]>([])
  const [timelineWA, setTimelineWA] = useState<any[]>([])
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([])
  const [novaAnotacao, setNovaAnotacao] = useState('')
  const [savingAnotacao, setSavingAnotacao] = useState(false)

  // Segmentos
  const [segmentos, setSegmentos] = useState<Segmento[]>([])
  const [segmentoSel, setSegmentoSel] = useState<string|null>(null)
  const [membrosSegmento, setMembrosSegmento] = useState<Cliente[]>([])

  // Campanhas
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [showCampanha, setShowCampanha] = useState(false)
  const [cNome, setCNome] = useState('')
  const [cMsg, setCMsg] = useState('')
  const [cSegmento, setCSegmento] = useState('')
  const [savingCampanha, setSavingCampanha] = useState(false)
  const [campanhaAberta, setCampanhaAberta] = useState<Campanha | null>(null)
  const [clientesCampanha, setClientesCampanha] = useState<Cliente[]>([])
  const [loadingClientesCampanha, setLoadingClientesCampanha] = useState(false)
  const [enviandoCampanha, setEnviandoCampanha] = useState<string | null>(null)

  // Agendamentos
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])

  // NPS
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])

  const hoje = new Date().toISOString().split('T')[0]

  const fetchAcompanhamento = useCallback(async () => {
    const [{ data: pend }, { data: res }, { data: cfg }] = await Promise.all([
      supabase.from('vw_wa_pendencias_dia').select('*').order('enviado_hoje').order('dias',{ascending:false}),
      supabase.from('vw_wa_resumo_dia').select('*'),
      supabase.from('sistema_config').select('chave,valor').in('chave',['wa_aniversario','wa_os_pronta_nao_retirada','wa_retirada_90dias','wa_cliente_inativo','wa_nunca_retornou']),
    ])
    setPendencias((pend??[]) as Pendencia[])
    setWaResumo((res??[]) as WAResumo[])
    const c:Record<string,string>={};(cfg??[]).forEach((x:any)=>{c[x.chave]=x.valor});setWaConfig(c)
  }, [supabase])

  const fetchClientes = useCallback(async () => {
    let q = supabase.from('clientes').select('*').is('deleted_at',null).order('score_crm',{ascending:false}).limit(200)
    if (clienteSearch) q = q.ilike('nome',`%${clienteSearch}%`)
    if (filtroNivel !== 'todos') q = q.eq('nivel_crm',filtroNivel)
    const { data } = await q; setClientes((data??[]) as Cliente[])
  }, [supabase, clienteSearch, filtroNivel])

  const fetchTimeline = useCallback(async (clienteId: string) => {
    const [{ data: os }, { data: wa }, { data: an }] = await Promise.all([
      supabase.from('ordens_servico').select('id,numero,status,modelo,valor_final,valor_orcamento,created_at,defeito_relatado').eq('cliente_id',clienteId).is('deleted_at',null).order('created_at',{ascending:false}),
      supabase.from('wa_logs').select('*').eq('cliente_id',clienteId).order('enviado_em',{ascending:false}).limit(30),
      supabase.from('cliente_anotacoes').select('*,perfis:usuario_id(nome)').eq('cliente_id',clienteId).order('created_at',{ascending:false}),
    ])
    setTimelineOS((os??[]) as OSCliente[])
    setTimelineWA(wa??[])
    setAnotacoes((an??[]) as unknown as Anotacao[])
  }, [supabase])

  const fetchSegmentos = useCallback(async () => {
    const { data } = await supabase.from('cliente_segmentos').select('id,nome,cor_hex').eq('ativo',true).order('nome')
    setSegmentos((data??[]) as Segmento[])
  }, [supabase])

  const fetchMembros = useCallback(async (segId: string) => {
    const { data } = await supabase.from('cliente_segmento_membros').select('clientes(*)').eq('segmento_id',segId).limit(100)
    setMembrosSegmento((data??[]).map((m:any)=>m.clientes).filter(Boolean) as Cliente[])
  }, [supabase])

  const fetchCampanhas = useCallback(async () => {
    const { data } = await supabase.from('campanhas').select('*').order('created_at',{ascending:false}).limit(50)
    setCampanhas((data??[]) as Campanha[])
  }, [supabase])

  const fetchAgendamentos = useCallback(async () => {
    const { data } = await supabase.from('wa_agendamentos').select('*,clientes:cliente_id(nome)').in('status',['pendente']).order('agendado_para').limit(50)
    setAgendamentos((data??[]) as unknown as Agendamento[])
  }, [supabase])

  const fetchAvaliacoes = useCallback(async () => {
    const { data } = await supabase.from('cliente_avaliacoes').select('id,nota,comentario,respondido_em,created_at').not('nota','is',null).order('respondido_em',{ascending:false}).limit(100)
    setAvaliacoes((data??[]) as Avaliacao[])
  }, [supabase])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchAcompanhamento(), fetchClientes(), fetchSegmentos()]).finally(() => setLoading(false))
  }, [fetchAcompanhamento, fetchClientes, fetchSegmentos])

  useEffect(() => { if (aba === 'campanhas') fetchCampanhas() }, [aba, fetchCampanhas])
  useEffect(() => { if (aba === 'agendamentos') fetchAgendamentos() }, [aba, fetchAgendamentos])
  useEffect(() => { if (aba === 'avaliacoes') fetchAvaliacoes() }, [aba, fetchAvaliacoes])
  useEffect(() => { if (clienteSel) fetchTimeline(clienteSel.id) }, [clienteSel, fetchTimeline])
  useEffect(() => { if (segmentoSel) fetchMembros(segmentoSel) }, [segmentoSel, fetchMembros])

  async function confirmarWA(p: Pendencia, msg: string) {
    const uid = p.os_id??p.cliente_id; if (!uid) return
    setEnviandoId(uid)
    window.open(`https://wa.me/55${p.telefone!.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`,'_blank')
    await supabase.from('wa_logs').insert({ tipo:p.tipo, cliente_id:p.cliente_id, os_id:p.os_id, telefone:p.telefone!, mensagem:msg, data_ref:hoje })
    setEnviandoId(null); setWaModal(null); fetchAcompanhamento()
  }

  async function salvarAnotacao() {
    if (!novaAnotacao.trim() || !clienteSel) return
    setSavingAnotacao(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('cliente_anotacoes').insert({ cliente_id:clienteSel.id, texto:novaAnotacao.trim(), usuario_id:user?.id })
    setNovaAnotacao(''); setSavingAnotacao(false); fetchTimeline(clienteSel.id)
  }

  async function excluirAnotacao(id: string) {
    await supabase.from('cliente_anotacoes').delete().eq('id',id); fetchTimeline(clienteSel!.id)
  }

  async function salvarCampanha() {
    if (!cNome.trim() || !cMsg.trim()) return
    setSavingCampanha(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('campanhas').insert({ nome:cNome.trim(), mensagem:cMsg, segmento_id:cSegmento||null, status:'rascunho', criado_por:user?.id })
    setSavingCampanha(false); setShowCampanha(false); setCNome(''); setCMsg(''); setCSegmento(''); fetchCampanhas()
  }

  async function abrirCampanha(c: Campanha) {
    setCampanhaAberta(c)
    setLoadingClientesCampanha(true)
    let clientes: Cliente[] = []
    if (c.segmento_id) {
      const { data } = await supabase.from('cliente_segmento_membros')
        .select('clientes(*)')
        .eq('segmento_id', c.segmento_id)
        .limit(200)
      clientes = ((data ?? []).map((m: any) => m.clientes).filter(Boolean) as Cliente[])
        .filter(cl => cl.telefone && cl.telefone.replace(/\D/g, '').length >= 10)
    } else {
      const { data } = await supabase.from('clientes')
        .select('*').is('deleted_at', null)
        .not('telefone', 'is', null)
        .neq('telefone', '')
        .order('nome').limit(200)
      clientes = ((data ?? []) as Cliente[])
        .filter(cl => cl.telefone && cl.telefone.replace(/\D/g, '').length >= 10)
    }
    setClientesCampanha(clientes)
    setLoadingClientesCampanha(false)
  }

  async function enviarWACampanha(campanha: Campanha, cliente: Cliente) {
    if (!cliente.telefone) return
    setEnviandoCampanha(cliente.id)
    const msg = campanha.mensagem.replace(/{nome}/g, cliente.nome.split(' ')[0])
    window.open(`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    await supabase.from('wa_logs').insert({ tipo: 'campanha', cliente_id: cliente.id, telefone: cliente.telefone, mensagem: msg, data_ref: hoje })
    setEnviandoCampanha(null)
  }

  async function cancelarAgendamento(id: string) {
    await supabase.from('wa_agendamentos').update({status:'cancelado'}).eq('id',id); fetchAgendamentos()
  }

  const totalPendentes = waResumo.reduce((s,r)=>s+r.pendentes,0)
  const totalEnviados  = waResumo.reduce((s,r)=>s+r.enviados,0)
  const totalGeral     = waResumo.reduce((s,r)=>s+r.total,0)
  const tudo100 = totalGeral > 0 && totalPendentes === 0

  const pendenciasFiltradas = pendencias.filter(p => {
    if (!mostrarEnviados && p.enviado_hoje) return false
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
    return true
  })

  const npsMedia = avaliacoes.length > 0 ? avaliacoes.reduce((s,a)=>s+(a.nota??0),0)/avaliacoes.length : 0
  const npsDistrib = [5,4,3,2,1].map(n=>({nota:n,qtd:avaliacoes.filter(a=>a.nota===n).length}))

  const card: React.CSSProperties = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'18px 22px', marginBottom:14 }

  return (
    <div style={{ padding:'24px 32px', fontFamily:'var(--font-sans)', width:'100%' }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color:'#0f172a', letterSpacing:'-0.02em' }}>CRM & Acompanhamento</h1>
        <p style={{ fontSize:13, color:'#94a3b8', marginTop:2 }}>
          {loading ? 'Carregando...' : `${clientes.length} clientes · ${totalPendentes > 0 ? `${totalPendentes} mensagens pendentes` : 'mensagens em dia ✓'}`}
        </p>
      </div>

      {/* Abas */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid #e2e8f0', overflowX:'auto' }}>
        {ABAS.map(([k,l]) => (
          <button key={k} onClick={()=>setAba(k)} style={{ padding:'10px 16px', fontSize:13, fontWeight:aba===k?600:400, border:'none', background:'none', cursor:'pointer', color:aba===k?'#2563eb':'#64748b', borderBottom:aba===k?'2px solid #2563eb':'2px solid transparent', marginBottom:-1, whiteSpace:'nowrap' }}>{l}</button>
        ))}
      </div>

      {/* ═══ ACOMPANHAMENTO ═══ */}
      {aba === 'acompanhamento' && (
        <div>
          {/* Barra de progresso */}
          {totalGeral > 0 && (
            <div style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:600, color:'#0f172a' }}>{totalEnviados}/{totalGeral} enviados hoje</p>
                  <p style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{tudo100 ? '🎉 Todos os contatos realizados!' : `${totalPendentes} pendente(s)`}</p>
                </div>
                <span style={{ fontSize:22, fontWeight:700, color:tudo100?'#10b981':'#2563eb' }}>{Math.round((totalEnviados/totalGeral)*100)}%</span>
              </div>
              <div style={{ height:8, background:'#f1f5f9', borderRadius:4, overflow:'hidden', marginBottom:12 }}>
                <div style={{ height:'100%', width:`${(totalEnviados/totalGeral)*100}%`, background:tudo100?'#10b981':'#2563eb', borderRadius:4, transition:'width 0.4s' }} />
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {waResumo.map(r => {
                  const tc = WA_TIPO_CONFIG[r.tipo]; if (!tc) return null
                  return (
                    <button key={r.tipo} onClick={()=>setFiltroTipo(filtroTipo===r.tipo?'todos':r.tipo)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:filtroTipo===r.tipo?'#dbeafe':'#f8fafc', cursor:'pointer', fontSize:12 }}>
                      <span>{tc.icon}</span><span style={{ color:'#374151' }}>{tc.label}</span>
                      {r.pendentes>0 ? <span style={{ background:'#ef4444', color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:20 }}>{r.pendentes}</span> : <span style={{ background:'#ecfdf5', color:'#065f46', fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:20 }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Controles */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <button onClick={()=>setFiltroTipo('todos')} style={{ fontSize:12, padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:7, background:filtroTipo==='todos'?'#dbeafe':'#fff', color:filtroTipo==='todos'?'#1d4ed8':'#64748b', cursor:'pointer' }}>Todos os tipos</button>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#64748b' }}>
              <div onClick={()=>setMostrarEnviados(!mostrarEnviados)} style={{ width:36, height:20, borderRadius:10, background:mostrarEnviados?'#2563eb':'#e2e8f0', position:'relative', cursor:'pointer', flexShrink:0 }}>
                <div style={{ position:'absolute', top:2, left:mostrarEnviados?18:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }} />
              </div>
              Mostrar enviados
            </label>
          </div>

          {/* Listas por tipo */}
          {Object.entries(WA_TIPO_CONFIG).map(([tipo, tc]) => {
            const itens = pendenciasFiltradas.filter(p => p.tipo === tipo)
            if (itens.length === 0) return null
            const pendentes = itens.filter(p => !p.enviado_hoje).length
            return (
              <div key={tipo} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                <div style={{ padding:'12px 18px', background:'#f8fafc', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{tc.icon} {tc.label}</span>
                  {pendentes > 0 ? <span style={{ fontSize:11, background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:20, fontWeight:500 }}>{pendentes} pendente(s)</span>
                    : <span style={{ fontSize:11, background:'#ecfdf5', color:'#065f46', padding:'2px 8px', borderRadius:20, fontWeight:500 }}>✓ Todos enviados</span>}
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <tbody>
                    {itens.map((p, i) => {
                      const uid = p.os_id??p.cliente_id??String(i)
                      const template = waConfig[tc.templateKey]??''
                      const msg = buildMsg(template, p)
                      return (
                        <tr key={uid} style={{ borderBottom:'1px solid #f8fafc', background:p.enviado_hoje?'#f8fffe':'#fff' }}>
                          <td style={{ padding:'10px 18px', fontWeight:500, color:'#0f172a' }}>
                            {p.nome}
                            <button onClick={()=>{setClienteSel(clientes.find(c=>c.id===p.cliente_id)||null);setAba('timeline')}} style={{ marginLeft:8, fontSize:11, color:'#2563eb', background:'none', border:'none', cursor:'pointer' }}>ver →</button>
                          </td>
                          <td style={{ padding:'10px 18px', color:'#64748b', fontSize:12 }}>{p.telefone?formatPhone(p.telefone):'Sem telefone'}</td>
                          {p.dias != null && <td style={{ padding:'10px 18px', fontSize:12, fontWeight:600, color:(p.dias??0)>90?'#ef4444':'#92400e' }}>{p.dias} dias</td>}
                          {p.idade != null && <td style={{ padding:'10px 18px', fontSize:12 }}>{p.idade} anos 🎉</td>}
                          <td style={{ padding:'10px 18px' }}>
                            {p.enviado_hoje ? <span style={{ fontSize:11, fontWeight:600, background:'#ecfdf5', color:'#065f46', padding:'2px 8px', borderRadius:20 }}>✓ Enviado</span>
                              : <span style={{ fontSize:11, fontWeight:500, background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:20 }}>⏳ Pendente</span>}
                          </td>
                          <td style={{ padding:'10px 18px' }}>
                            {p.telefone && (
                              <button onClick={()=>setWaModal({p,msg})} disabled={enviandoId===uid} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid', cursor:'pointer', fontSize:12, fontWeight:500, background:p.enviado_hoje?'#f0fdf4':'#fff', color:p.enviado_hoje?'#065f46':'#374151', borderColor:p.enviado_hoje?'#86efac':'#e2e8f0' }}>
                                💬 {p.enviado_hoje?'Reenviar':'Enviar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}

          {pendenciasFiltradas.length === 0 && (
            <div style={{ textAlign:'center', padding:80 }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
              <p style={{ fontSize:16, fontWeight:600, color:'#0f172a' }}>{totalPendentes===0?'Tudo enviado hoje!':'Nenhum contato neste filtro'}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ CLIENTES ═══ */}
      {aba === 'clientes' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <input value={clienteSearch} onChange={e=>setClienteSearch(e.target.value)} placeholder="Buscar cliente..." style={{ ...inp, flex:1, minWidth:180, background:'#f8fafc' }} />
            <select value={filtroNivel} onChange={e=>setFiltroNivel(e.target.value)} style={{ ...inp, width:'auto' }}>
              <option value="todos">Todos os níveis</option>
              {Object.entries(NIVEL_CONFIG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>

          {/* Cards de nível */}
          <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
            {Object.entries(NIVEL_CONFIG).map(([nivel, cfg]) => {
              const qtd = clientes.filter(c=>c.nivel_crm===nivel).length
              return (
                <div key={nivel} onClick={()=>setFiltroNivel(filtroNivel===nivel?'todos':nivel)} style={{ flex:1, minWidth:90, background:cfg.bg, border:`1px solid ${filtroNivel===nivel?cfg.color+'80':'#e2e8f0'}`, borderRadius:10, padding:'10px 14px', cursor:'pointer', textAlign:'center' }}>
                  <p style={{ fontSize:20, marginBottom:4 }}>{cfg.icon}</p>
                  <p style={{ fontSize:18, fontWeight:700, color:cfg.color }}>{qtd}</p>
                  <p style={{ fontSize:11, color:cfg.color, opacity:0.8 }}>{cfg.label}</p>
                </div>
              )
            })}
          </div>

          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Cliente','Telefone','Nível','Score','OS','Total gasto','Última OS',''].map(h=><th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {clientes.map(c => {
                  const nc = NIVEL_CONFIG[c.nivel_crm]??NIVEL_CONFIG.novo
                  const diasUlt = c.ultima_os_em ? Math.floor((Date.now()-new Date(c.ultima_os_em).getTime())/(1000*60*60*24)) : null
                  return (
                    <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'10px 14px', fontWeight:500, color:'#0f172a' }}>{c.nome}</td>
                      <td style={{ padding:'10px 14px', color:'#64748b', fontSize:12 }}>{c.telefone?formatPhone(c.telefone):'—'}</td>
                      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:20, background:nc.bg, color:nc.color }}>{nc.icon} {nc.label}</span></td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:50, height:5, background:'#f1f5f9', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${c.score_crm??0}%`, background:c.score_crm>=70?'#10b981':c.score_crm>=40?'#f59e0b':'#ef4444', borderRadius:3 }} />
                          </div>
                          <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{c.score_crm??0}</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px', color:'#374151' }}>{c.total_os??0}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#374151' }}>{c.total_gasto>0?fm(c.total_gasto):'—'}</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:diasUlt&&diasUlt>90?'#ef4444':'#94a3b8' }}>{diasUlt!=null?`há ${diasUlt} dias`:'—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <button onClick={()=>{setClienteSel(c);setAba('timeline')}} style={{ fontSize:12, padding:'4px 10px', border:'1px solid #e2e8f0', borderRadius:6, background:'#fff', cursor:'pointer', color:'#2563eb' }}>Timeline →</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ LINHA DO TEMPO ═══ */}
      {aba === 'timeline' && (
        <div>
          {!clienteSel ? (
            <div style={{ textAlign:'center', padding:60 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>👤</div>
              <p style={{ fontSize:14, fontWeight:500, color:'#374151', marginBottom:12 }}>Selecione um cliente para ver a linha do tempo</p>
              <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                {clientes.slice(0,8).map(c => (
                  <button key={c.id} onClick={()=>setClienteSel(c)} style={{ padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', cursor:'pointer', fontSize:13, color:'#374151' }}>{c.nome}</button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {/* Header cliente */}
              <div style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:48, height:48, borderRadius:'50%', background:'#dbeafe', color:'#2563eb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700 }}>
                      {clienteSel.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize:17, fontWeight:600, color:'#0f172a' }}>{clienteSel.nome}</p>
                      <p style={{ fontSize:13, color:'#64748b' }}>{clienteSel.telefone?formatPhone(clienteSel.telefone):'—'}</p>
                    </div>
                    <span style={{ fontSize:12, fontWeight:500, padding:'3px 10px', borderRadius:20, background:NIVEL_CONFIG[clienteSel.nivel_crm]?.bg??'#f8fafc', color:NIVEL_CONFIG[clienteSel.nivel_crm]?.color??'#374151' }}>
                      {NIVEL_CONFIG[clienteSel.nivel_crm]?.icon} {NIVEL_CONFIG[clienteSel.nivel_crm]?.label}
                    </span>
                  </div>
                  <button onClick={()=>setClienteSel(null)} style={{ fontSize:12, color:'#2563eb', background:'none', border:'none', cursor:'pointer' }}>← Voltar</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
                  {[{l:'Score CRM',v:clienteSel.score_crm??0,c:'#2563eb'},{l:'Total OS',v:clienteSel.total_os??0,c:'#374151'},{l:'Total gasto',v:clienteSel.total_gasto>0?fm(clienteSel.total_gasto):'—',c:'#065f46'},{l:'Mensagens WA',v:timelineWA.length,c:'#0369a1'}].map(m=>(
                    <div key={m.l} style={{ background:'#f8fafc', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                      <p style={{ fontSize:11, color:'#64748b', marginBottom:3 }}>{m.l}</p>
                      <p style={{ fontSize:16, fontWeight:700, color:m.c }}>{m.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {/* OS */}
                <div style={card}>
                  <p style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:12 }}>🔧 Ordens de Serviço ({timelineOS.length})</p>
                  {timelineOS.length === 0 ? <p style={{ fontSize:13, color:'#94a3b8' }}>Nenhuma OS ainda.</p> :
                    timelineOS.map(os => (
                      <div key={os.id} style={{ padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontWeight:600, color:'#2563eb', fontSize:13 }}>#{os.numero}</span>
                          <span style={{ fontSize:11, color:'#94a3b8' }}>{new Date(os.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <p style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{os.modelo??'—'} · {os.defeito_relatado.slice(0,40)}</p>
                        <p style={{ fontSize:12, fontWeight:500, color:'#374151' }}>{os.valor_final||os.valor_orcamento?fm(os.valor_final??os.valor_orcamento??0):'—'}</p>
                      </div>
                    ))
                  }
                </div>

                {/* Anotações */}
                <div style={card}>
                  <p style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:12 }}>📝 Anotações internas</p>
                  <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                    <input style={{ ...inp, flex:1 }} value={novaAnotacao} onChange={e=>setNovaAnotacao(e.target.value)} onKeyDown={e=>e.key==='Enter'&&salvarAnotacao()} placeholder="Adicionar anotação... (Enter para salvar)" />
                    <button onClick={salvarAnotacao} disabled={savingAnotacao||!novaAnotacao.trim()} style={{ padding:'9px 14px', background:'#2563eb', color:'#fff', border:'none', borderRadius:7, fontSize:13, cursor:'pointer' }}>+</button>
                  </div>
                  {anotacoes.length === 0 ? <p style={{ fontSize:13, color:'#94a3b8' }}>Nenhuma anotação.</p> :
                    anotacoes.map(a => (
                      <div key={a.id} style={{ background:'#f8fafc', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <p style={{ fontSize:13, color:'#374151', flex:1, lineHeight:1.5 }}>{a.texto}</p>
                          <button onClick={()=>excluirAnotacao(a.id)} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:16, marginLeft:8, flexShrink:0 }}>×</button>
                        </div>
                        <p style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>{(a.perfis as any)?.nome} · {new Date(a.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>
                      </div>
                    ))
                  }
                </div>

                {/* WhatsApp enviados */}
                <div style={{ ...card, gridColumn:'1/-1' }}>
                  <p style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:12 }}>💬 Histórico de WhatsApp ({timelineWA.length})</p>
                  {timelineWA.length === 0 ? <p style={{ fontSize:13, color:'#94a3b8' }}>Nenhuma mensagem enviada para este cliente.</p> :
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {timelineWA.slice(0,10).map((w:any) => (
                        <div key={w.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'10px 14px', background:'#f8fafc', borderRadius:8, fontSize:13 }}>
                          <div style={{ flex:1 }}>
                            <span style={{ fontSize:11, fontWeight:500, background:'#dbeafe', color:'#1d4ed8', padding:'1px 8px', borderRadius:20, marginRight:8 }}>{WA_TIPO_CONFIG[w.tipo]?.label??w.tipo}</span>
                            <span style={{ color:'#64748b', fontSize:12 }}>{w.mensagem.slice(0,60)}...</span>
                          </div>
                          <span style={{ fontSize:11, color:'#94a3b8', flexShrink:0, marginLeft:12 }}>{new Date(w.enviado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                        </div>
                      ))}
                    </div>
                  }
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ SEGMENTOS ═══ */}
      {aba === 'segmentos' && (
        <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:20 }}>
          <div>
            <p style={{ fontSize:12, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Segmentos</p>
            {segmentos.map(s => (
              <button key={s.id} onClick={()=>setSegmentoSel(s.id)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:9, border:`1px solid ${segmentoSel===s.id?s.cor_hex+'80':'#e2e8f0'}`, background:segmentoSel===s.id?s.cor_hex+'15':'#fff', cursor:'pointer', textAlign:'left', marginBottom:8 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:s.cor_hex, flexShrink:0 }} />
                <span style={{ fontSize:13, fontWeight:segmentoSel===s.id?600:400, color:'#0f172a' }}>{s.nome}</span>
              </button>
            ))}
          </div>
          <div>
            {!segmentoSel ? (
              <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
                <p>Selecione um segmento para ver os clientes.</p>
              </div>
            ) : (
              <div style={card}>
                <p style={{ fontSize:14, fontWeight:600, color:'#0f172a', marginBottom:14 }}>
                  {segmentos.find(s=>s.id===segmentoSel)?.nome} — {membrosSegmento.length} clientes
                </p>
                {membrosSegmento.length === 0 ? <p style={{ fontSize:13, color:'#94a3b8' }}>Nenhum cliente neste segmento ainda.</p> :
                  membrosSegmento.map(c => (
                    <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
                      <span style={{ fontWeight:500, color:'#0f172a' }}>{c.nome}</span>
                      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ color:'#94a3b8', fontSize:12 }}>{c.telefone?formatPhone(c.telefone):'—'}</span>
                        <button onClick={()=>{setClienteSel(c);setAba('timeline')}} style={{ fontSize:12, color:'#2563eb', background:'none', border:'none', cursor:'pointer' }}>ver →</button>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CAMPANHAS ═══ */}
      {aba === 'campanhas' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <button onClick={()=>setShowCampanha(true)} style={{ padding:'9px 18px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>+ Nova campanha</button>
          </div>

          {/* Painel de clientes da campanha */}
          {campanhaAberta && (
            <div style={{ background:'#fff', border:'1px solid #bfdbfe', borderRadius:12, marginBottom:20, overflow:'hidden' }}>
              <div style={{ background:'#dbeafe', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:600, color:'#1d4ed8' }}>📣 {campanhaAberta.nome}</p>
                  <p style={{ fontSize:12, color:'#2563eb', marginTop:2 }}>
                    {loadingClientesCampanha ? 'Carregando clientes...' : `${clientesCampanha.length} clientes com telefone`}
                  </p>
                </div>
                <button onClick={()=>setCampanhaAberta(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#2563eb' }}>×</button>
              </div>
              {/* Preview da mensagem */}
              <div style={{ padding:'12px 20px', borderBottom:'1px solid #dbeafe', background:'#eff6ff' }}>
                <p style={{ fontSize:11, fontWeight:600, color:'#6b21a8', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>Mensagem da campanha</p>
                <p style={{ fontSize:13, color:'#374151', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{campanhaAberta.mensagem}</p>
              </div>
              {loadingClientesCampanha ? (
                <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>Carregando...</div>
              ) : clientesCampanha.length === 0 ? (
                <div style={{ padding:40, textAlign:'center' }}>
                  <p style={{ fontSize:14, color:'#374151' }}>Nenhum cliente com telefone cadastrado neste segmento.</p>
                </div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                    {['Cliente','Telefone','Nível',''].map(h => <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {clientesCampanha.map(cl => {
                      const nc = NIVEL_CONFIG[cl.nivel_crm] ?? NIVEL_CONFIG.novo
                      return (
                        <tr key={cl.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'10px 16px', fontWeight:500, color:'#0f172a' }}>{cl.nome}</td>
                          <td style={{ padding:'10px 16px', color:'#64748b', fontSize:12 }}>{cl.telefone ? formatPhone(cl.telefone) : '—'}</td>
                          <td style={{ padding:'10px 16px' }}><span style={{ fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:20, background:nc.bg, color:nc.color }}>{nc.icon} {nc.label}</span></td>
                          <td style={{ padding:'10px 16px' }}>
                            <button
                              onClick={() => enviarWACampanha(campanhaAberta, cl)}
                              disabled={enviandoCampanha === cl.id}
                              style={{ padding:'5px 14px', background:'#16a34a', color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer' }}
                            >
                              💬 Enviar WhatsApp
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {campanhas.length === 0 ? (
            <div style={{ textAlign:'center', padding:60 }}><div style={{ fontSize:40, marginBottom:12 }}>📣</div><p style={{ fontSize:14, fontWeight:500, color:'#374151' }}>Nenhuma campanha criada</p></div>
          ) : campanhas.map(c => (
            <div key={c.id}
              onClick={() => campanhaAberta?.id === c.id ? setCampanhaAberta(null) : abrirCampanha(c)}
              style={{ ...card, cursor:'pointer', border:`1px solid ${campanhaAberta?.id === c.id ? '#bfdbfe' : '#e2e8f0'}`, background:campanhaAberta?.id === c.id ? '#eff6ff' : '#fff' }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:600, color:'#0f172a' }}>{c.nome}</p>
                  <p style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{new Date(c.created_at).toLocaleDateString('pt-BR')} · clique para ver clientes</p>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:20, background:c.status==='concluida'?'#ecfdf5':c.status==='enviando'?'#eff6ff':'#f8fafc', color:c.status==='concluida'?'#065f46':c.status==='enviando'?'#1d4ed8':'#64748b' }}>{c.status}</span>
                  <span style={{ fontSize:13, color:'#2563eb' }}>{campanhaAberta?.id === c.id ? '▲' : '▼'}</span>
                </div>
              </div>
            </div>
          ))}

          {showCampanha && (
            <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
              <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:520 }}>
                <div style={{ padding:'18px 22px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <h3 style={{ fontSize:15, fontWeight:600, color:'#0f172a' }}>Nova campanha</h3>
                  <button onClick={()=>setShowCampanha(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>×</button>
                </div>
                <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:12 }}>
                  <div><label style={{ display:'block', fontSize:12, fontWeight:500, color:'#64748b', marginBottom:4 }}>Nome *</label><input style={inp} value={cNome} onChange={e=>setCNome(e.target.value)} placeholder="Ex: Promoção aniversariantes" /></div>
                  <div><label style={{ display:'block', fontSize:12, fontWeight:500, color:'#64748b', marginBottom:4 }}>Segmento (opcional)</label>
                    <select style={inp} value={cSegmento} onChange={e=>setCSegmento(e.target.value)}>
                      <option value="">Todos os clientes</option>
                      {segmentos.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </div>
                  <div><label style={{ display:'block', fontSize:12, fontWeight:500, color:'#64748b', marginBottom:4 }}>Mensagem *</label><textarea style={{ ...inp, minHeight:100, resize:'vertical', lineHeight:1.6 }} value={cMsg} onChange={e=>setCMsg(e.target.value)} placeholder="Texto da mensagem WhatsApp..." /></div>
                </div>
                <div style={{ padding:'12px 22px', borderTop:'1px solid #f1f5f9', display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={()=>setShowCampanha(false)} style={{ padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer', color:'#374151' }}>Cancelar</button>
                  <button onClick={salvarCampanha} disabled={savingCampanha||!cNome.trim()||!cMsg.trim()} style={{ padding:'8px 18px', background:savingCampanha||!cNome.trim()||!cMsg.trim()?'#93c5fd':'#2563eb', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
                    {savingCampanha?'Criando...':'Criar campanha'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ AGENDAMENTOS ═══ */}
      {aba === 'agendamentos' && (
        <div>
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 16px', marginBottom:16, fontSize:13, color:'#2563eb' }}>
            📅 Agendamentos pendentes — mensagens programadas para serem enviadas em horário específico.
          </div>
          {agendamentos.length === 0 ? (
            <div style={{ textAlign:'center', padding:60 }}><div style={{ fontSize:40, marginBottom:12 }}>⏱</div><p style={{ fontSize:14, color:'#374151' }}>Nenhum agendamento pendente.</p></div>
          ) : (
            <div style={card}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                  {['Cliente','Tipo','Agendado para','Mensagem',''].map(h=><th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em' }}>{h}</th>)}
                </tr></thead>
                <tbody>{agendamentos.map(a=>(
                  <tr key={a.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'10px 14px', fontWeight:500, color:'#0f172a' }}>{(a.clientes as any)?.nome??'—'}</td>
                    <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, background:'#dbeafe', color:'#1d4ed8', padding:'2px 8px', borderRadius:20 }}>{a.tipo}</span></td>
                    <td style={{ padding:'10px 14px', color:'#374151', fontSize:12 }}>{new Date(a.agendado_para).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                    <td style={{ padding:'10px 14px', color:'#64748b', fontSize:12, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.mensagem}</td>
                    <td style={{ padding:'10px 14px' }}><button onClick={()=>cancelarAgendamento(a.id)} style={{ fontSize:11, padding:'4px 10px', border:'1px solid #fecaca', borderRadius:6, background:'#fef2f2', cursor:'pointer', color:'#ef4444' }}>Cancelar</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ NPS / AVALIAÇÕES ═══ */}
      {aba === 'avaliacoes' && (
        <div>
          {/* Métricas NPS */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12, marginBottom:20 }}>
            {[
              { l:'Avaliações', v:avaliacoes.length, c:'#2563eb' },
              { l:'Nota média', v:avaliacoes.length>0?npsMedia.toFixed(1):'—', c:'#f59e0b' },
              { l:'Promotores (5★)', v:avaliacoes.filter(a=>a.nota===5).length, c:'#10b981' },
              { l:'Detratores (1-2★)', v:avaliacoes.filter(a=>(a.nota??0)<=2).length, c:'#ef4444' },
            ].map(m=>(
              <div key={m.l} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'14px 16px' }}>
                <p style={{ fontSize:11, color:'#64748b', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>{m.l}</p>
                <p style={{ fontSize:22, fontWeight:700, color:m.c }}>{m.v}</p>
              </div>
            ))}
          </div>

          {/* Distribuição */}
          <div style={{ ...card, marginBottom:14 }}>
            <p style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:12 }}>Distribuição de notas</p>
            {npsDistrib.map(({nota, qtd}) => {
              const pct = avaliacoes.length > 0 ? (qtd/avaliacoes.length)*100 : 0
              const stars = '★'.repeat(nota)+'☆'.repeat(5-nota)
              return (
                <div key={nota} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'#f59e0b', width:60, flexShrink:0 }}>{stars}</span>
                  <div style={{ flex:1, height:8, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:nota>=4?'#10b981':nota>=3?'#f59e0b':'#ef4444', borderRadius:4, transition:'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize:12, color:'#64748b', minWidth:30 }}>{qtd}</span>
                </div>
              )
            })}
          </div>

          {/* Lista de avaliações */}
          {avaliacoes.length === 0 ? (
            <div style={{ textAlign:'center', padding:60 }}><div style={{ fontSize:40, marginBottom:12 }}>⭐</div><p style={{ fontSize:14, color:'#374151' }}>Nenhuma avaliação recebida ainda.</p><p style={{ fontSize:13, color:'#94a3b8', marginTop:6 }}>Ative o NPS em Configurações → CRM → NPS pós-venda.</p></div>
          ) : (
            <div style={card}>
              {avaliacoes.map(a => (
                <div key={a.id} style={{ padding:'10px 0', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                  <div>
                    <span style={{ fontSize:16, color:'#f59e0b' }}>{'★'.repeat(a.nota??0)}{'☆'.repeat(5-(a.nota??0))}</span>
                    {a.comentario && <p style={{ fontSize:13, color:'#374151', marginTop:4 }}>{a.comentario}</p>}
                  </div>
                  <span style={{ fontSize:11, color:'#94a3b8', flexShrink:0 }}>{a.respondido_em?new Date(a.respondido_em).toLocaleDateString('pt-BR'):new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal WA */}
      {waModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:440 }}>
            <div style={{ padding:'18px 22px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ fontSize:15, fontWeight:600, color:'#0f172a' }}>💬 Confirmar envio</h3>
              <button onClick={()=>setWaModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>×</button>
            </div>
            <div style={{ padding:'18px 22px' }}>
              <p style={{ fontSize:13, color:'#64748b', marginBottom:12 }}>Para: <strong style={{ color:'#0f172a' }}>{waModal.p.nome}</strong>{waModal.p.telefone&&<span style={{ marginLeft:8, color:'#94a3b8' }}>· {formatPhone(waModal.p.telefone)}</span>}</p>
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:14, fontSize:13, color:'#374151', lineHeight:1.7, whiteSpace:'pre-wrap', maxHeight:180, overflowY:'auto', marginBottom:14 }}>{waModal.msg}</div>
              <p style={{ fontSize:12, color:'#94a3b8', marginBottom:14 }}>Ao confirmar, o WhatsApp será aberto e o envio ficará registrado no sistema.</p>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setWaModal(null)} style={{ flex:1, padding:'9px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer', color:'#374151' }}>Cancelar</button>
                <button onClick={()=>confirmarWA(waModal.p, waModal.msg)} style={{ flex:2, padding:'9px', background:'#16a34a', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  💬 Abrir WhatsApp e registrar ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
