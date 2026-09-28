'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type VendaItem = { id: string; descricao: string; quantidade: number; preco_unit: number }

type Venda = {
  id: string
  numero: number | null
  status: string
  tipo: string | null
  total: number
  desconto: number
  subtotal: number
  forma_pagamento: string | null
  created_at: string
  perfis: { nome: string } | null
  venda_itens: VendaItem[]
}

const STATUS_VENDA: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  finalizada: { label: 'Concretizada', bg: '#d1fae5', color: '#065f46', icon: '✅' },
  aberta:     { label: 'Em andamento', bg: '#fef3c7', color: '#92400e', icon: '✏️' },
  cancelada:  { label: 'Cancelada',    bg: '#fee2e2', color: '#991b1b', icon: '❌' },
}

const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

const FORMA_LABEL: Record<string, string> = {
  dinheiro: '💵 Dinheiro', pix: '⚡ PIX', credito: '💳 Crédito', debito: '💳 Débito', misto: '🔀 Misto',
}

function labelDia(dataISO: string) {
  const d = new Date(dataISO)
  const hoje = new Date()
  const ontem = new Date(Date.now() - 86400000)
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const base = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  if (mesmoDia(d, hoje)) return `Hoje · ${base}`
  if (mesmoDia(d, ontem)) return `Ontem · ${base}`
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

export default function HistoricoVendasPage() {
  const supabase = createClient()
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'todas' | 'finalizada' | 'aberta' | 'cancelada'>('todas')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [periodoDias, setPeriodoDias] = useState(30)
  const [limite, setLimite] = useState(200)
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchVendas = useCallback(async () => {
    setLoading(true)
    const inicio = periodoDias > 0 ? new Date(Date.now() - periodoDias * 86400000).toISOString() : null

    // Contagem por status dentro do período
    let qc = supabase.from('vendas').select('status').is('deleted_at', null)
    if (inicio) qc = qc.gte('created_at', inicio)
    const { data: todas } = await qc
    const counts: Record<string, number> = {}
    for (const row of todas ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1
    setStatusCounts(counts)

    let q = supabase
      .from('vendas')
      .select('id,numero,status,tipo,total,desconto,subtotal,forma_pagamento,created_at,perfis(nome),venda_itens(id,descricao,quantidade,preco_unit)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limite)
    if (inicio) q = q.gte('created_at', inicio)
    if (filtroStatus !== 'todas') q = q.eq('status', filtroStatus)

    const { data } = await q
    setVendas((data as unknown as Venda[]) ?? [])
    setLoading(false)
  }, [supabase, filtroStatus, periodoDias, limite])

  useEffect(() => { fetchVendas() }, [fetchVendas])

  function onBuscaChange(v: string) {
    setBusca(v)
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    buscaTimer.current = setTimeout(() => setBuscaDebounced(v), 250)
  }

  // Filtro de busca local: nº da venda, item, operador ou forma de pagamento
  const termo = buscaDebounced.trim().toLowerCase()
  const filtradas = termo.length >= 1
    ? vendas.filter(v =>
        String(v.numero ?? '').includes(termo)
        || v.venda_itens.some(i => i.descricao.toLowerCase().includes(termo))
        || (v.perfis?.nome ?? '').toLowerCase().includes(termo)
        || (v.forma_pagamento ?? '').toLowerCase().includes(termo))
    : vendas

  // Agrupar por dia
  const porDia: { dia: string; label: string; vendas: Venda[] }[] = []
  for (const v of filtradas) {
    const dia = new Date(v.created_at).toDateString()
    let grupo = porDia[porDia.length - 1]
    if (!grupo || grupo.dia !== dia) {
      grupo = { dia, label: labelDia(v.created_at), vendas: [] }
      porDia.push(grupo)
    }
    grupo.vendas.push(v)
  }

  const totalPeriodo = filtradas.filter(v => v.status === 'finalizada').reduce((s, v) => s + (v.total ?? 0), 0)

  return (
    <div style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Histórico de Vendas</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>
            {filtradas.length} vendas no período · concretizadas: <strong style={{ color: '#065f46' }}>{fmt(totalPeriodo)}</strong>
          </p>
        </div>
        <Link href="/pdv" style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, boxShadow: '0 1px 3px rgba(37,99,235,0.3)' }}>
          + Nova venda (PDV)
        </Link>
      </div>

      {/* Busca + período */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={busca}
          onChange={e => onBuscaChange(e.target.value)}
          placeholder="🔍 Buscar por nº da venda, produto, operador ou forma de pagamento..."
          style={{ flex: 1, minWidth: 260, padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
        <select
          value={periodoDias}
          onChange={e => { setPeriodoDias(Number(e.target.value)); setLimite(200) }}
          style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Último ano</option>
          <option value={0}>Tudo</option>
        </select>
      </div>

      {/* Filtro de status */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {([
          ['todas', `Todas (${(statusCounts.finalizada ?? 0) + (statusCounts.aberta ?? 0) + (statusCounts.cancelada ?? 0)})`],
          ['finalizada', `✅ Concretizadas (${statusCounts.finalizada ?? 0})`],
          ['aberta', `✏️ Em andamento (${statusCounts.aberta ?? 0})`],
          ['cancelada', `❌ Canceladas (${statusCounts.cancelada ?? 0})`],
        ] as const).map(([key, label]) => {
          const ativo = filtroStatus === key
          return (
            <button
              key={key}
              onClick={() => { setFiltroStatus(key); setLimite(200) }}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: ativo ? 600 : 400, cursor: 'pointer',
                border: ativo ? '1px solid #2563eb' : '1px solid #e2e8f0',
                background: ativo ? '#dbeafe' : '#fff',
                color: ativo ? '#1d4ed8' : '#64748b',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
      ) : porDia.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>Nenhuma venda encontrada</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Ajuste o período ou o filtro de status.</p>
        </div>
      ) : (
        <>
          {porDia.map(grupo => {
            const totalDia = grupo.vendas.filter(v => v.status === 'finalizada').reduce((s, v) => s + (v.total ?? 0), 0)
            const qtdCanceladas = grupo.vendas.filter(v => v.status === 'cancelada').length
            return (
              <div key={grupo.dia} style={{ marginBottom: 26 }}>
                {/* Cabeçalho do dia */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>📅 {grupo.label}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {grupo.vendas.length} venda{grupo.vendas.length > 1 ? 's' : ''} · <strong style={{ color: '#065f46' }}>{fmt(totalDia)}</strong>
                    {qtdCanceladas > 0 && <span style={{ color: '#991b1b' }}> · {qtdCanceladas} cancelada{qtdCanceladas > 1 ? 's' : ''}</span>}
                  </span>
                </div>

                {grupo.vendas.map(v => {
                  const st = STATUS_VENDA[v.status] ?? { label: v.status, bg: '#f1f5f9', color: '#475569', icon: '•' }
                  const cancelada = v.status === 'cancelada'
                  const emAndamento = v.status === 'aberta'
                  const qtdItens = v.venda_itens.reduce((s, i) => s + i.quantidade, 0)
                  const resumo = v.venda_itens.length === 0
                    ? 'Sem itens'
                    : v.venda_itens[0].descricao + (v.venda_itens.length > 1 ? ` +${v.venda_itens.length - 1} ite${v.venda_itens.length - 1 > 1 ? 'ns' : 'm'}` : '')
                  return (
                    <Link key={v.id} href={`/vendas/${v.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                      <div
                        style={{
                          background: cancelada ? '#fef2f2' : '#fff',
                          border: `1px solid ${cancelada ? '#fecaca' : '#e2e8f0'}`,
                          borderLeft: `4px solid ${cancelada ? '#ef4444' : emAndamento ? '#f59e0b' : '#10b981'}`,
                          opacity: cancelada ? 0.75 : 1,
                          borderRadius: 10, padding: '12px 16px', marginBottom: 8,
                          display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#c7d2fe')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = cancelada ? '#fecaca' : '#e2e8f0')}
                      >
                        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 46 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>#{v.numero ?? v.id.slice(0, 6)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {new Date(v.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {resumo}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {qtdItens} ite{qtdItens > 1 ? 'ns' : 'm'} · {FORMA_LABEL[v.forma_pagamento ?? ''] ?? v.forma_pagamento ?? '—'}
                            {v.perfis?.nome && <span> · 👤 {v.perfis.nome}</span>}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: cancelada ? '#991b1b' : '#0f172a', textDecoration: cancelada ? 'line-through' : 'none' }}>
                            {fmt(v.total ?? 0)}
                          </div>
                          <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                            {st.icon} {st.label}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )
          })}

          {vendas.length >= limite && (
            <button
              onClick={() => setLimite(l => l + 200)}
              style={{ width: '100%', padding: '11px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#2563eb', fontWeight: 600 }}
            >
              ↓ Carregar mais vendas antigas
            </button>
          )}
        </>
      )}
    </div>
  )
}
