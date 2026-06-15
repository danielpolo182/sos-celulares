'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type OS = {
  id: string
  numero: number
  status: string
  marca: string | null
  modelo: string | null
  defeito_relatado: string
  valor_orcamento: number | null
  created_at: string
  imei: string | null
  clientes: { nome: string; telefone: string | null } | null
}

type Pendencia = {
  id: string
  numero: number
  status: string
  modelo: string | null
  defeito_relatado: string
  valor_orcamento: number | null
  snooze_ate: string | null
  snooze_motivo: string | null
  wa_enviado: Record<string, boolean>
  clientes: { nome: string; telefone: string | null } | null
  created_at: string
}

type SubGrupo = 'atrasada' | 'pendente' | 'no_prazo' | 'adiada'

const SUBGRUPO_CONFIG: Record<SubGrupo, { label: string; cor: string; corFundo: string; corTexto: string; icone: string }> = {
  atrasada: { label: 'Atrasadas', cor: '#ef4444', corFundo: '#fee2e2', corTexto: '#991b1b', icone: '🔴' },
  pendente: { label: 'Pendentes', cor: '#f59e0b', corFundo: '#fef3c7', corTexto: '#92400e', icone: '🟡' },
  no_prazo: { label: 'No Prazo',  cor: '#10b981', corFundo: '#d1fae5', corTexto: '#065f46', icone: '🟢' },
  adiada:   { label: 'Adiadas',   cor: '#7c3aed', corFundo: '#ede9fe', corTexto: '#5b21b6', icone: '⏸️' },
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  aberta:                 { label: 'Aberta',             bg: '#dbeafe', color: '#1d4ed8', icon: '📋' },
  em_andamento:           { label: 'Em andamento',       bg: '#fef3c7', color: '#92400e', icon: '⚙️' },
  pronta:                 { label: 'Pronta',             bg: '#d1fae5', color: '#065f46', icon: '✅' },
  entregue:               { label: 'Entregue',           bg: '#d1fae5', color: '#14532d', icon: '📦' },
  cancelada:              { label: 'Cancelada',          bg: '#fee2e2', color: '#991b1b', icon: '❌' },
  aguardando_diagnostico: { label: 'Aguard. diagnóstico',bg: '#f3e8ff', color: '#7c3aed', icon: '🔬' },
  em_orcamento:           { label: 'Em orçamento',       bg: '#fef3c7', color: '#d97706', icon: '💰' },
  em_reparo:              { label: 'Em reparo',          bg: '#fef3c7', color: '#92400e', icon: '🔧' },
  aguardando_peca:        { label: 'Aguard. peça',       bg: '#fff7ed', color: '#c2410c', icon: '📦' },
}

const WA_MENSAGENS: Record<string, string> = {
  aberta:       'Olá, {nome}! 😊 Seu aparelho *{modelo}* foi recebido.\n\n🔧 *OS Nº {numero}*\nDefeito: {defeito}\n\nEm breve teremos novidades!',
  em_andamento: 'Olá, {nome}! 👋 Sua *OS Nº {numero}* está em andamento. Já estamos trabalhando no seu *{modelo}*!',
  pronta:       'Olá, {nome}! 🎉 Seu *{modelo}* está *PRONTO* para retirada!\n\n*OS Nº {numero}*\n💰 Valor: R$ {valor}\n\nAguardamos você!',
  entregue:     'Olá, {nome}! Confirmando a entrega do seu *{modelo}*. Obrigado pela confiança! 🙏',
}

function gerarMensagem(status: string, os: Pendencia) {
  const nome = os.clientes?.nome?.split(' ')[0] ?? 'cliente'
  return (WA_MENSAGENS[status] ?? '')
    .replace('{nome}', nome)
    .replace(/{numero}/g, String(os.numero))
    .replace(/{modelo}/g, os.modelo ?? 'aparelho')
    .replace('{defeito}', os.defeito_relatado)
    .replace('{valor}', os.valor_orcamento ? os.valor_orcamento.toFixed(2).replace('.', ',') : 'a combinar')
}

function abrirWA(telefone: string | null, msg: string) {
  const num = telefone?.replace(/\D/g, '') ?? ''
  window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
}

function diasAberto(created_at: string) {
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 86400000)
}

function horasAberto(created_at: string) {
  return (Date.now() - new Date(created_at).getTime()) / 3600000
}

function classificarOS(os: Pendencia, prazoHoras: number, prazoAlertaDias: number): SubGrupo {
  const hoje = new Date().toISOString().split('T')[0]
  if (os.snooze_ate && os.snooze_ate >= hoje) return 'adiada'
  if (os.status === 'pronta') return diasAberto(os.created_at) > prazoAlertaDias ? 'atrasada' : 'pendente'
  return horasAberto(os.created_at) > prazoHoras ? 'atrasada' : 'no_prazo'
}

function SubGrupoSection({
  subgrupo, lista, onAdiar, onWA, onAbrir, colapsavel
}: {
  subgrupo: SubGrupo
  lista: Pendencia[]
  onAdiar: (os: Pendencia) => void
  onWA: (os: Pendencia) => void
  onAbrir: (id: string) => void
  colapsavel?: boolean
}) {
  const [aberto, setAberto] = useState(!colapsavel)
  const cfg = SUBGRUPO_CONFIG[subgrupo]
  if (lista.length === 0) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        onClick={() => colapsavel && setAberto(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: aberto ? 14 : 0, cursor: colapsavel ? 'pointer' : 'default', userSelect: 'none' }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 7, background: cfg.corFundo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          {cfg.icone}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{cfg.label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: cfg.corFundo, color: cfg.corTexto }}>{lista.length}</span>
        {colapsavel && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{aberto ? '▲' : '▼'}</span>}
      </div>

      {aberto && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {lista.map(os => {
            const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
            const dias = diasAberto(os.created_at)
            const waStatusEnviado = (os.wa_enviado ?? {})[os.status] === true

            return (
              <div key={os.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ height: 4, background: cfg.cor }} />

                <div style={{ padding: '11px 13px 9px', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, letterSpacing: '0.04em', marginBottom: 2 }}>OS #{os.numero}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{os.modelo ?? 'Aparelho'}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: st.bg, color: st.color, flexShrink: 0 }}>{st.icon} {st.label}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                    {os.defeito_relatado.slice(0, 60)}{os.defeito_relatado.length > 60 ? '…' : ''}
                  </div>
                  {dias > 0 && (
                    <div style={{ marginTop: 5, fontSize: 10, fontWeight: 500, color: subgrupo === 'atrasada' ? '#ef4444' : subgrupo === 'pendente' ? '#f59e0b' : '#94a3b8' }}>
                      ⏱ {dias} dia{dias > 1 ? 's' : ''} em aberto
                    </div>
                  )}
                </div>

                <div style={{ padding: '9px 13px 11px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>👤 {os.clientes?.nome ?? 'Cliente não identificado'}</div>

                  {os.valor_orcamento && (
                    <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
                      💰 R$ {os.valor_orcamento.toFixed(2).replace('.', ',')}
                    </div>
                  )}

                  {subgrupo === 'adiada' && os.snooze_motivo && (
                    <div style={{ fontSize: 11, color: '#5b21b6', background: '#ede9fe', borderRadius: 6, padding: '5px 8px', borderLeft: '3px solid #7c3aed' }}>
                      <span style={{ fontWeight: 600 }}>Motivo:</span> {os.snooze_motivo}
                    </div>
                  )}
                  {subgrupo === 'adiada' && os.snooze_ate && (
                    <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '4px 8px' }}>
                      ⏸️ Adiada até {new Date(os.snooze_ate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  )}

                  <button
                    onClick={() => onWA(os)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid', cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: waStatusEnviado ? '#dcfce7' : '#f0fdf4', color: waStatusEnviado ? '#166534' : '#16a34a', borderColor: waStatusEnviado ? '#86efac' : '#bbf7d0' }}
                  >
                    💬 {waStatusEnviado ? '✓ Enviado' : 'WhatsApp'}
                  </button>

                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      onClick={() => onAdiar(os)}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 11, background: subgrupo === 'adiada' ? '#ede9fe' : '#fafafa', color: subgrupo === 'adiada' ? '#5b21b6' : '#94a3b8', border: subgrupo === 'adiada' ? '1px solid #c4b5fd' : '1px dashed #e2e8f0' }}
                    >
                      {subgrupo === 'adiada' ? '✏️ Alterar' : '😴 Adiar'}
                    </button>
                    <button
                      onClick={() => onAbrir(os.id)}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                    >
                      Abrir OS →
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function OSPage() {
  const supabase = createClient()
  const router = useRouter()
  const [aba, setAba] = useState<'lista' | 'pendencias'>('pendencias')
  const [items, setItems] = useState<OS[]>([])
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [busca, setBusca] = useState('')
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [prazoHoras, setPrazoHoras] = useState(4)
  const [prazoAlertaDias, setPrazoAlertaDias] = useState(3)
  const [snoozeModal, setSnoozeModal] = useState<{ os: Pendencia; data: string; motivo: string } | null>(null)
  const [waModal, setWaModal] = useState<{ os: Pendencia; status: string } | null>(null)

  const carregarConfigs = useCallback(async () => {
    const { data } = await supabase.from('sistema_config').select('chave, valor').in('chave', ['os_prazo_producao_horas', 'alerta_os_pronta_1'])
    if (data) data.forEach((c: { chave: string; valor: string }) => {
      if (c.chave === 'os_prazo_producao_horas') setPrazoHoras(Number(c.valor) || 4)
      if (c.chave === 'alerta_os_pronta_1') setPrazoAlertaDias(Number(c.valor) || 3)
    })
  }, [supabase])

  const fetchOS = useCallback(async () => {
    setLoading(true)
    await carregarConfigs()

    // Contagem por status para o kanban
    const { data: todasOs } = await supabase
      .from('ordens_servico')
      .select('status')
      .is('deleted_at', null)
      .not('status', 'in', '(entregue,cancelada)')
    const counts: Record<string, number> = {}
    for (const row of todasOs ?? []) {
      counts[row.status] = (counts[row.status] ?? 0) + 1
    }
    setStatusCounts(counts)

    let query = supabase
      .from('ordens_servico')
      .select('id,numero,status,marca,modelo,defeito_relatado,valor_orcamento,created_at,imei,clientes(nome,telefone)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    if (filtroStatus !== 'todos') query = query.eq('status', filtroStatus)
    if (search.trim()) query = query.or(`modelo.ilike.%${search}%,defeito_relatado.ilike.%${search}%`)

    // Filtro de busca avançada (kanban search bar)
    if (busca.trim().length >= 2) {
      const buscaNum = parseInt(busca.replace(/\D/g, ''))
      if (!isNaN(buscaNum) && busca.replace(/\D/g, '').length > 0) {
        query = query.eq('numero', buscaNum)
      } else {
        query = query.or(`modelo.ilike.%${busca}%,imei.ilike.%${busca}%`)
      }
    }

    const { data } = await query
    setItems((data as unknown as OS[]) ?? [])
    setLoading(false)
  }, [supabase, filtroStatus, search, busca, carregarConfigs])

  const fetchPendencias = useCallback(async () => {
    const { data } = await supabase
      .from('ordens_servico')
      .select('id,numero,status,modelo,defeito_relatado,valor_orcamento,snooze_ate,snooze_motivo,wa_enviado,created_at,clientes(nome,telefone)')
      .is('deleted_at', null)
      .neq('status', 'entregue')
      .neq('status', 'cancelada')
      .order('created_at', { ascending: false })
    setPendencias((data as unknown as Pendencia[]) ?? [])
  }, [supabase])

  useEffect(() => {
    fetchOS()
    fetchPendencias()
  }, [fetchOS, fetchPendencias])

  function onBuscaChange(v: string) {
    setBusca(v)
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    buscaTimer.current = setTimeout(() => fetchOS(), 300)
  }

  async function salvarSnooze() {
    if (!snoozeModal) return
    await supabase.from('ordens_servico').update({
      snooze_ate: snoozeModal.data || null,
      snooze_motivo: snoozeModal.data ? snoozeModal.motivo.trim() : null,
    }).eq('id', snoozeModal.os.id)
    setSnoozeModal(null)
    fetchPendencias()
  }

  async function removerSnooze(os: Pendencia) {
    await supabase.from('ordens_servico').update({ snooze_ate: null, snooze_motivo: null }).eq('id', os.id)
    fetchPendencias()
  }

  async function marcarWAEnviado(os: Pendencia, status: string) {
    const novo = { ...(os.wa_enviado ?? {}), [status]: true }
    await supabase.from('ordens_servico').update({ wa_enviado: novo }).eq('id', os.id)
    fetchPendencias()
    setWaModal(null)
  }

  function abrirModalAdiar(os: Pendencia) {
    const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    setSnoozeModal({ os, data: os.snooze_ate && os.snooze_ate > amanha ? os.snooze_ate : amanha, motivo: os.snooze_motivo || '' })
  }

  const hoje = new Date().toISOString().split('T')[0]
  const grupos: Record<SubGrupo, Pendencia[]> = { atrasada: [], pendente: [], no_prazo: [], adiada: [] }
  pendencias.forEach(os => { grupos[classificarOS(os, prazoHoras, prazoAlertaDias)].push(os) })

  const qtdAtrasadas = grupos.atrasada.length
  const totalPendencias = pendencias.length
  const snoozeValido = !!snoozeModal?.data && snoozeModal.data > hoje && snoozeModal.motivo.trim().length > 3

  return (
    <div style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Ordens de Serviço</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>
            {items.length} registros · {totalPendencias} pendências ativas
            {qtdAtrasadas > 0 && <span style={{ color: '#ef4444', fontWeight: 600, marginLeft: 8 }}>· {qtdAtrasadas} atrasada{qtdAtrasadas !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <Link href="/os/nova" style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, boxShadow: '0 1px 3px rgba(37,99,235,0.3)' }}>
          + Nova OS
        </Link>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        {([
          ['pendencias', `⏳ Pendências (${totalPendencias})${qtdAtrasadas > 0 ? ` · 🔴 ${qtdAtrasadas}` : ''}`],
          ['lista', '📋 Visão Geral'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setAba(key); if (key === 'lista') fetchOS(); else fetchPendencias() }}
            style={{
              padding: '10px 18px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: aba === key ? 600 : 400,
              color: aba === key ? '#2563eb' : key === 'pendencias' && qtdAtrasadas > 0 ? '#ef4444' : '#94a3b8',
              borderBottom: aba === key ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ABA VISÃO GERAL ═══ */}
      {aba === 'lista' && (
        <>
          {/* Busca */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <input
              value={busca}
              onChange={e => onBuscaChange(e.target.value)}
              placeholder="Buscar por cliente, modelo, IMEI ou nº OS..."
              style={{
                flex: 1, padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Kanban de status */}
          {Object.keys(statusCounts).length > 0 && (
            <div style={{
              display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20,
              padding: '16px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
            }}>
              {[
                'aguardando_diagnostico',
                'aberta',
                'em_orcamento',
                'em_andamento',
                'em_reparo',
                'aguardando_peca',
                'pronta',
              ].filter(s => (statusCounts[s] ?? 0) > 0).map(s => {
                const cfg = STATUS_CONFIG[s] ?? { label: s, bg: '#f1f5f9', color: '#475569', icon: '?' }
                const count = statusCounts[s] ?? 0
                const ativo = filtroStatus === s
                return (
                  <button
                    key={s}
                    onClick={() => setFiltroStatus(ativo ? 'todos' : s)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '10px 16px', borderRadius: 10, cursor: 'pointer', border: '2px solid',
                      background: ativo ? cfg.bg : '#f8fafc',
                      borderColor: ativo ? cfg.color : '#e2e8f0',
                      minWidth: 90,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: cfg.color, marginTop: 2 }}>{count}</span>
                    <span style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 2, lineHeight: 1.3 }}>
                      {cfg.label}
                    </span>
                  </button>
                )
              })}
              {filtroStatus !== 'todos' && (
                <button
                  onClick={() => setFiltroStatus('todos')}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', alignSelf: 'center',
                  }}
                >
                  ✕ Limpar filtro
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>Nenhuma OS encontrada</p>
              <Link href="/os/nova" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>+ Nova OS</Link>
            </div>
          ) : (
            <div>
              {items.map(os => (
                <Link key={os.id} href={`/os/${os.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div
                    style={{
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                      padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#c7d2fe')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  >
                    {/* Número */}
                    <div style={{
                      minWidth: 52, height: 52, borderRadius: 10, background: '#f5f3ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: '#6366f1', flexShrink: 0,
                    }}>
                      #{os.numero}
                    </div>

                    {/* Info principal */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                        {(os.clientes as { nome: string } | null)?.nome ?? '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {os.modelo ?? 'Modelo não informado'}
                      </div>
                      <div style={{
                        fontSize: 12, color: '#94a3b8', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400,
                      }}>
                        {os.defeito_relatado}
                      </div>
                    </div>

                    {/* Valor + Status + Tempo */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {os.valor_orcamento != null && (
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                          R$ {os.valor_orcamento.toFixed(2).replace('.', ',')}
                        </div>
                      )}
                      <div style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                        background: STATUS_CONFIG[os.status]?.bg ?? '#f1f5f9',
                        color: STATUS_CONFIG[os.status]?.color ?? '#475569',
                        marginTop: 4,
                      }}>
                        {STATUS_CONFIG[os.status]?.label ?? os.status}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        {diasAberto(os.created_at) === 0
                          ? 'hoje'
                          : `há ${diasAberto(os.created_at)} dia${diasAberto(os.created_at) > 1 ? 's' : ''}`}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ ABA PENDÊNCIAS ═══ */}
      {aba === 'pendencias' && (
        totalPendencias === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Nenhuma pendência!</p>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Todas as OS estão entregues ou em snooze.</p>
          </div>
        ) : (
          <div>
            <SubGrupoSection subgrupo="atrasada" lista={grupos.atrasada} onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} />
            <SubGrupoSection subgrupo="pendente" lista={grupos.pendente} onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} />
            <SubGrupoSection subgrupo="no_prazo" lista={grupos.no_prazo} onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} />
            <SubGrupoSection subgrupo="adiada"   lista={grupos.adiada}   onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} colapsavel />
          </div>
        )
      )}

      {/* ═══ MODAL SNOOZE ═══ */}
      {snoozeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>😴 Adiar OS #{snoozeModal.os.numero}</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{snoozeModal.os.clientes?.nome} · {snoozeModal.os.modelo ?? 'Aparelho'}</p>
              </div>
              <button onClick={() => setSnoozeModal(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Retornar na lista em *</label>
                <input type="date" value={snoozeModal.data} min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} onChange={e => setSnoozeModal({ ...snoozeModal, data: e.target.value })} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#0f172a' }} />
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>A OS ficará oculta das demais seções até esta data.</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Justificativa *</label>
                <textarea value={snoozeModal.motivo} onChange={e => setSnoozeModal({ ...snoozeModal, motivo: e.target.value })} placeholder="Ex: Aguardando peça do fornecedor, cliente viaja, orçamento pendente..." rows={3} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff', color: '#0f172a' }} />
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>O motivo ficará visível no card enquanto a OS estiver adiada.</p>
              </div>
              {snoozeModal.os.snooze_ate && (
                <button onClick={() => { removerSnooze(snoozeModal.os); setSnoozeModal(null) }} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  ✕ Remover adiamento (voltar para lista agora)
                </button>
              )}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setSnoozeModal(null)} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#475569' }}>Cancelar</button>
              <button onClick={salvarSnooze} disabled={!snoozeValido} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: snoozeValido ? 'pointer' : 'not-allowed', background: snoozeValido ? '#2563eb' : '#f1f5f9', color: snoozeValido ? '#fff' : '#94a3b8', boxShadow: snoozeValido ? '0 1px 3px rgba(37,99,235,0.3)' : 'none' }}>
                Confirmar adiamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL WHATSAPP ═══ */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>💬 Enviar mensagem WhatsApp</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>Para: <strong style={{ color: '#0f172a' }}>{waModal.os.clientes?.nome}</strong> · {waModal.os.clientes?.telefone ?? 'sem telefone'}</p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto' }}>
              {gerarMensagem(waModal.status, waModal.os)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setWaModal(null)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#475569' }}>Cancelar</button>
              <button
                onClick={() => { abrirWA(waModal.os.clientes?.telefone ?? null, gerarMensagem(waModal.status, waModal.os)); marcarWAEnviado(waModal.os, waModal.status) }}
                style={{ flex: 2, padding: '9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                💬 Abrir WhatsApp e marcar como enviado ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
