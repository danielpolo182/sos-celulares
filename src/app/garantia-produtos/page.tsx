'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Produto = { id: string; nome: string; preco_venda: number | null; estoque_atual: number | null; filial_id: string | null }

type VendaDoItem = {
  id: string
  venda_id: string
  descricao: string
  quantidade: number
  preco_unit: number
  vendas: {
    numero: number | null
    status: string
    created_at: string
    clientes: { id: string; nome: string } | null
  } | null
}

type Cliente = { id: string; nome: string; telefone: string | null; cpf: string | null }

type Garantia = {
  id: string
  produto_nome: string
  venda_id: string | null
  cliente_nome: string | null
  tipo: string
  quantidade: number
  valor_credito: number | null
  credito_status: string | null
  motivo: string | null
  usuario_nome: string | null
  created_at: string
}

const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }
const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 18 }

export default function GarantiaProdutosPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'nova' | 'registradas'>('nova')
  const [perfilAtual, setPerfilAtual] = useState<{ id: string; nome: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [tabelaFaltando, setTabelaFaltando] = useState(false)

  // Produto
  const [buscaProduto, setBuscaProduto] = useState('')
  const [resultados, setResultados] = useState<Produto[]>([])
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [produto, setProduto] = useState<Produto | null>(null)

  // Vendas do produto
  const [vendasItem, setVendasItem] = useState<VendaDoItem[]>([])
  const [limiteVendas, setLimiteVendas] = useState(5)
  const [temMaisVendas, setTemMaisVendas] = useState(false)
  const [vendaSel, setVendaSel] = useState<VendaDoItem | null>(null)

  // Tipo / dados
  const [tipo, setTipo] = useState<'troca' | 'credito' | null>(null)
  const [quantidade, setQuantidade] = useState('1')
  const [valorCredito, setValorCredito] = useState('')
  const [motivo, setMotivo] = useState('')

  // Cliente (para crédito)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState<Cliente[]>([])
  const clienteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Registradas
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [loadingGarantias, setLoadingGarantias] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: userData }) => {
      if (!userData.user) return
      const { data: p } = await supabase.from('perfis').select('id, nome').eq('id', userData.user.id).maybeSingle()
      setPerfilAtual(p ? { id: p.id, nome: p.nome } : { id: userData.user.id, nome: userData.user.email ?? 'Usuário' })
    })
  }, [supabase])

  // ── Busca de produto
  function onBuscaProduto(v: string) {
    setBuscaProduto(v)
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    if (v.trim().length < 2) { setResultados([]); return }
    buscaTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('produtos')
        .select('id,nome,preco_venda,estoque_atual,filial_id')
        .is('deleted_at', null)
        .or(`nome.ilike.%${v.trim()}%,codigo_interno.ilike.%${v.trim()}%`)
        .limit(8)
      setResultados((data as Produto[]) ?? [])
    }, 250)
  }

  const carregarVendasDoProduto = useCallback(async (produtoId: string, limite: number) => {
    const { data } = await supabase.from('venda_itens')
      .select('id,venda_id,descricao,quantidade,preco_unit,vendas(numero,status,created_at,clientes(id,nome))')
      .eq('produto_id', produtoId)
      .order('created_at', { ascending: false })
      .limit(limite + 1)
    const lista = (data as unknown as VendaDoItem[]) ?? []
    setTemMaisVendas(lista.length > limite)
    setVendasItem(lista.slice(0, limite))
  }, [supabase])

  function selecionarProduto(p: Produto) {
    setProduto(p); setBuscaProduto(''); setResultados([])
    setVendaSel(null); setTipo(null); setLimiteVendas(5)
    setValorCredito(p.preco_venda ? p.preco_venda.toFixed(2) : '')
    carregarVendasDoProduto(p.id, 5)
  }

  function carregarMaisVendas() {
    if (!produto) return
    const novo = limiteVendas + 5
    setLimiteVendas(novo)
    carregarVendasDoProduto(produto.id, novo)
  }

  function selecionarVenda(v: VendaDoItem) {
    const mesma = vendaSel?.id === v.id
    setVendaSel(mesma ? null : v)
    if (!mesma) {
      setValorCredito(v.preco_unit.toFixed(2))
      if (v.vendas?.clientes) setCliente({ id: v.vendas.clientes.id, nome: v.vendas.clientes.nome, telefone: null, cpf: null })
    }
  }

  // ── Busca de cliente (crédito)
  function onBuscaCliente(v: string) {
    setBuscaCliente(v)
    if (clienteTimer.current) clearTimeout(clienteTimer.current)
    if (v.trim().length < 2) { setResultadosCliente([]); return }
    clienteTimer.current = setTimeout(async () => {
      const digitos = v.replace(/\D/g, '')
      let q = supabase.from('clientes').select('id,nome,telefone,cpf').is('deleted_at', null).limit(6)
      if (digitos.length >= 3) q = q.or(`nome.ilike.%${v.trim()}%,telefone.ilike.%${digitos}%,cpf.ilike.%${digitos}%`)
      else q = q.ilike('nome', `%${v.trim()}%`)
      const { data } = await q
      setResultadosCliente((data as Cliente[]) ?? [])
    }, 250)
  }

  const qtd = Math.max(1, parseInt(quantidade) || 1)
  const estoque = produto?.estoque_atual ?? 0
  const semEstoqueParaTroca = produto !== null && estoque < qtd

  async function registrar() {
    if (!produto) { alert('Selecione o produto da garantia.'); return }
    if (!tipo) { alert('Escolha entre Troca ou Crédito.'); return }
    if (tipo === 'troca' && semEstoqueParaTroca) { alert(`Sem estoque suficiente para troca (disponível: ${estoque}). Gere um crédito para o cliente.`); return }
    if (tipo === 'credito' && !cliente) { alert('Para gerar crédito é preciso selecionar o cliente.'); return }
    const valor = parseFloat(valorCredito.replace(',', '.')) || 0
    if (tipo === 'credito' && valor <= 0) { alert('Informe o valor do crédito.'); return }
    setSalvando(true); setSucesso(null)

    const { error } = await supabase.from('garantias_produtos').insert({
      filial_id: produto.filial_id,
      produto_id: produto.id, produto_nome: produto.nome,
      venda_id: vendaSel?.venda_id ?? null,
      cliente_id: cliente?.id ?? null, cliente_nome: cliente?.nome ?? null,
      tipo, quantidade: qtd,
      valor_credito: tipo === 'credito' ? valor : null,
      credito_status: tipo === 'credito' ? 'pendente' : null,
      motivo: motivo.trim() || null,
      usuario_id: perfilAtual?.id ?? null, usuario_nome: perfilAtual?.nome ?? null,
    })
    if (error) {
      if (error.code === '42P01') setTabelaFaltando(true)
      alert(`Erro ao registrar: ${error.message}`)
      setSalvando(false); return
    }

    // Troca: baixa a unidade nova do estoque
    if (tipo === 'troca') {
      const { data: prod } = await supabase.from('produtos').select('estoque_atual, filial_id').eq('id', produto.id).single()
      if (prod && prod.estoque_atual != null) {
        await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - qtd) }).eq('id', produto.id)
        if (prod.filial_id)
          await supabase.from('movimentacoes_estoque').insert({
            filial_id: prod.filial_id, produto_id: produto.id, tipo: 'saida',
            quantidade: qtd, motivo: `Garantia (troca) — ${produto.nome}`,
          })
      }
    }

    setSucesso(tipo === 'troca'
      ? `Troca registrada! ${qtd}× ${produto.nome} baixado do estoque.`
      : `Crédito de ${fmt(valor)} gerado para ${cliente?.nome}.`)
    setProduto(null); setVendaSel(null); setVendasItem([]); setTipo(null)
    setQuantidade('1'); setValorCredito(''); setMotivo(''); setCliente(null); setBuscaCliente('')
    setSalvando(false)
  }

  // ── Registradas
  const fetchGarantias = useCallback(async () => {
    setLoadingGarantias(true)
    const { data, error } = await supabase.from('garantias_produtos')
      .select('id,produto_nome,venda_id,cliente_nome,tipo,quantidade,valor_credito,credito_status,motivo,usuario_nome,created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) { setTabelaFaltando(true); setLoadingGarantias(false); return }
    setTabelaFaltando(false)
    setGarantias((data as Garantia[]) ?? [])
    setLoadingGarantias(false)
  }, [supabase])

  useEffect(() => { if (aba === 'registradas') fetchGarantias() }, [aba, fetchGarantias])

  async function mudarCreditoStatus(g: Garantia, status: 'utilizado' | 'cancelado') {
    const msg = status === 'utilizado'
      ? `Marcar o crédito de ${fmt(g.valor_credito ?? 0)} de ${g.cliente_nome ?? 'cliente'} como UTILIZADO?`
      : `Cancelar o crédito de ${fmt(g.valor_credito ?? 0)} de ${g.cliente_nome ?? 'cliente'}?`
    if (!confirm(msg)) return
    await supabase.from('garantias_produtos').update({ credito_status: status, updated_at: new Date().toISOString() }).eq('id', g.id)
    fetchGarantias()
  }

  const creditosPendentes = garantias.filter(g => g.tipo === 'credito' && g.credito_status === 'pendente')

  return (
    <div style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Garantia de Produtos</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>Troca (baixa unidade nova do estoque) ou crédito pendente para o cliente, vinculado à venda original.</p>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 22, borderBottom: '1px solid #e2e8f0' }}>
        {([['nova', '➕ Nova garantia'], ['registradas', `📋 Registradas${creditosPendentes.length > 0 ? ` · 💳 ${creditosPendentes.length} crédito${creditosPendentes.length > 1 ? 's' : ''} pendente${creditosPendentes.length > 1 ? 's' : ''}` : ''}`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setAba(key)}
            style={{
              padding: '10px 18px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: aba === key ? 600 : 400, color: aba === key ? '#2563eb' : '#94a3b8',
              borderBottom: aba === key ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {tabelaFaltando && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#92400e' }}>
          ⚠️ A tabela de garantias de produtos ainda não existe no banco. Rode o arquivo <code>supabase-migration-garantia-produtos.sql</code> no SQL Editor do Supabase.
        </div>
      )}

      {sucesso && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#166534', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {sucesso}</span>
          <button onClick={() => { setSucesso(null); setAba('registradas') }} style={{ border: '1px solid #86efac', background: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#166534', fontWeight: 600 }}>Ver registradas →</button>
        </div>
      )}

      {/* ═══ ABA NOVA ═══ */}
      {aba === 'nova' && (
        <>
          {/* 1. Produto */}
          <div style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>1. Produto em garantia</h2>
            {!produto ? (
              <div style={{ position: 'relative' }}>
                <input value={buscaProduto} onChange={e => onBuscaProduto(e.target.value)}
                  placeholder="🔍 Buscar produto por nome ou código..." style={inp} />
                {resultados.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 260, overflowY: 'auto' }}>
                    {resultados.map(p => (
                      <button key={p.id} onClick={() => selecionarProduto(p)}
                        style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                        <span style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</span>
                        <span style={{ color: (p.estoque_atual ?? 0) > 0 ? '#065f46' : '#991b1b', flexShrink: 0, marginLeft: 8, fontWeight: 600 }}>estoque: {p.estoque_atual ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{produto.nome}</div>
                  <div style={{ fontSize: 12, marginTop: 3 }}>
                    <span style={{ fontWeight: 600, color: estoque > 0 ? '#065f46' : '#991b1b' }}>
                      {estoque > 0 ? `✅ ${estoque} em estoque` : '❌ Sem estoque'}
                    </span>
                    {produto.preco_venda != null && <span style={{ color: '#64748b' }}> · venda: {fmt(produto.preco_venda)}</span>}
                  </div>
                </div>
                <button onClick={() => { setProduto(null); setVendasItem([]); setVendaSel(null); setTipo(null) }}
                  style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                  Trocar produto
                </button>
              </div>
            )}
          </div>

          {/* 2. Vendas com este produto */}
          {produto && (
            <div style={card}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>2. Vincular à venda (opcional)</h2>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Últimas vendas com este produto — clique para vincular a garantia à venda.</p>
              {vendasItem.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Nenhuma venda registrada com este produto.</p>
              ) : (
                <>
                  {vendasItem.map(v => {
                    const sel = vendaSel?.id === v.id
                    return (
                      <button key={v.id} onClick={() => selecionarVenda(v)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                          padding: '10px 14px', marginBottom: 6, borderRadius: 9, cursor: 'pointer',
                          border: sel ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          background: sel ? '#eff6ff' : '#fff',
                        }}>
                        <span style={{ fontSize: 15 }}>{sel ? '🔗' : '🧾'}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                            Venda #{v.vendas?.numero ?? '—'} · {v.vendas?.created_at ? new Date(v.vendas.created_at).toLocaleDateString('pt-BR') : ''}
                          </span>
                          <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {v.quantidade}× {v.descricao} · {fmt(v.preco_unit)}
                            {v.vendas?.clientes?.nome ? ` · 👤 ${v.vendas.clientes.nome}` : ''}
                            {v.vendas?.status === 'cancelada' ? ' · ❌ venda cancelada' : ''}
                          </span>
                        </span>
                        {sel && <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>VINCULADA</span>}
                      </button>
                    )
                  })}
                  {temMaisVendas && (
                    <button onClick={carregarMaisVendas}
                      style={{ width: '100%', padding: '9px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#2563eb', fontWeight: 600 }}>
                      ↓ Carregar mais
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* 3. Troca ou crédito */}
          {produto && (
            <div style={card}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>3. Resolução</h2>

              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <button onClick={() => !semEstoqueParaTroca && setTipo('troca')}
                  disabled={semEstoqueParaTroca}
                  style={{
                    flex: 1, minWidth: 200, padding: '14px', borderRadius: 10, textAlign: 'left',
                    cursor: semEstoqueParaTroca ? 'not-allowed' : 'pointer', opacity: semEstoqueParaTroca ? 0.55 : 1,
                    border: tipo === 'troca' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                    background: tipo === 'troca' ? '#f0fdf4' : '#fff',
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>🔄 Troca</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Entrega uma unidade nova e baixa do estoque.</div>
                </button>
                <button onClick={() => setTipo('credito')}
                  style={{
                    flex: 1, minWidth: 200, padding: '14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                    border: tipo === 'credito' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: tipo === 'credito' ? '#eff6ff' : '#fff',
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>💳 Crédito</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Gera um valor pendente para o cliente usar depois.</div>
                </button>
              </div>

              {semEstoqueParaTroca && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
                  ⚠️ <strong>Sem estoque suficiente para troca</strong> (disponível: {estoque}). É necessário gerar um <strong>crédito</strong> para o cliente.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Quantidade</label>
                  <input type="number" min={1} style={inp} value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                </div>
                {tipo === 'credito' && (
                  <div>
                    <label style={lbl}>Valor do crédito (R$) *</label>
                    <input style={inp} value={valorCredito} onChange={e => setValorCredito(e.target.value)} placeholder="0,00" />
                  </div>
                )}
              </div>

              {tipo === 'credito' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Cliente do crédito *</label>
                  {cliente ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', flex: 1 }}>👤 {cliente.nome}</span>
                      <button onClick={() => setCliente(null)} style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>✕ trocar</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input style={inp} value={buscaCliente} onChange={e => onBuscaCliente(e.target.value)} placeholder="🔍 Buscar cliente por nome, telefone ou CPF..." />
                      {resultadosCliente.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 200, overflowY: 'auto' }}>
                          {resultadosCliente.map(c => (
                            <button key={c.id} onClick={() => { setCliente(c); setBuscaCliente(''); setResultadosCliente([]) }}
                              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                              <span style={{ fontWeight: 500, color: '#0f172a' }}>{c.nome}</span>
                              <span style={{ color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}>{c.telefone ?? c.cpf ?? ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Motivo / defeito apresentado</label>
                <textarea rows={2} style={{ ...inp, resize: 'vertical' }} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: display com linhas após 20 dias de uso..." />
              </div>

              <button onClick={registrar} disabled={salvando || !tipo}
                style={{
                  padding: '11px 26px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: salvando || !tipo ? 'not-allowed' : 'pointer',
                  background: !tipo ? '#e2e8f0' : tipo === 'troca' ? '#16a34a' : '#2563eb',
                  color: !tipo ? '#94a3b8' : '#fff',
                }}>
                {salvando ? 'Registrando...' : tipo === 'troca' ? '🔄 Registrar troca e baixar estoque' : tipo === 'credito' ? '💳 Gerar crédito pendente' : 'Escolha troca ou crédito'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══ ABA REGISTRADAS ═══ */}
      {aba === 'registradas' && (
        loadingGarantias ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
        ) : garantias.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>Nenhuma garantia de produto registrada</p>
          </div>
        ) : (
          <div>
            {garantias.map(g => {
              const credito = g.tipo === 'credito'
              const pendente = credito && g.credito_status === 'pendente'
              return (
                <div key={g.id} style={{
                  background: '#fff', border: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${credito ? (pendente ? '#2563eb' : g.credito_status === 'utilizado' ? '#16a34a' : '#94a3b8') : '#16a34a'}`,
                  borderRadius: 10, padding: '13px 16px', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 76 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(g.created_at).toLocaleDateString('pt-BR')}</div>
                    <span style={{
                      display: 'inline-block', marginTop: 4, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: credito ? '#dbeafe' : '#d1fae5', color: credito ? '#1d4ed8' : '#065f46',
                    }}>
                      {credito ? '💳 Crédito' : '🔄 Troca'}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{g.quantidade}× {g.produto_nome}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {g.cliente_nome && <span>👤 {g.cliente_nome} · </span>}
                      {g.motivo && <span>{g.motivo.slice(0, 60)}{g.motivo.length > 60 ? '…' : ''} · </span>}
                      {g.usuario_nome && <span>por {g.usuario_nome}</span>}
                    </div>
                    {g.venda_id && (
                      <Link href={`/vendas/${g.venda_id}`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                        🔗 Ver venda vinculada →
                      </Link>
                    )}
                  </div>
                  {credito && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: pendente ? '#1d4ed8' : '#64748b', textDecoration: g.credito_status === 'cancelado' ? 'line-through' : 'none' }}>
                        {fmt(g.valor_credito ?? 0)}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: pendente ? '#d97706' : g.credito_status === 'utilizado' ? '#16a34a' : '#94a3b8' }}>
                        {pendente ? '⏳ Pendente' : g.credito_status === 'utilizado' ? '✅ Utilizado' : '✕ Cancelado'}
                      </div>
                    </div>
                  )}
                  {pendente && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => mudarCreditoStatus(g, 'utilizado')} style={{ padding: '6px 12px', border: '1px solid #86efac', borderRadius: 7, background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✅ Utilizado</button>
                      <button onClick={() => mudarCreditoStatus(g, 'cancelado')} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>✕ Cancelar</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
