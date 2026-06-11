'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Produto = {
  id: string; nome: string; categoria?: string | null
  preco_venda: number; custo_unit: number; estoque_atual?: number
}

type ItemVenda = {
  produto_id: string | null; descricao: string
  quantidade: number; preco_unit: number; custo_unit: number; subtotal: number
}

type FormaPagKey = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'credito_avista' | 'credito_parcela' | 'transferencia'
type Pagamento = { forma: FormaPagKey; valor: number; parcelas?: number; valor_parcela?: number; taxa_aplicada?: number }

type MovimentoCaixa = {
  id: string; tipo: string; valor: number
  forma: string | null; observacoes: string | null; created_at: string; data_ref: string
}

type CaixaHoje = {
  saldo_atual: number; entradas: number; saidas: number
  valor_abertura: number; total_vendas: number
  aberto_em: string | null; fechado_em: string | null
}

type MaisVendido = { produto_id: string; total_qtd: number; produto: Produto | null }

const FORMAS: { key: FormaPagKey; label: string; icon: string; cor: string }[] = [
  { key: 'dinheiro',        label: 'Dinheiro',    icon: '💵', cor: '#16a34a' },
  { key: 'pix',             label: 'PIX',         icon: '📱', cor: '#6366f1' },
  { key: 'debito',          label: 'Débito',      icon: '💳', cor: '#8b5cf6' },
  { key: 'credito_avista',  label: 'Créd. à vista',icon: '💳', cor: '#0ea5e9' },
  { key: 'credito_parcela', label: 'Créd. Parc.', icon: '💳', cor: '#f59e0b' },
  { key: 'transferencia',   label: 'Transfer.',   icon: '🏦', cor: '#64748b' },
]

const CATEGORIA_ICONES: Record<string, string> = {
  'Display / Tela': '🖥', 'Bateria': '🔋', 'Conector de carga': '⚡',
  'Câmera': '📷', 'Alto-falante': '🔊', 'Outros': '📦',
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }

function formatMoeda(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }
function hoje() { return new Date().toISOString().split('T')[0] }

export default function PDVPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'venda' | 'caixa' | 'historico'>('venda')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [maisVendidos, setMaisVendidos] = useState<Produto[]>([])
  const [searchProd, setSearchProd] = useState('')
  const [prodResults, setProdResults] = useState<Produto[]>([])
  const [itens, setItens] = useState<ItemVenda[]>([])
  const [desconto, setDesconto] = useState(0)
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [formaPag, setFormaPag] = useState<FormaPagKey>('dinheiro')
  const [numParcelas, setNumParcelas] = useState(2)
  const [taxasConfig, setTaxasConfig] = useState<Record<string, { taxa_pct: number; taxa_fixa: number; taxas_parcelas?: Record<string, number> }>>({})
  const [maxParcelasConfig, setMaxParcelasConfig] = useState(12)
  const [valorPag, setValorPag] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [vendaOk, setVendaOk] = useState(false)
  const [ultimaVenda, setUltimaVenda] = useState<{ numero: number; total: number; troco: number } | null>(null)
  const [caixaHoje, setCaixaHoje] = useState<CaixaHoje | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [showCaixaModal, setShowCaixaModal] = useState(false)
  const [caixaAcao, setCaixaAcao] = useState<'abertura' | 'fechamento' | 'sangria' | 'suprimento' | 'reabertura'>('abertura')
  const [caixaValor, setCaixaValor] = useState('')
  const [caixaObs, setCaixaObs] = useState('')
  const [salvandoCaixa, setSalvandoCaixa] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mobileView, setMobileView] = useState<'produtos' | 'carrinho'>('produtos')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaPreco, setQaPreco] = useState('')
  const [qaSaving, setQaSaving] = useState(false)

  const subtotal = itens.reduce((s, i) => s + i.subtotal, 0)
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0)
  const baseTotal = Math.max(0, subtotal - desconto)

  // Calcula taxa da forma selecionada reativamente
  const taxaFormaAtual = (() => {
    const cfg = taxasConfig[formaPag]
    if (!cfg) return 0
    const taxaPct = (cfg.taxas_parcelas && cfg.taxas_parcelas[String(numParcelas)] !== undefined)
      ? cfg.taxas_parcelas[String(numParcelas)]
      : cfg.taxa_pct
    return +(baseTotal * taxaPct / 100 + cfg.taxa_fixa).toFixed(2)
  })()
  const total = +(baseTotal + taxaFormaAtual).toFixed(2)
  const taxaEfetivaAtual = baseTotal > 0 && taxaFormaAtual > 0 ? +((taxaFormaAtual / baseTotal) * 100).toFixed(2) : 0

  const troco = totalPago > total ? +(totalPago - total).toFixed(2) : 0
  const faltaPagar = Math.max(0, +(total - totalPago).toFixed(2))

  const fetchProdutos = useCallback(async () => {
    const { data } = await supabase.from('produtos').select('*').is('deleted_at', null).eq('ativo', true).order('nome')
    const lista = (data ?? []) as Produto[]
    setProdutos(lista)

    // Buscar mais vendidos dos últimos 30 dias
    const from30 = new Date(); from30.setDate(from30.getDate() - 30)
    const { data: vi } = await supabase
      .from('venda_itens')
      .select('produto_id, quantidade')
      .gte('created_at', from30.toISOString())
      .not('produto_id', 'is', null)

    if (vi && vi.length > 0) {
      const totais: Record<string, number> = {}
      vi.forEach(r => { if (r.produto_id) totais[r.produto_id] = (totais[r.produto_id] ?? 0) + (r.quantidade ?? 1) })
      const topIds = Object.entries(totais).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id)
      const topProdutos = topIds.map(id => lista.find(p => p.id === id)).filter(Boolean) as Produto[]
      setMaisVendidos(topProdutos)
    } else {
      // fallback: primeiros 12 por nome
      setMaisVendidos(lista.slice(0, 12))
    }
  }, [supabase])

  const fetchCaixa = useCallback(async () => {
    const d = hoje()
    const { data: caixa } = await supabase.from('vw_caixa_hoje').select('*').eq('data_ref', d).single()
    setCaixaHoje(caixa as CaixaHoje | null)
    const { data: movs } = await supabase.from('caixa_movimentos').select('*').eq('data_ref', d).order('created_at', { ascending: false })
    setMovimentos((movs ?? []) as MovimentoCaixa[])
  }, [supabase])

  useEffect(() => {
    fetchProdutos()
    fetchCaixa()
    // Carregar taxas das formas de pagamento
    supabase.from('sistema_config').select('valor').eq('chave', 'formas_pgto_taxas').maybeSingle().then(({ data }) => {
      if (data?.valor) {
        try {
          const formas = JSON.parse(data.valor) as { key: string; taxa_pct: number; taxa_fixa: number; max_parcelas?: number; taxas_parcelas?: Record<string,number> }[]
          const mapa: Record<string, { taxa_pct: number; taxa_fixa: number; taxas_parcelas?: Record<string,number> }> = {}
          formas.forEach(f => { mapa[f.key] = { taxa_pct: f.taxa_pct, taxa_fixa: f.taxa_fixa, taxas_parcelas: f.taxas_parcelas } })
          setTaxasConfig(mapa)
          const parcConf = formas.find(f => f.key === 'credito_parcela')
          if (parcConf?.max_parcelas) setMaxParcelasConfig(parcConf.max_parcelas)
        } catch {}
      }
    })
  }, [fetchProdutos, fetchCaixa, supabase])

  function buscarProduto(q: string) {
    setSearchProd(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      if (!q.trim()) { setProdResults([]); return }
      setProdResults(produtos.filter(p => p.nome.toLowerCase().includes(q.toLowerCase())).slice(0, 10))
    }, 200)
  }

  function adicionarProduto(p: Produto) {
    setItens(prev => {
      const exist = prev.findIndex(i => i.produto_id === p.id)
      if (exist >= 0) {
        const novo = [...prev]; novo[exist] = { ...novo[exist], quantidade: novo[exist].quantidade + 1, subtotal: (novo[exist].quantidade + 1) * novo[exist].preco_unit }; return novo
      }
      return [...prev, { produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unit: p.preco_venda, custo_unit: p.custo_unit ?? 0, subtotal: p.preco_venda }]
    })
    setSearchProd(''); setProdResults([])
  }

  function adicionarAvulso() {
    setItens(prev => [...prev, { produto_id: null, descricao: '', quantidade: 1, preco_unit: 0, custo_unit: 0, subtotal: 0 }])
  }

  function atualizarItem(i: number, field: keyof ItemVenda, value: string | number) {
    const novo = [...itens]; const item = { ...novo[i], [field]: value }
    if (field === 'quantidade' || field === 'preco_unit') item.subtotal = (field === 'quantidade' ? Number(value) : item.quantidade) * (field === 'preco_unit' ? Number(value) : item.preco_unit)
    novo[i] = item; setItens(novo)
  }

  function removerItem(i: number) { setItens(prev => prev.filter((_, idx) => idx !== i)) }

  async function salvarQuickAdd() {
    const nome = searchProd.trim()
    const preco = parseFloat(qaPreco.replace(',', '.')) || 0
    if (!nome || preco <= 0) return
    setQaSaving(true)
    const { data: prod, error } = await supabase.from('produtos').insert({
      nome, preco_venda: preco, custo_unit: 0,
      ativo: true, unidade: 'un', movimenta_estoque: true, cadastro_rapido: true,
    }).select('id, nome, preco_venda, custo_unit').single()
    if (prod && !error) {
      const p = prod as Produto
      setItens(prev => [...prev, { produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unit: p.preco_venda, custo_unit: 0, subtotal: p.preco_venda }])
      setProdutos(prev => [...prev, p])
      setShowQuickAdd(false); setQaPreco(''); setSearchProd(''); setProdResults([])
    } else if (error) {
      alert(`Erro ao cadastrar: ${error.message}`)
    }
    setQaSaving(false)
  }


  function calcularTotalComTaxa(valor: number, forma: FormaPagKey, parcelas: number): { total: number; taxa: number; taxaEfetivaPct: number } {
    const cfg = taxasConfig[forma]
    if (!cfg) return { total: valor, taxa: 0, taxaEfetivaPct: 0 }
    // Usa taxa específica da parcela se disponível; senão usa taxa_pct geral
    const taxaPct = (cfg.taxas_parcelas && cfg.taxas_parcelas[String(parcelas)] !== undefined)
      ? cfg.taxas_parcelas[String(parcelas)]
      : cfg.taxa_pct
    const taxa = +(valor * taxaPct / 100 + cfg.taxa_fixa).toFixed(2)
    const total = +(valor + taxa).toFixed(2)
    // Taxa efetiva = acréscimo real sobre o valor original
    const taxaEfetivaPct = valor > 0 ? +((taxa / valor) * 100).toFixed(2) : 0
    return { total, taxa, taxaEfetivaPct }
  }

  function adicionarPagamento() {
    // total já inclui a taxa reativamente — apenas registra o valor que será pago
    const valorFinal = parseFloat(valorPag) || faltaPagar
    if (!valorFinal || valorFinal <= 0) return
    if (formaPag === 'credito_parcela') {
      const valorParcela = +(valorFinal / numParcelas).toFixed(2)
      setPagamentos(prev => [...prev, { forma: formaPag, valor: +valorFinal.toFixed(2), parcelas: numParcelas, valor_parcela: valorParcela, taxa_aplicada: taxaEfetivaAtual > 0 ? taxaEfetivaAtual : undefined }])
    } else {
      setPagamentos(prev => [...prev, { forma: formaPag, valor: +valorFinal.toFixed(2), taxa_aplicada: taxaEfetivaAtual > 0 ? taxaEfetivaAtual : undefined }])
    }
    setValorPag('')
  }

  async function finalizarVenda() {
    if (itens.length === 0 || faltaPagar > 0.01) return
    setSalvando(true)
    const { data: venda } = await supabase.from('vendas').insert({
      status: 'finalizada', tipo: 'pdv', subtotal, desconto, total, taxa_pagamento: taxaFormaAtual > 0 ? taxaFormaAtual : null,
      valor_recebido: totalPago, troco,
      pagamentos,
      forma_pagamento: pagamentos.length === 1 ? pagamentos[0].forma : 'misto',
      pago: true, observacoes: obs || null,
    }).select('id, numero').single()

    if (venda) {
      await supabase.from('venda_itens').insert(itens.map(i => ({ venda_id: venda.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, preco_unit: i.preco_unit })))
      for (const item of itens) {
        if (item.produto_id) {
          const prod = produtos.find(p => p.id === item.produto_id)
          if (prod && prod.estoque_atual != null) await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - item.quantidade) }).eq('id', item.produto_id)
        }
      }
      await supabase.from('caixa_movimentos').insert({ tipo: 'venda', valor: total, forma: pagamentos.length === 1 ? pagamentos[0].forma : 'misto', referencia_id: venda.id, observacoes: `Venda #${venda.numero}`, data_ref: hoje() })
      setUltimaVenda({ numero: venda.numero, total, troco })
      setVendaOk(true)
      setItens([]); setPagamentos([]); setDesconto(0); setObs('')
      fetchProdutos(); fetchCaixa()
    }
    setSalvando(false)
  }

  async function salvarCaixa() {
    const v = parseFloat(caixaValor); if (isNaN(v) || v < 0) return
    setSalvandoCaixa(true)
    const d = hoje()
    if (caixaAcao === 'reabertura') {
      // Remove abertura e fechamento do dia para começar período limpo
      await supabase.from('caixa_movimentos').delete().eq('data_ref', d).in('tipo', ['abertura', 'fechamento'])
      await supabase.from('caixa_movimentos').insert({ tipo: 'abertura', valor: v, forma: 'dinheiro', observacoes: caixaObs || null, data_ref: d })
    } else {
      await supabase.from('caixa_movimentos').insert({ tipo: caixaAcao, valor: v, forma: 'dinheiro', observacoes: caixaObs || null, data_ref: d })
    }
    setSalvandoCaixa(false); setShowCaixaModal(false); setCaixaValor(''); setCaixaObs(''); fetchCaixa()
  }

  function imprimir() {
    if (!ultimaVenda) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;max-width:300px;margin:0 auto;padding:16px}
    .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between;margin:3px 0}</style></head><body>
    <div class="center bold" style="font-size:15px">SOS Celulares</div>
    <div class="center" style="font-size:10px;margin-bottom:8px">${new Date().toLocaleString('pt-BR')}</div>
    <div class="line"></div>
    <div class="bold">Venda #${ultimaVenda.numero}</div>
    <div class="line"></div>
    ${itens.map(i => `<div class="row"><span>${i.descricao} x${i.quantidade}</span><span>R$ ${i.subtotal.toFixed(2).replace('.', ',')}</span></div>`).join('')}
    <div class="line"></div>
    ${desconto > 0 ? `<div class="row"><span>Desconto</span><span>- R$ ${desconto.toFixed(2).replace('.', ',')}</span></div>` : ''}
    <div class="row bold"><span>TOTAL</span><span>R$ ${ultimaVenda.total.toFixed(2).replace('.', ',')}</span></div>
    ${pagamentos.map(p => `<div class="row"><span>${p.forma}</span><span>R$ ${p.valor.toFixed(2).replace('.', ',')}</span></div>`).join('')}
    ${ultimaVenda.troco > 0 ? `<div class="row bold"><span>Troco</span><span>R$ ${ultimaVenda.troco.toFixed(2).replace('.', ',')}</span></div>` : ''}
    <div class="line"></div>
    <div class="center">Obrigado pela preferência!</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const _b = new Blob([html], { type: 'text/html;charset=utf-8' }); const _u = URL.createObjectURL(_b); const _w = window.open(_u, '_blank'); if (_w) _w.onload = () => URL.revokeObjectURL(_u)
  }

  const caixaAberta = !!(caixaHoje?.aberto_em && !caixaHoje?.fechado_em)
  const caixaFechada = !!(caixaHoje?.aberto_em && caixaHoje?.fechado_em)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, fontFamily: 'var(--font-sans)', background: '#f8fafc', overflow: 'hidden', minHeight: 0 }}>
      <style>{`
        .pdv-cols { display: flex; flex: 1; overflow: hidden; min-height: 0; }
        .pdv-left { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #f8fafc; min-width: 0; }
        .pdv-right { width: 340px; min-width: 300px; display: flex; flex-direction: column; background: #fff; border-left: 1px solid #e2e8f0; overflow: hidden; }
        .pdv-right-bottom { border-top: 1px solid #f1f5f9; padding: 10px 12px; background: #fafafa; flex-shrink: 0; }
        .pdv-mob-tabs { display: none; }
        .pdv-cart-badge { display: none; }
        @media (max-width: 767px) {
          .pdv-mob-tabs { display: flex; gap: 0; border-bottom: 1px solid #e2e8f0; background: #fff; flex-shrink: 0; }
          .pdv-mob-tab { flex: 1; padding: 10px 8px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; background: transparent; color: #64748b; border-bottom: 2px solid transparent; }
          .pdv-mob-tab.active { color: #6366f1; border-bottom-color: #6366f1; background: #f5f3ff; }
          .pdv-left { display: none; }
          .pdv-left.mob-active { display: flex; }
          .pdv-right { width: 100%; min-width: 0; border-left: none; display: none; }
          .pdv-right.mob-active { display: flex; }
          .pdv-cart-badge { display: inline-block; background: #6366f1; color: #fff; border-radius: 10px; font-size: 10px; padding: 1px 5px; margin-left: 4px; }
        }
        @media (min-width: 768px) and (max-width: 1199px) {
          .pdv-right { width: 300px; min-width: 260px; }
        }
        @media (min-width: 1200px) {
          .pdv-right { width: 360px; }
        }
      `}</style>

      {/* Cabeçalho com abas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['venda', '🛒 Venda'], ['caixa', '💰 Caixa'], ['historico', '📋 Histórico']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: aba === k ? '#eef2ff' : 'transparent', cursor: 'pointer', color: aba === k ? '#6366f1' : '#64748b', borderRadius: 7 }}>{l}</button>
          ))}
        </div>
        {caixaAberta && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#ecfdf5', color: '#065f46' }}>✅ Caixa aberto · {formatMoeda(caixaHoje?.saldo_atual ?? 0)}</span>}
        {!caixaAberta && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#fef2f2', color: '#991b1b' }}>🔒 Caixa {caixaFechada ? 'fechado' : 'não aberto'}</span>}
      </div>

      {/* Mobile tabs (só aparece na aba venda em telas < 768px) */}
      {aba === 'venda' && (
        <div className="pdv-mob-tabs">
          <button className={`pdv-mob-tab${mobileView === 'produtos' ? ' active' : ''}`} onClick={() => setMobileView('produtos')}>🛍 Produtos</button>
          <button className={`pdv-mob-tab${mobileView === 'carrinho' ? ' active' : ''}`} onClick={() => setMobileView('carrinho')}>
            🛒 Carrinho{itens.length > 0 && <span className="pdv-cart-badge">{itens.length}</span>}
          </button>
        </div>
      )}

      {/* Conteúdo */}
      <div className="pdv-cols">

        {/* ── ABA VENDA — layout dois colunas */}
        {aba === 'venda' && (
          <>
            {/* Coluna esquerda: busca + grade de produtos */}
            <div className={`pdv-left${mobileView === 'produtos' ? ' mob-active' : ''}`}>
              {/* Barra de busca */}
              <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                  <input
                    style={{ ...inp, paddingLeft: 38, fontSize: 14 }}
                    placeholder="Buscar produto pelo nome..."
                    value={searchProd}
                    onChange={e => buscarProduto(e.target.value)}
                    autoComplete="off"
                  />
                  {(prodResults.length > 0 || (searchProd.trim() && prodResults.length === 0)) && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 4, overflow: 'hidden' }}>
                      {prodResults.map(p => (
                        <div key={p.id} onClick={() => adicionarProduto(p)} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                          <div>
                            <p style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8' }}>Estoque: {p.estoque_atual} · {p.categoria ?? 'Sem categoria'}</p>
                          </div>
                          <p style={{ fontWeight: 700, color: '#6366f1', whiteSpace: 'nowrap', marginLeft: 12 }}>{formatMoeda(p.preco_venda)}</p>
                        </div>
                      ))}
                      {searchProd.trim() && prodResults.length === 0 && (
                        <div>
                          <div style={{ padding: '8px 14px', fontSize: 12, color: '#94a3b8', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                            Nenhum resultado para &quot;{searchProd}&quot;
                          </div>
                          {!showQuickAdd ? (
                            <div onClick={() => setShowQuickAdd(true)}
                              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: '#059669', fontWeight: 500, background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 6 }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4' }}>
                              ➕ Cadastrar &quot;{searchProd}&quot; como novo produto
                            </div>
                          ) : (
                            <div style={{ padding: '10px 14px', background: '#f0fdf4', borderTop: '1px solid #dcfce7' }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>Novo produto: <span style={{ color: '#0f172a' }}>{searchProd}</span></p>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ ...lbl, marginBottom: 2 }}>Preço de venda (R$) *</label>
                                  <input
                                    autoFocus type="number" step="0.01" min="0"
                                    value={qaPreco} onChange={e => setQaPreco(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && salvarQuickAdd()}
                                    placeholder="0,00"
                                    style={{ ...inp, padding: '6px 10px', fontSize: 13 }}
                                  />
                                </div>
                                <button onClick={salvarQuickAdd} disabled={qaSaving || !qaPreco}
                                  style={{ marginTop: 14, padding: '7px 14px', background: !qaPreco ? '#e2e8f0' : '#059669', color: !qaPreco ? '#94a3b8' : '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: !qaPreco ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                                  {qaSaving ? '...' : '✓ Salvar'}
                                </button>
                                <button onClick={() => { setShowQuickAdd(false); setQaPreco('') }}
                                  style={{ marginTop: 14, padding: '7px 10px', background: 'none', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>
                                  ✕
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Grade de mais vendidos */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {!searchProd && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>⭐ Mais vendidos (30 dias)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
                      {maisVendidos.map(p => {
                        const qtdNoCarrinho = itens.find(i => i.produto_id === p.id)?.quantidade ?? 0
                        const semEstoque = p.estoque_atual === 0
                        return (
                          <button key={p.id} onClick={() => !semEstoque && adicionarProduto(p)} disabled={semEstoque}
                            style={{ padding: '14px 12px', borderRadius: 12, border: `2px solid ${qtdNoCarrinho > 0 ? '#818cf8' : '#e2e8f0'}`, background: qtdNoCarrinho > 0 ? '#eef2ff' : semEstoque ? '#f8fafc' : '#fff', cursor: semEstoque ? 'not-allowed' : 'pointer', textAlign: 'center', opacity: semEstoque ? 0.5 : 1, transition: 'all 0.12s' }}>
                            <div style={{ fontSize: 28, marginBottom: 6 }}>{CATEGORIA_ICONES[p.categoria ?? ''] ?? '📦'}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: qtdNoCarrinho > 0 ? '#3730a3' : '#0f172a', marginBottom: 4, lineHeight: 1.3 }}>{p.nome.length > 28 ? p.nome.slice(0, 26) + '…' : p.nome}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: qtdNoCarrinho > 0 ? '#4338ca' : '#6366f1' }}>{formatMoeda(p.preco_venda)}</div>
                            {qtdNoCarrinho > 0 && <div style={{ fontSize: 10, color: '#4338ca', marginTop: 3, fontWeight: 600 }}>× {qtdNoCarrinho} no carrinho</div>}
                            {semEstoque && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3 }}>Sem estoque</div>}
                            {!semEstoque && qtdNoCarrinho === 0 && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{p.estoque_atual} un</div>}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                {searchProd && prodResults.length === 0 && searchProd.trim() && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                    <p style={{ fontSize: 13 }}>Use o menu suspenso para cadastrar &quot;{searchProd}&quot;</p>
                  </div>
                )}
              </div>
            </div>

            {/* Coluna direita: carrinho + pagamento */}
            <div className={`pdv-right${mobileView === 'carrinho' ? ' mob-active' : ''}`}>
              {/* Feedback venda ok */}
              {vendaOk && ultimaVenda && (
                <div style={{ padding: '14px 16px', background: '#ecfdf5', borderBottom: '1px solid #bbf7d0', flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>✅ Venda #{ultimaVenda.numero} finalizada!</p>
                  {ultimaVenda.troco > 0 && <p style={{ fontSize: 15, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>Troco: {formatMoeda(ultimaVenda.troco)}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={imprimir} style={{ flex: 1, padding: '7px', border: '1px solid #86efac', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#065f46', fontWeight: 500 }}>🖨 Imprimir</button>
                    <button onClick={() => setVendaOk(false)} style={{ flex: 1, padding: '7px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#374151' }}>Nova venda</button>
                  </div>
                </div>
              )}

              {/* Carrinho */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Carrinho</p>
                {itens.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8' }}><div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div><p style={{ fontSize: 13 }}>Selecione produtos ao lado</p></div>
                ) : itens.map((item, i) => (
                  <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '10px 12px', marginBottom: 7 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        {item.produto_id
                          ? <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 5 }}>{item.descricao}</p>
                          : <input style={{ ...inp, fontSize: 12, marginBottom: 5, padding: '5px 8px' }} value={item.descricao} onChange={e => atualizarItem(i, 'descricao', e.target.value)} placeholder="Descrição..." />}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => atualizarItem(i, 'quantidade', Math.max(1, item.quantidade - 1))} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{item.quantidade}</span>
                          <button onClick={() => atualizarItem(i, 'quantidade', item.quantidade + 1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                          <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 2 }}>×</span>
                          <input type="number" step="0.01" value={item.preco_unit} onChange={e => atualizarItem(i, 'preco_unit', parseFloat(e.target.value) || 0)} style={{ width: 68, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{formatMoeda(item.subtotal)}</span>
                        </div>
                      </div>
                      <button onClick={() => removerItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Resumo + Pagamento + Finalizar */}
              <div className="pdv-right-bottom">
                {/* Subtotal, desconto, taxa, total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 5 }}>
                  <span>Subtotal ({itens.length} itens)</span>
                  <span style={{ fontWeight: 500, color: '#374151' }}>{formatMoeda(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748b', marginBottom: 5 }}>
                  <span>Desconto (R$)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {desconto > 0 && <span style={{ color: '#065f46', fontWeight: 500, fontSize: 11 }}>− {formatMoeda(desconto)}</span>}
                    <input type="number" value={desconto || ''} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} placeholder="0" style={{ width: 70, padding: '3px 7px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, textAlign: 'right', outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                </div>
                {taxaFormaAtual > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, color: '#92400e' }}>
                    <span>
                      Taxa ({FORMAS.find(f => f.key === formaPag)?.label ?? formaPag}
                      {formaPag === 'credito_parcela' ? ` ${numParcelas}x` : ''})
                      <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>efetivo {taxaEfetivaAtual}%</span>
                    </span>
                    <span style={{ fontWeight: 500 }}>+ {formatMoeda(taxaFormaAtual)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#6366f1', paddingTop: 8, borderTop: '1px solid #e2e8f0', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, alignSelf: 'center' }}>Total a cobrar</span>
                  <span>{formatMoeda(total)}</span>
                </div>

                {/* Formas de pagamento */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 8 }}>
                  {FORMAS.map(f => (
                    <button key={f.key} onClick={() => setFormaPag(f.key)} style={{ padding: '7px 2px', borderRadius: 7, border: '1px solid', cursor: 'pointer', fontSize: 10, fontWeight: 500, textAlign: 'center', background: formaPag === f.key ? f.cor + '15' : '#f8fafc', color: formaPag === f.key ? f.cor : '#64748b', borderColor: formaPag === f.key ? f.cor + '80' : '#e2e8f0' }}>
                      <div style={{ fontSize: 15, marginBottom: 1 }}>{f.icon}</div>
                      <div>{f.label}</div>
                    </button>
                  ))}
                </div>
                {formaPag === 'credito_parcela' && (
                  <div style={{ marginBottom: 8, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>Parcelas:</span>
                      <select value={numParcelas} onChange={e => setNumParcelas(parseInt(e.target.value))} style={{ padding: '4px 8px', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', fontFamily: 'inherit' }}>
                        {Array.from({ length: maxParcelasConfig - 1 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}x</option>)}
                      </select>
                    </div>
                    {faltaPagar > 0 && (
                      <div style={{ fontSize: 12, color: '#92400e' }}>
                        <span style={{ fontWeight: 600 }}>{numParcelas}x de R$ {(faltaPagar / numParcelas).toFixed(2).replace('.', ',')}</span>
                        {taxaFormaAtual > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: '#b45309' }}>
                            (acréscimo real: <strong>{taxaEfetivaAtual}%</strong> = +{formatMoeda(taxaFormaAtual)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
                  <input type="number" step="0.01" value={valorPag} onChange={e => setValorPag(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarPagamento()}
                    placeholder={faltaPagar > 0 ? faltaPagar.toFixed(2) : '0,00'} style={{ ...inp, flex: 1, padding: '7px 10px', fontSize: 13 }} />
                  <button onClick={adicionarPagamento} style={{ padding: '7px 14px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>+</button>
                </div>
                {pagamentos.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 9px', background: '#f0f4ff', border: '1px solid #e0e7ff', borderRadius: 6, marginBottom: 5, fontSize: 12 }}>
                    <div>
                      <span style={{ color: '#4338ca', fontWeight: 500 }}>
                        {FORMAS.find(f => f.key === p.forma)?.label ?? p.forma}
                      </span>
                      {p.parcelas && p.valor_parcela && (
                        <span style={{ color: '#92400e', fontSize: 11, marginLeft: 6 }}>
                          {p.parcelas}x R$ {p.valor_parcela.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      {p.taxa_aplicada != null && p.taxa_aplicada > 0 && !p.parcelas && (
                        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>+{p.taxa_aplicada}%</span>
                      )}
                      {p.taxa_aplicada != null && p.taxa_aplicada > 0 && p.parcelas && (
                        <span style={{ color: '#b45309', fontSize: 11, marginLeft: 6 }}>(efetivo {p.taxa_aplicada}%)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{formatMoeda(p.valor)}</span>
                      <button onClick={() => setPagamentos(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                    </div>
                  </div>
                ))}
                {pagamentos.length > 0 && faltaPagar > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 9px', background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#991b1b', fontWeight: 600, marginBottom: 6 }}><span>Falta</span><span>{formatMoeda(faltaPagar)}</span></div>}
                {troco > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 9px', background: '#ecfdf5', borderRadius: 6, fontSize: 13, color: '#065f46', fontWeight: 700, marginBottom: 6 }}><span>Troco</span><span>{formatMoeda(troco)}</span></div>}

                <div style={{ marginBottom: 8 }}>
                  <input style={{ ...inp, fontSize: 12, padding: '7px 10px' }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações (opcional)..." />
                </div>

                <button onClick={finalizarVenda} disabled={salvando || itens.length === 0 || faltaPagar > 0.01}
                  style={{ width: '100%', padding: '12px', background: salvando || itens.length === 0 || faltaPagar > 0.01 ? '#e2e8f0' : '#6366f1', color: salvando || itens.length === 0 || faltaPagar > 0.01 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: salvando || itens.length === 0 || faltaPagar > 0.01 ? 'not-allowed' : 'pointer' }}>
                  {salvando ? 'Finalizando...' : itens.length === 0 ? 'Adicione itens' : faltaPagar > 0.01 ? `Falta ${formatMoeda(faltaPagar)}` : `✓ Finalizar · ${formatMoeda(total)}`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── ABA CAIXA */}
        {aba === 'caixa' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ maxWidth: 620 }}>
              {/* Status do caixa */}
              <div style={{ background: caixaAberta ? '#f0fdf4' : '#fef2f2', border: `1px solid ${caixaAberta ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: caixaAberta ? '#065f46' : '#991b1b' }}>{caixaAberta ? '✅ Caixa aberto' : caixaFechada ? '🔒 Caixa fechado hoje' : '⚠️ Caixa não foi aberto hoje'}</p>
                    {caixaHoje?.aberto_em && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Aberto às {new Date(caixaHoje.aberto_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{caixaHoje.fechado_em ? ` · Fechado às ${new Date(caixaHoje.fechado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{formatMoeda(caixaHoje?.saldo_atual ?? 0)}</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>Saldo atual · {caixaHoje?.total_vendas ?? 0} venda(s)</p>
                  </div>
                </div>
              </div>

              {/* Cards entradas/saídas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Entradas', value: formatMoeda(caixaHoje?.entradas ?? 0), color: '#065f46', bg: '#ecfdf5' },
                  { label: 'Saídas', value: formatMoeda(caixaHoje?.saidas ?? 0), color: '#991b1b', bg: '#fef2f2' },
                ].map(m => (
                  <div key={m.label} style={{ background: m.bg, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</p>
                    <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Botões de ação */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 20 }}>
                {[
                  { acao: 'abertura' as const,   label: '🔓 Abrir caixa',    disabled: caixaAberta || caixaFechada },
                  { acao: 'fechamento' as const,  label: '🔒 Fechar caixa',   disabled: !caixaAberta },
                  { acao: 'sangria' as const,     label: '💸 Sangria',         disabled: !caixaAberta },
                  { acao: 'suprimento' as const,  label: '💵 Suprimento',      disabled: !caixaAberta },
                ].map(b => (
                  <button key={b.acao} disabled={b.disabled} onClick={() => { setCaixaAcao(b.acao); setCaixaValor(''); setCaixaObs(''); setShowCaixaModal(true) }}
                    style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: b.disabled ? 'not-allowed' : 'pointer', background: b.disabled ? '#f8fafc' : '#fff', color: b.disabled ? '#94a3b8' : '#374151', opacity: b.disabled ? 0.5 : 1 }}>{b.label}</button>
                ))}
              </div>

              {/* Botão reabrir (aparece só quando caixa foi fechado) */}
              {caixaFechada && (
                <button onClick={() => { setCaixaAcao('reabertura'); setCaixaValor(''); setCaixaObs(''); setShowCaixaModal(true) }}
                  style={{ width: '100%', padding: '11px', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#fffbeb', color: '#92400e', marginBottom: 16 }}>
                  🔄 Reabrir caixa (novo período)
                </button>
              )}

              {/* Movimentos do dia */}
              <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Movimentos de hoje</p>
              {movimentos.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>Nenhum movimento registrado hoje.</p>}
              {movimentos.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 500, color: '#374151', textTransform: 'capitalize' }}>{m.tipo}</span>
                    {m.observacoes && <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 12 }}>{m.observacoes}</span>}
                    <span style={{ color: '#cbd5e1', marginLeft: 8, fontSize: 11 }}>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: ['sangria', 'estorno', 'fechamento'].includes(m.tipo) ? '#991b1b' : '#065f46' }}>
                    {['sangria', 'estorno'].includes(m.tipo) ? '-' : '+'}{formatMoeda(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ABA HISTÓRICO */}
        {aba === 'historico' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <HistoricoCaixa supabase={supabase} />
          </div>
        )}
      </div>

      {/* Modal caixa */}
      {showCaixaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 360, padding: '24px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
              {caixaAcao === 'abertura' ? '🔓 Abrir caixa' : caixaAcao === 'fechamento' ? '🔒 Fechar caixa' : caixaAcao === 'reabertura' ? '🔄 Reabrir caixa' : caixaAcao === 'sangria' ? '💸 Sangria' : '💵 Suprimento'}
            </h3>
            {(caixaAcao === 'abertura' || caixaAcao === 'reabertura') && (
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Informe o saldo físico contado na gaveta no momento da abertura.</p>
            )}
            {caixaAcao === 'fechamento' && (
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Informe o saldo físico contado na gaveta agora.</p>
            )}
            <div style={{ marginBottom: 12 }}><label style={lbl}>Valor declarado (R$) *</label><input style={inp} type="number" step="0.01" min="0" value={caixaValor} onChange={e => setCaixaValor(e.target.value)} placeholder="0,00" autoFocus /></div>
            <div style={{ marginBottom: 16 }}><label style={lbl}>Observações</label><input style={inp} value={caixaObs} onChange={e => setCaixaObs(e.target.value)} placeholder="Opcional..." /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCaixaModal(false)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarCaixa} disabled={salvandoCaixa || !caixaValor} style={{ flex: 2, padding: '9px', background: !caixaValor ? '#e2e8f0' : '#6366f1', color: !caixaValor ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: !caixaValor ? 'not-allowed' : 'pointer' }}>
                {salvandoCaixa ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoricoCaixa({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [loading, setLoading] = useState(true)
  const [periodos, setPeriodos] = useState<{ data: string; abertura: MovimentoCaixa | null; fechamento: MovimentoCaixa | null; totalVendas: number; sangrias: number; suprimentos: number }[]>([])

  type MovimentoCaixa = { id: string; tipo: string; valor: number; forma: string | null; observacoes: string | null; created_at: string; data_ref: string }

  useEffect(() => {
    async function load() {
      const { data: movs } = await supabase
        .from('caixa_movimentos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (!movs) { setLoading(false); return }

      const porData: Record<string, MovimentoCaixa[]> = {}
      movs.forEach((m: MovimentoCaixa) => {
        const d = m.data_ref ?? m.created_at?.split('T')[0]
        if (d) { porData[d] = porData[d] ?? []; porData[d].push(m) }
      })

      const resultado = Object.entries(porData)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 30)
        .map(([data, lista]) => ({
          data,
          abertura: lista.find(m => m.tipo === 'abertura') ?? null,
          fechamento: lista.find(m => m.tipo === 'fechamento') ?? null,
          totalVendas: lista.filter(m => m.tipo === 'venda').reduce((s, m) => s + Number(m.valor), 0),
          sangrias: lista.filter(m => m.tipo === 'sangria').reduce((s, m) => s + Number(m.valor), 0),
          suprimentos: lista.filter(m => m.tipo === 'suprimento').reduce((s, m) => s + Number(m.valor), 0),
        }))

      setPeriodos(resultado)
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Carregando histórico...</div>
  if (periodos.length === 0) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Nenhum movimento registrado.</div>

  function formatMoeda(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

  return (
    <div style={{ maxWidth: 700 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>📋 Histórico de Caixa</p>
      {periodos.map(p => {
        const abertura = p.abertura ? Number(p.abertura.valor) : 0
        const fechamento = p.fechamento ? Number(p.fechamento.valor) : null
        const esperado = abertura + p.totalVendas + p.suprimentos - p.sangrias
        const diferenca = fechamento !== null ? fechamento - esperado : null
        return (
          <div key={p.data} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                  {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                  {p.abertura ? `Abertura: ${new Date(p.abertura.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Não aberto'}
                  {p.fechamento ? ` · Fechamento: ${new Date(p.fechamento.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ' · Ainda aberto'}
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: p.fechamento ? '#f1f5f9' : '#ecfdf5', color: p.fechamento ? '#475569' : '#065f46' }}>
                {p.fechamento ? 'Fechado' : '🟢 Aberto'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[
                { label: 'Abertura', value: formatMoeda(abertura), color: '#374151' },
                { label: 'Vendas', value: formatMoeda(p.totalVendas), color: '#065f46' },
                { label: 'Fechamento', value: fechamento !== null ? formatMoeda(fechamento) : '—', color: '#374151' },
                { label: 'Diferença', value: diferenca !== null ? formatMoeda(diferenca) : '—', color: diferenca === null ? '#94a3b8' : diferenca > 0 ? '#065f46' : diferenca < 0 ? '#991b1b' : '#374151' },
              ].map(c => (
                <div key={c.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.value}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
                </div>
              ))}
            </div>
            {(p.sangrias > 0 || p.suprimentos > 0) && (
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: '#64748b' }}>
                {p.sangrias > 0 && <span>💸 Sangria: {formatMoeda(p.sangrias)}</span>}
                {p.suprimentos > 0 && <span>💵 Suprimento: {formatMoeda(p.suprimentos)}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
