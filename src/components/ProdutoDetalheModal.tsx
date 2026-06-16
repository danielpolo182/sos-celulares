'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  produtoId: string
  onClose: () => void
}

type Produto = {
  id: string; nome: string; categoria: string | null; estoque_atual: number
  estoque_minimo: number | null; preco_venda: number; custo_medio: number
  ativo: boolean; created_at: string; campos_extras?: Record<string, unknown>
}

type Movimentacao = {
  id: string; tipo: string; quantidade: number; created_at: string
  motivo: string | null; referencia_tipo: string | null; referencia_id: string | null
}

export default function ProdutoDetalheModal({ produtoId, onClose }: Props) {
  const supabase = createClient()
  const [produto, setProduto] = useState<Produto | null>(null)
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'info'|'movimentacoes'>('info')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: perfil } = await supabase.from('perfis').select('filial_id').eq('id', user.id).single()
      const filialId = perfil?.filial_id

      const [pResult, mResult] = await Promise.allSettled([
        supabase.from('produtos').select('*').eq('id', produtoId).single(),
        supabase.from('movimentacoes_estoque')
          .select('id,tipo,quantidade,created_at,motivo,referencia_tipo,referencia_id')
          .eq('produto_id', produtoId)
          .eq('filial_id', filialId)
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      if (pResult.status === 'fulfilled') setProduto(pResult.value.data as Produto ?? null)
      if (mResult.status === 'fulfilled') setMovs((mResult.value.data ?? []) as Movimentacao[])
      setLoading(false)
    }
    load()
  }, [produtoId])

  const fmt = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const tipoConfig: Record<string, { icon: string; color: string; sinal: string }> = {
    entrada: { icon: '⬆', color: '#16a34a', sinal: '+' },
    saida: { icon: '⬇', color: '#dc2626', sinal: '-' },
    ajuste: { icon: '⚙', color: '#d97706', sinal: '±' },
    compra: { icon: '📦', color: '#2563eb', sinal: '+' },
    venda: { icon: '🛒', color: '#dc2626', sinal: '-' },
    os: { icon: '🔧', color: '#7c3aed', sinal: '-' },
    devolucao: { icon: '↩', color: '#16a34a', sinal: '+' },
  }

  const estoqueLabel = produto
    ? produto.estoque_atual <= 0 ? '🔴 Sem estoque'
    : produto.estoque_minimo && produto.estoque_atual <= produto.estoque_minimo ? '🟡 Estoque baixo'
    : '🟢 Em estoque'
    : ''

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{loading ? 'Carregando...' : produto?.nome ?? '—'}</div>
            {!loading && produto?.categoria && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{produto.categoria}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>✕</button>
        </div>

        {/* Summary cards */}
        {!loading && produto && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            {[
              { label: 'Estoque', value: String(produto.estoque_atual), sub: estoqueLabel },
              { label: 'Custo médio', value: fmt(produto.custo_medio) },
              { label: 'Preço venda', value: fmt(produto.preco_venda) },
              { label: 'Movimentações', value: String(movs.length) },
            ].map(s => (
              <div key={s.label} style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.sub ?? s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', flexShrink: 0, padding: '0 16px' }}>
          {([['info','📋 Informações'],['movimentacoes','📊 Movimentações']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAba(k)}
              style={{ padding: '10px 14px', border: 'none', background: 'none', fontSize: 13, fontWeight: aba === k ? 600 : 400, color: aba === k ? '#2563eb' : '#64748b', cursor: 'pointer', borderBottom: aba === k ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Carregando...</div>}

          {!loading && aba === 'info' && produto && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { label: 'Nome', value: produto.nome },
                { label: 'Categoria', value: produto.categoria },
                { label: 'Estoque atual', value: String(produto.estoque_atual) },
                { label: 'Estoque mínimo', value: produto.estoque_minimo != null ? String(produto.estoque_minimo) : null },
                { label: 'Custo médio', value: fmt(produto.custo_medio) },
                { label: 'Preço de venda', value: fmt(produto.preco_venda) },
                { label: 'Margem', value: produto.custo_medio > 0 ? `${(((produto.preco_venda - produto.custo_medio) / produto.custo_medio) * 100).toFixed(1)}%` : '—' },
                { label: 'Status', value: produto.ativo ? '✅ Ativo' : '❌ Inativo' },
                { label: 'Cadastrado em', value: new Date(produto.created_at).toLocaleDateString('pt-BR') },
              ].filter(r => r.value != null).map(r => (
                <div key={r.label} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ minWidth: 120, fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.label}</span>
                  <span style={{ fontSize: 14, color: '#1e293b' }}>{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {!loading && aba === 'movimentacoes' && (
            movs.length === 0
              ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Nenhuma movimentação registrada.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['Data/Hora','Tipo','Quantidade','Motivo/Referência'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{movs.map(m => {
                    const cfg = tipoConfig[m.tipo] ?? tipoConfig[m.referencia_tipo ?? ''] ?? { icon: '•', color: '#64748b', sinal: '' }
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(m.created_at)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: cfg.color + '20', color: cfg.color }}>
                            {cfg.icon} {m.referencia_tipo ?? m.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: cfg.color }}>
                          {cfg.sinal}{Math.abs(m.quantidade)}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>
                          {m.motivo ?? (m.referencia_tipo ? `${m.referencia_tipo} ${m.referencia_id ? '#' + m.referencia_id.slice(0,8) : ''}` : '—')}
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table>
          )}
        </div>
      </div>
    </div>
  )
}
