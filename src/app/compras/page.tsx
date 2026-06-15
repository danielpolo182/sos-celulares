'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type ListaItem = {
  produto_id: string
  nome: string
  categoria: string
  estoque_atual: number
  qtd_total: number
  qtd_media: number
  slope: number
  tendencia: 'alta' | 'baixa' | 'lancamento' | 'estavel'
  qtd_sugerida: number
  preco_custo: number
  na_blacklist: boolean
}

type Pedido = {
  id: string
  created_at: string
  status: 'rascunho' | 'enviado' | 'parcial' | 'concluido' | 'cancelado'
  periodo_dias: number
  observacoes: string | null
  fornecedor_id: string | null
  fornecedor_nome: string | null
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
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
  padding: '8px 16px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const statusColors: Record<string, string> = {
  rascunho: '#64748b',
  enviado: '#2563eb',
  parcial: '#d97706',
  concluido: '#16a34a',
  cancelado: '#dc2626',
}

function tendenciaLabel(t: ListaItem['tendencia']) {
  switch (t) {
    case 'alta': return { text: '↑ Alta', color: '#16a34a' }
    case 'baixa': return { text: '↓ Baixa', color: '#dc2626' }
    case 'lancamento': return { text: '🔥 Lançamento', color: '#2563eb' }
    case 'estavel': return { text: '— Estável', color: '#64748b' }
  }
}

export default function ComprasPage() {
  const supabase = createClient()
  const router = useRouter()

  const [aba, setAba] = useState<'lista' | 'pedidos'>('lista')
  const [periodo, setPeriodo] = useState<number>(60)
  const [itens, setItens] = useState<ListaItem[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [filialId, setFilialId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const [mostrarBlacklist, setMostrarBlacklist] = useState(false)
  const [selecionados, setSelecionados] = useState<Record<string, number>>({})
  const [modalGerarAberto, setModalGerarAberto] = useState(false)
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [gerando, setGerando] = useState(false)

  const carregarItens = useCallback(async (fId: string, per: number) => {
    const { data } = await supabase.rpc('calcular_lista_compras', {
      p_filial_id: fId,
      p_periodo_dias: per,
    })
    setItens((data ?? []) as ListaItem[])
  }, [supabase])

  const carregarPedidos = useCallback(async () => {
    const res = await fetch('/api/compras/pedidos')
    if (res.ok) {
      const json = await res.json() as { pedidos: Pedido[] }
      setPedidos(json.pedidos ?? [])
    }
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: perfil } = await supabase
        .from('perfis')
        .select('filial_id')
        .eq('id', user.id)
        .single()

      const fId = perfil?.filial_id ?? null
      setFilialId(fId)

      // Get periodo from configuracoes
      let per = 60
      if (fId) {
        const { data: cfg } = await supabase
          .from('configuracoes')
          .select('valor')
          .eq('chave', 'compras_periodo_dias')
          .eq('filial_id', fId)
          .single()
        if (cfg?.valor) per = parseInt(cfg.valor) || 60
      }
      setPeriodo(per)

      if (fId) {
        await carregarItens(fId, per)
        const { data: forn } = await supabase
          .from('fornecedores')
          .select('id, nome')
          .eq('filial_id', fId)
          .order('nome')
        setFornecedores((forn ?? []) as { id: string; nome: string }[])
      }

      await carregarPedidos()
      setLoading(false)
    }
    init()
  }, [supabase, carregarItens, carregarPedidos])

  async function onChangePeriodo(novoPeriodo: number) {
    setPeriodo(novoPeriodo)
    if (!filialId) return
    await carregarItens(filialId, novoPeriodo)
    // Save to configuracoes
    await supabase.from('configuracoes').upsert(
      { chave: 'compras_periodo_dias', valor: String(novoPeriodo), filial_id: filialId },
      { onConflict: 'chave,filial_id' }
    )
  }

  async function toggleBlacklist(produtoId: string, acao: 'adicionar' | 'remover') {
    if (!filialId) return
    await fetch('/api/compras/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produto_id: produtoId, filial_id: filialId, acao }),
    })
    if (filialId) await carregarItens(filialId, periodo)
  }

  async function exportarExcel() {
    const XLSX = await import('xlsx')
    const itensFiltrados = itensFiltradosAtual()
    const ws = XLSX.utils.json_to_sheet(itensFiltrados.map(i => ({
      Produto: i.nome,
      Estoque: i.estoque_atual,
      'Vendas/período': i.qtd_total,
      'Tendência': i.tendencia,
      'Qtd sugerida': i.qtd_sugerida,
      'Qtd pedido': selecionados[i.produto_id] ?? i.qtd_sugerida,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Lista de compras')
    XLSX.writeFile(wb, 'lista-compras.xlsx')
  }

  async function exportarPDF() {
    const { default: jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF()
    const itensFiltrados = itensFiltradosAtual()
    autoTable(doc, {
      head: [['Produto', 'Estoque', 'Vendas', 'Tendência', 'Qtd sug.', 'Qtd ped.']],
      body: itensFiltrados.map(i => [
        i.nome,
        i.estoque_atual,
        i.qtd_total,
        i.tendencia,
        i.qtd_sugerida,
        selecionados[i.produto_id] ?? i.qtd_sugerida,
      ]),
    })
    doc.save('lista-compras.pdf')
  }

  function itensFiltradosAtual() {
    return itens.filter(i => {
      if (!mostrarBlacklist && i.na_blacklist) return false
      if (busca && !i.nome.toLowerCase().includes(busca.toLowerCase())) return false
      if (filtroCategoria && i.categoria !== filtroCategoria) return false
      return true
    })
  }

  async function gerarPedido() {
    if (!fornecedorSelecionado) return
    setGerando(true)

    const itensPedido = itens
      .filter(i => !i.na_blacklist && (selecionados[i.produto_id] ?? i.qtd_sugerida) > 0)
      .map(i => ({
        produto_id: i.produto_id,
        qtd_sugerida: i.qtd_sugerida,
        qtd_pedida: selecionados[i.produto_id] ?? i.qtd_sugerida,
        preco_custo_ref: i.preco_custo,
      }))

    const res = await fetch('/api/compras/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fornecedor_id: fornecedorSelecionado,
        observacoes,
        periodo_dias: periodo,
        itens: itensPedido,
      }),
    })

    const json = await res.json() as { pedido_id?: string; error?: string }
    setGerando(false)

    if (!res.ok || json.error) {
      alert(`Erro: ${json.error}`)
      return
    }

    setModalGerarAberto(false)
    router.push('/compras/' + json.pedido_id)
  }

  const itensFiltrados = itensFiltradosAtual()
  const categorias = Array.from(new Set(itens.map(i => i.categoria).filter(Boolean)))
  const temItensSelecionados = itens.some(i => !i.na_blacklist && (selecionados[i.produto_id] ?? i.qtd_sugerida) > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', background: '#f8fafc' }}>

      {/* Header + tabs */}
      <div style={{ padding: '16px 24px 0', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Compras</h1>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Lista inteligente de reposição de estoque</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {([['lista', '🛒 Lista de compras'], ['pedidos', '📋 Pedidos']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              style={{
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: aba === k ? 600 : 400,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: aba === k ? '#2563eb' : '#64748b',
                borderBottom: aba === k ? '2px solid #2563eb' : '2px solid transparent',
                whiteSpace: 'nowrap',
                marginBottom: -1,
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── ABA LISTA DE COMPRAS */}
      {aba === 'lista' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Controls bar */}
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', background: '#fff', flexShrink: 0, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Period selector */}
            <select
              value={periodo}
              onChange={e => onChangePeriodo(Number(e.target.value))}
              style={{ ...inp, width: 'auto' }}
            >
              {[30, 60, 90, 180, 365].map(d => (
                <option key={d} value={d}>{d} dias</option>
              ))}
            </select>

            {/* Search */}
            <input
              placeholder="Buscar produto..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ ...inp, width: 200 }}
            />

            {/* Category chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setFiltroCategoria('')}
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  border: '1px solid',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: filtroCategoria === '' ? 600 : 400,
                  background: filtroCategoria === '' ? '#2563eb' : '#f1f5f9',
                  color: filtroCategoria === '' ? '#fff' : '#64748b',
                  borderColor: filtroCategoria === '' ? '#2563eb' : '#e2e8f0',
                }}
              >
                Todas
              </button>
              {categorias.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFiltroCategoria(cat === filtroCategoria ? '' : cat)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: '1px solid',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: filtroCategoria === cat ? 600 : 400,
                    background: filtroCategoria === cat ? '#2563eb' : '#f1f5f9',
                    color: filtroCategoria === cat ? '#fff' : '#64748b',
                    borderColor: filtroCategoria === cat ? '#2563eb' : '#e2e8f0',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Blacklist toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
              <div
                onClick={() => setMostrarBlacklist(v => !v)}
                style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', background: mostrarBlacklist ? '#2563eb' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: mostrarBlacklist ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
              Mostrar blacklist
            </label>

            {/* Export buttons */}
            <button onClick={exportarExcel} style={{ ...btnPrimary, background: '#16a34a', fontSize: 12 }}>
              📊 Excel
            </button>
            <button onClick={exportarPDF} style={{ ...btnPrimary, background: '#dc2626', fontSize: 12 }}>
              📄 PDF
            </button>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando lista...</div>
            ) : itensFiltrados.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhum item na lista de compras</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Ajuste o período ou os filtros para ver sugestões</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                    {['Produto', 'Estoque atual', 'Vendas/período', 'Tendência', 'Qtd sugerida', 'Qtd pedido', 'Ações'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map(item => {
                    const tend = tendenciaLabel(item.tendencia)
                    const isBlacklist = item.na_blacklist
                    return (
                      <tr
                        key={item.produto_id}
                        style={{ borderBottom: '1px solid #f1f5f9', opacity: isBlacklist ? 0.4 : 1 }}
                        onMouseEnter={e => { if (!isBlacklist) e.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a' }}>
                          <div>{item.nome}</div>
                          {item.categoria && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{item.categoria}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'monospace', fontSize: 12 }}>
                          {item.estoque_atual}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'monospace', fontSize: 12 }}>
                          {item.qtd_total}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: tend.color }}>
                            {tend.text}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#0f172a' }}>
                          {item.qtd_sugerida}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <input
                            type="number"
                            min={1}
                            disabled={isBlacklist}
                            value={selecionados[item.produto_id] ?? item.qtd_sugerida}
                            onChange={e => setSelecionados(prev => ({
                              ...prev,
                              [item.produto_id]: Math.max(1, parseInt(e.target.value) || 1),
                            }))}
                            style={{
                              ...inp,
                              width: 72,
                              textAlign: 'center',
                              opacity: isBlacklist ? 0.5 : 1,
                              cursor: isBlacklist ? 'not-allowed' : 'auto',
                            }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isBlacklist ? (
                            <button
                              onClick={() => toggleBlacklist(item.produto_id, 'remover')}
                              style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #bbf7d0', borderRadius: 6, background: '#ecfdf5', color: '#065f46', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                            >
                              Remover da blacklist
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleBlacklist(item.produto_id, 'adicionar')}
                              title="Adicionar à blacklist"
                              style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff1f2', color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              🚫
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              {itensFiltrados.filter(i => !i.na_blacklist).length} itens na lista
            </p>
            <button
              onClick={() => setModalGerarAberto(true)}
              disabled={!temItensSelecionados}
              style={{
                ...btnPrimary,
                opacity: temItensSelecionados ? 1 : 0.4,
                cursor: temItensSelecionados ? 'pointer' : 'not-allowed',
              }}
            >
              Gerar pedido de compra
            </button>
          </div>
        </div>
      )}

      {/* ── ABA PEDIDOS */}
      {aba === 'pedidos' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
          ) : pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <p style={{ color: '#94a3b8', fontSize: 14 }}>Nenhum pedido de compra gerado ainda.</p>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                    {['Nº', 'Fornecedor', 'Data', 'Status', 'Período', 'Ver'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map(p => (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                    >
                      <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>
                        #{p.id.slice(0, 8)}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a' }}>
                        {p.fornecedor_nome ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>
                        {new Date(p.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 20,
                          background: statusColors[p.status] + '1a',
                          color: statusColors[p.status],
                          border: `1px solid ${statusColors[p.status]}33`,
                          textTransform: 'capitalize',
                        }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>
                        {p.periodo_dias} dias
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => router.push(`/compras/${p.id}`)}
                          style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #bfdbfe', borderRadius: 6, background: '#dbeafe', color: '#2563eb', cursor: 'pointer', fontWeight: 500 }}
                        >
                          Ver →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODAL GERAR PEDIDO ═══ */}
      {modalGerarAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* Modal header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px 16px 0 0' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Gerar pedido de compra</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {itens.filter(i => !i.na_blacklist && (selecionados[i.produto_id] ?? i.qtd_sugerida) > 0).length} itens selecionados
                </p>
              </div>
              <button
                onClick={() => setModalGerarAberto(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Fornecedor *
                </label>
                <select
                  value={fornecedorSelecionado}
                  onChange={e => setFornecedorSelecionado(e.target.value)}
                  style={{ ...inp, background: !fornecedorSelecionado ? '#fef2f2' : '#fff', border: `1px solid ${!fornecedorSelecionado ? '#fecaca' : '#e2e8f0'}` }}
                >
                  <option value="">— Selecione um fornecedor —</option>
                  {fornecedores.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Observações
                </label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  placeholder="Informações adicionais para o pedido..."
                  rows={3}
                  style={{ ...inp, resize: 'vertical', minHeight: 80 }}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
              <button
                onClick={() => setModalGerarAberto(false)}
                style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={gerarPedido}
                disabled={gerando || !fornecedorSelecionado}
                style={{
                  ...btnPrimary,
                  padding: '9px 22px',
                  fontWeight: 600,
                  opacity: gerando || !fornecedorSelecionado ? 0.5 : 1,
                  cursor: gerando || !fornecedorSelecionado ? 'not-allowed' : 'pointer',
                }}
              >
                {gerando ? 'Gerando...' : 'Gerar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
