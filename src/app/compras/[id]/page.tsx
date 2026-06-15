'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type PedidoItem = {
  id: string
  produto_id: string
  produto_nome: string
  qtd_pedida: number
  qtd_sugerida: number
  preco_custo_ref: number | null
  qtd_recebida: number
  preco_pago: number
}

type Pedido = {
  id: string
  created_at: string
  status: 'rascunho' | 'enviado' | 'parcial' | 'concluido' | 'cancelado'
  periodo_dias: number
  fornecedor_nome: string | null
  pedido_origem_id: string | null
}

const statusColors: Record<string, string> = {
  rascunho: '#64748b',
  enviado: '#2563eb',
  parcial: '#d97706',
  concluido: '#16a34a',
  cancelado: '#dc2626',
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '6px 9px',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  fontSize: 13,
  color: '#1e293b',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

export default function PedidoRecebimentoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const supabase = createClient()
  const router = useRouter()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [itens, setItens] = useState<PedidoItem[]>([])
  const [recebimentos, setRecebimentos] = useState<Record<string, { qtd_recebida: number; preco_pago: number }>>({})
  const [loading, setLoading] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [novoPedidoId, setNovoPedidoId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  async function fetchPedido() {
    const { data: pedidoData } = await supabase
      .from('pedidos_compra')
      .select('id, created_at, status, periodo_dias, pedido_origem_id, fornecedores(nome)')
      .eq('id', resolvedParams.id)
      .single()

    if (pedidoData) {
      const forn = (pedidoData.fornecedores as unknown) as { nome: string } | null
      setPedido({
        id: pedidoData.id,
        created_at: pedidoData.created_at,
        status: pedidoData.status,
        periodo_dias: pedidoData.periodo_dias,
        pedido_origem_id: pedidoData.pedido_origem_id,
        fornecedor_nome: forn?.nome ?? null,
      })
    }

    const { data: itensData } = await supabase
      .from('pedido_itens')
      .select('id, produto_id, qtd_pedida, qtd_sugerida, preco_custo_ref, produtos(nome)')
      .eq('pedido_id', resolvedParams.id)

    if (itensData) {
      const mapped: PedidoItem[] = itensData.map((i: any) => ({
        id: i.id,
        produto_id: i.produto_id,
        produto_nome: i.produtos?.nome ?? '',
        qtd_pedida: i.qtd_pedida,
        qtd_sugerida: i.qtd_sugerida,
        preco_custo_ref: i.preco_custo_ref,
        qtd_recebida: 0,
        preco_pago: i.preco_custo_ref ?? 0,
      }))
      setItens(mapped)

      const rec: Record<string, { qtd_recebida: number; preco_pago: number }> = {}
      for (const item of mapped) {
        rec[item.id] = { qtd_recebida: 0, preco_pago: item.preco_custo_ref ?? 0 }
      }
      setRecebimentos(rec)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchPedido().finally(() => setLoading(false))
  }, [resolvedParams.id])

  function showToast(msg: string, tipo: 'ok' | 'erro') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 5000)
  }

  function updateRec(itemId: string, field: 'qtd_recebida' | 'preco_pago', value: number) {
    setRecebimentos(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }))
  }

  async function confirmar() {
    setConfirmando(true)
    try {
      const body = {
        itens: itens.map(item => ({
          pedido_item_id: item.id,
          qtd_recebida: recebimentos[item.id]?.qtd_recebida ?? 0,
          preco_pago: recebimentos[item.id]?.preco_pago ?? 0,
        })),
      }
      const res = await fetch(`/api/compras/pedidos/${resolvedParams.id}/receber`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'Erro ao confirmar')
      if (result.novo_pedido_id) {
        setNovoPedidoId(result.novo_pedido_id)
        showToast('Recebimento parcial. Novo pedido criado!', 'ok')
      } else {
        showToast('Pedido concluído com sucesso!', 'ok')
      }
      await fetchPedido()
    } catch (e: any) {
      showToast(e.message ?? 'Erro ao confirmar recebimento', 'erro')
    } finally {
      setConfirmando(false)
    }
  }

  const isReadonly = pedido?.status === 'concluido' || pedido?.status === 'cancelado'

  const totalPago = itens.reduce((acc, item) => {
    const r = recebimentos[item.id]
    return acc + (r ? r.qtd_recebida * r.preco_pago : 0)
  }, 0)

  const itensRecebidos = itens.filter(item => (recebimentos[item.id]?.qtd_recebida ?? 0) > 0).length

  const divergencias = itens.filter(item => {
    const r = recebimentos[item.id]
    if (!r) return false
    return r.preco_pago > (item.preco_custo_ref ?? 0) * 1.05
  }).length

  function rowStatus(item: PedidoItem) {
    const r = recebimentos[item.id]
    if (!r || r.qtd_recebida === 0) return { label: 'pendente', color: '#d97706', bg: '#fef3c7' }
    if (r.qtd_recebida < item.qtd_pedida) return { label: 'parcial', color: '#d97706', bg: '#fef3c7' }
    if (r.preco_pago > (item.preco_custo_ref ?? 0) * 1.05) return { label: 'preço subiu', color: '#dc2626', bg: '#fee2e2' }
    return { label: 'ok', color: '#16a34a', bg: '#dcfce7' }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Carregando...</div>
    )
  }

  if (!pedido) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Pedido não encontrado.</div>
    )
  }

  const dataFormatada = new Date(pedido.created_at).toLocaleDateString('pt-BR')

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'Inter, sans-serif', color: '#1e293b', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push('/compras')}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, marginBottom: 8, padding: 0 }}
        >
          ← Voltar para Compras
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Pedido #{pedido.id.slice(0, 8)}
          </h1>
          {pedido.fornecedor_nome && (
            <span style={{ fontSize: 14, color: '#64748b' }}>{pedido.fornecedor_nome}</span>
          )}
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 20,
            background: statusColors[pedido.status] + '20',
            color: statusColors[pedido.status],
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            {pedido.status}
          </span>
          <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 'auto' }}>{dataFormatada}</span>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Itens pedidos', value: itens.length },
          { label: 'Itens recebidos', value: itensRecebidos },
          { label: 'Total pago', value: `R$ ${totalPago.toFixed(2)}` },
          { label: 'Divergências', value: divergencias },
        ].map(card => (
          <div key={card.label} style={{
            background: '#fff',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #f1f5f9',
          }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        border: '1px solid #f1f5f9',
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Produto', 'Qtd pedida', 'Qtd recebida', 'Preço ref.', 'Preço pago', 'Subtotal', 'Status'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item, idx) => {
                const r = recebimentos[item.id] ?? { qtd_recebida: 0, preco_pago: 0 }
                const subtotal = r.qtd_recebida * r.preco_pago
                const status = rowStatus(item)
                return (
                  <tr key={item.id} style={{ borderBottom: idx < itens.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.produto_nome}</td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{item.qtd_pedida}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <input
                        type="number"
                        min={0}
                        max={item.qtd_pedida}
                        value={r.qtd_recebida}
                        disabled={isReadonly}
                        onChange={e => updateRec(item.id, 'qtd_recebida', Math.min(item.qtd_pedida, Math.max(0, Number(e.target.value))))}
                        style={{ ...inp, width: 70, opacity: isReadonly ? 0.6 : 1 }}
                      />
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>
                      {item.preco_custo_ref != null ? `R$ ${item.preco_custo_ref.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <input
                        type="number"
                        step={0.01}
                        min={0}
                        value={r.preco_pago}
                        disabled={isReadonly}
                        onChange={e => updateRec(item.id, 'preco_pago', Math.max(0, Number(e.target.value)))}
                        style={{ ...inp, width: 90, opacity: isReadonly ? 0.6 : 1 }}
                      />
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>R$ {subtotal.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 9px',
                        borderRadius: 20,
                        background: status.bg,
                        color: status.color,
                        whiteSpace: 'nowrap',
                      }}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Nenhum item encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          Total geral: R$ {totalPago.toFixed(2)}
        </div>
        <button
          onClick={confirmar}
          disabled={isReadonly || confirmando}
          style={{ ...btnPrimary, opacity: isReadonly || confirmando ? 0.5 : 1, cursor: isReadonly || confirmando ? 'not-allowed' : 'pointer' }}
        >
          {confirmando ? 'Confirmando...' : 'Confirmar recebimento'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          background: toast.tipo === 'ok' ? '#16a34a' : '#dc2626',
          color: '#fff',
          padding: '14px 20px',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          fontSize: 14,
          fontWeight: 500,
          zIndex: 1000,
          maxWidth: 340,
        }}>
          <div>{toast.msg}</div>
          {novoPedidoId && (
            <a
              href={`/compras/${novoPedidoId}`}
              style={{ color: '#fff', textDecoration: 'underline', fontSize: 13, display: 'block', marginTop: 6 }}
            >
              Ver novo pedido →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
