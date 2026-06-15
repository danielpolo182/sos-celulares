'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ModalPixRemoto from '@/components/pix/ModalPixRemoto'

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

const FORMAS: { key: FormaPagKey; label: string; icon: string; cor: string }[] = [
  { key: 'dinheiro',        label: 'Dinheiro',      icon: '💵', cor: '#16a34a' },
  { key: 'pix',             label: 'PIX',            icon: '📱', cor: '#2563eb' },
  { key: 'debito',          label: 'Débito',         icon: '💳', cor: '#8b5cf6' },
  { key: 'credito_avista',  label: 'Créd. à vista',  icon: '💳', cor: '#0ea5e9' },
  { key: 'credito_parcela', label: 'Créd. Parc.',    icon: '💳', cor: '#f59e0b' },
  { key: 'transferencia',   label: 'Transfer.',      icon: '🏦', cor: '#64748b' },
]

const TROCO_RAPIDO = [10, 20, 50, 100, 200]

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
  const router = useRouter()

  // Navegação de tela
  const [tela, setTela] = useState<'venda' | 'caixa' | 'historico'>('venda')
  const [etapa, setEtapa] = useState<'produtos' | 'pagamento'>('produtos')

  // Produtos
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [maisVendidos, setMaisVendidos] = useState<Produto[]>([])
  const [searchProd, setSearchProd] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownIndex, setDropdownIndex] = useState(0)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaPreco, setQaPreco] = useState('')
  const [qaSaving, setQaSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Carrinho
  const [itens, setItens] = useState<ItemVenda[]>([])
  const [desconto, setDesconto] = useState(0)
  const [obs, setObs] = useState('')

  // Pagamento
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [formaPag, setFormaPag] = useState<FormaPagKey>('dinheiro')
  const [numParcelas, setNumParcelas] = useState(2)
  const [taxasConfig, setTaxasConfig] = useState<Record<string, { taxa_pct: number; taxa_fixa: number; taxas_parcelas?: Record<string, number> }>>({})
  const [maxParcelasConfig, setMaxParcelasConfig] = useState(12)
  const [valorPag, setValorPag] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [vendaOk, setVendaOk] = useState(false)
  const [ultimaVenda, setUltimaVenda] = useState<{ numero: number; total: number; troco: number } | null>(null)
  const [ultimaVendaId, setUltimaVendaId] = useState<string | null>(null)
  const [pixCriando, setPixCriando] = useState(false)
  const [pixModal, setPixModal] = useState<{ cobrancaId: string; pixCopiaCola: string; valor: number; expiraEm: string; temTelefone: boolean } | null>(null)

  // Caixa
  const [caixaHoje, setCaixaHoje] = useState<CaixaHoje | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [showCaixaModal, setShowCaixaModal] = useState(false)
  const [caixaAcao, setCaixaAcao] = useState<'abertura' | 'fechamento' | 'sangria' | 'suprimento' | 'reabertura'>('abertura')
  const [caixaValor, setCaixaValor] = useState('')
  const [caixaObs, setCaixaObs] = useState('')
  const [salvandoCaixa, setSalvandoCaixa] = useState(false)

  // Derivados
  const prodResults = searchProd.trim()
    ? produtos.filter(p => {
        const q = searchProd.toLowerCase()
        return p.nome.toLowerCase().includes(q)
      })
    : []

  const subtotal = itens.reduce((s, i) => s + i.subtotal, 0)
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0)
  const baseTotal = Math.max(0, subtotal - desconto)

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

  const caixaAberta = !!(caixaHoje?.aberto_em && !caixaHoje?.fechado_em)
  const caixaFechada = !!(caixaHoje?.aberto_em && caixaHoje?.fechado_em)

  // Fetch
  const fetchProdutos = useCallback(async () => {
    const { data } = await supabase.from('produtos').select('*').is('deleted_at', null).eq('ativo', true).order('nome')
    const lista = (data ?? []) as Produto[]
    setProdutos(lista)

    const from30 = new Date(); from30.setDate(from30.getDate() - 30)
    const { data: vi } = await supabase
      .from('venda_itens').select('produto_id, quantidade')
      .gte('created_at', from30.toISOString()).not('produto_id', 'is', null)

    if (vi && vi.length > 0) {
      const totais: Record<string, number> = {}
      vi.forEach(r => { if (r.produto_id) totais[r.produto_id] = (totais[r.produto_id] ?? 0) + (r.quantidade ?? 1) })
      const topIds = Object.entries(totais).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id)
      setMaisVendidos(topIds.map(id => lista.find(p => p.id === id)).filter(Boolean) as Produto[])
    } else {
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
    supabase.from('sistema_config').select('valor').eq('chave', 'formas_pgto_taxas').maybeSingle().then(({ data }) => {
      if (data?.valor) {
        try {
          const formas = JSON.parse(data.valor) as { key: string; taxa_pct: number; taxa_fixa: number; max_parcelas?: number; taxas_parcelas?: Record<string, number> }[]
          const mapa: Record<string, { taxa_pct: number; taxa_fixa: number; taxas_parcelas?: Record<string, number> }> = {}
          formas.forEach(f => { mapa[f.key] = { taxa_pct: f.taxa_pct, taxa_fixa: f.taxa_fixa, taxas_parcelas: f.taxas_parcelas } })
          setTaxasConfig(mapa)
          const parcConf = formas.find(f => f.key === 'credito_parcela')
          if (parcConf?.max_parcelas) setMaxParcelasConfig(parcConf.max_parcelas)
        } catch { /* ignore */ }
      }
    })
  }, [fetchProdutos, fetchCaixa, supabase])

  // Hotkeys globais
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'F6') {
        e.preventDefault()
        if (tela === 'venda') {
          if (etapa === 'produtos' && itens.length > 0) setEtapa('pagamento')
          else if (etapa === 'pagamento' && faltaPagar <= 0.01 && itens.length > 0 && formaPag !== 'pix') finalizarVenda()
        }
        return
      }
      if (e.key === 'Escape') {
        if (dropdownOpen && searchProd) { setSearchProd(''); setDropdownOpen(false); return }
        if (etapa === 'pagamento') { setEtapa('produtos'); return }
        return
      }
      if (!isInput) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (prodResults.length > 0) {
            e.preventDefault()
            setDropdownIndex(i => e.key === 'ArrowDown' ? Math.min(i + 1, prodResults.length - 1) : Math.max(i - 1, 0))
          }
          return
        }
        if (e.key === 'Enter') {
          if (prodResults.length > 0 && dropdownIndex < prodResults.length) {
            e.preventDefault()
            adicionarProduto(prodResults[dropdownIndex])
          }
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela, etapa, itens, faltaPagar, formaPag, dropdownOpen, searchProd, prodResults, dropdownIndex])

  // Fecha dropdown ao clicar fora do container de busca
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setShowQuickAdd(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset dropdown index quando resultados mudam
  useEffect(() => { setDropdownIndex(0) }, [searchProd])

  // Scroll do item selecionado no dropdown
  useEffect(() => {
    const el = dropdownRef.current?.children[dropdownIndex] as HTMLElement | undefined
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [dropdownIndex])

  function adicionarProduto(p: Produto) {
    setItens(prev => {
      const exist = prev.findIndex(i => i.produto_id === p.id)
      if (exist >= 0) {
        const novo = [...prev]
        novo[exist] = { ...novo[exist], quantidade: novo[exist].quantidade + 1, subtotal: (novo[exist].quantidade + 1) * novo[exist].preco_unit }
        return novo
      }
      return [...prev, { produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unit: p.preco_venda, custo_unit: p.custo_unit ?? 0, subtotal: p.preco_venda }]
    })
    setSearchProd('')
    setDropdownOpen(false)
    setShowQuickAdd(false)
    searchRef.current?.focus()
  }

  function atualizarItem(i: number, field: keyof ItemVenda, value: string | number) {
    const novo = [...itens]; const item = { ...novo[i], [field]: value }
    if (field === 'quantidade' || field === 'preco_unit')
      item.subtotal = (field === 'quantidade' ? Number(value) : item.quantidade) * (field === 'preco_unit' ? Number(value) : item.preco_unit)
    novo[i] = item; setItens(novo)
  }

  function removerItem(i: number) { setItens(prev => prev.filter((_, idx) => idx !== i)) }

  async function salvarQuickAdd() {
    const nome = searchProd.trim()
    const preco = parseFloat(qaPreco.replace(',', '.')) || 0
    if (!nome || preco <= 0) return
    setQaSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = user ? await supabase.from('perfis').select('filial_id').eq('id', user.id).single() : { data: null }
    const { data: prod, error } = await supabase.from('produtos').insert({
      nome, preco_venda: preco, custo_unit: 0, ativo: true, unidade: 'un', movimenta_estoque: true, cadastro_rapido: true,
      filial_id: (perfil as { filial_id: string } | null)?.filial_id ?? null,
    }).select('id, nome, preco_venda, custo_unit').single()
    if (prod && !error) {
      const p = prod as Produto
      setItens(prev => [...prev, { produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unit: p.preco_venda, custo_unit: 0, subtotal: p.preco_venda }])
      setProdutos(prev => [...prev, p])
      setShowQuickAdd(false); setQaPreco(''); setSearchProd(''); setDropdownOpen(false)
    } else if (error) { alert(`Erro ao cadastrar: ${error.message}`) }
    setQaSaving(false)
  }

  function adicionarPagamento() {
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
      valor_recebido: totalPago, troco, pagamentos,
      forma_pagamento: pagamentos.length === 1 ? pagamentos[0].forma : 'misto',
      pago: true, observacoes: obs || null,
    }).select('id, numero').single()

    if (venda) {
      await supabase.from('venda_itens').insert(itens.map(i => ({ venda_id: venda.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, preco_unit: i.preco_unit })))
      for (const item of itens) {
        if (item.produto_id) {
          const prod = produtos.find(p => p.id === item.produto_id)
          if (prod && prod.estoque_atual != null)
            await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - item.quantidade) }).eq('id', item.produto_id)
        }
      }
      await supabase.from('caixa_movimentos').insert({ tipo: 'venda', valor: total, forma: pagamentos.length === 1 ? pagamentos[0].forma : 'misto', referencia_id: venda.id, observacoes: `Venda #${venda.numero}`, data_ref: hoje() })
      setUltimaVenda({ numero: venda.numero, total, troco })
      setVendaOk(true)
      setItens([]); setPagamentos([]); setDesconto(0); setObs('')
      setEtapa('produtos')
      fetchProdutos(); fetchCaixa()
    }
    setSalvando(false)
  }

  async function criarVendaParaPix(): Promise<string | null> {
    if (itens.length === 0 || total <= 0) return null
    setSalvando(true)
    const { data: venda, error: vendaErr } = await supabase.from('vendas').insert({
      status: 'finalizada', subtotal, desconto, total, forma_pagamento: 'pix', pago: false, observacoes: obs || null,
    }).select('id, numero').single()

    if (vendaErr) { console.error('[criarVendaParaPix]', vendaErr); alert('Erro ao criar venda: ' + vendaErr.message); setSalvando(false); return null }
    if (venda) {
      await supabase.from('venda_itens').insert(itens.map(i => ({ venda_id: venda.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, preco_unit: i.preco_unit })))
      for (const item of itens) {
        if (item.produto_id) {
          const prod = produtos.find(p => p.id === item.produto_id)
          if (prod && prod.estoque_atual != null)
            await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - item.quantidade) }).eq('id', item.produto_id)
        }
      }
      await supabase.from('caixa_movimentos').insert({ tipo: 'venda', valor: total, forma: 'pix', referencia_id: venda.id, observacoes: `Venda #${venda.numero} (PIX pendente)`, data_ref: hoje() })
      setUltimaVendaId(venda.id)
      setItens([]); setPagamentos([]); setDesconto(0); setObs('')
      setEtapa('produtos')
      fetchProdutos(); fetchCaixa()
      setSalvando(false)
      return venda.id
    }
    setSalvando(false)
    return null
  }

  async function criarPixPresencialPdv() {
    const vendaId = await criarVendaParaPix()
    if (!vendaId) return
    setPixCriando(true)
    try {
      const res = await fetch('/api/pix/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenciaId: vendaId, tipoReferencia: 'pdv', valor: total, modalidade: 'presencial', descricao: 'Venda PDV' }),
      })
      const data = await res.json() as { cobrancaId?: string; qrCodeBase64?: string; pixCopiaCola?: string; expiraEm?: string; error?: string }
      if (!res.ok || !data.cobrancaId) { alert(data.error ?? 'Erro ao gerar PIX'); return }
      sessionStorage.setItem(`pix_${data.cobrancaId}`, JSON.stringify({ qrCodeBase64: data.qrCodeBase64, pixCopiaCola: data.pixCopiaCola, expiraEm: data.expiraEm, valor: total, tipoReferencia: 'pdv', referenciaId: vendaId }))
      router.push(`/pagamento/${data.cobrancaId}`)
    } finally { setPixCriando(false) }
  }

  async function criarPixRemotoPdv() {
    const vendaId = await criarVendaParaPix()
    if (!vendaId) return
    setPixCriando(true)
    try {
      const res = await fetch('/api/pix/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenciaId: vendaId, tipoReferencia: 'pdv', valor: total, modalidade: 'remoto', descricao: 'Venda PDV' }),
      })
      const data = await res.json() as { cobrancaId?: string; pixCopiaCola?: string; expiraEm?: string; error?: string }
      if (!res.ok || !data.cobrancaId) { alert(data.error ?? 'Erro ao gerar PIX'); return }
      setPixModal({ cobrancaId: data.cobrancaId, pixCopiaCola: data.pixCopiaCola!, valor: total, expiraEm: data.expiraEm!, temTelefone: false })
    } finally { setPixCriando(false) }
  }

  async function salvarCaixa() {
    const v = parseFloat(caixaValor); if (isNaN(v) || v < 0) return
    setSalvandoCaixa(true)
    const d = hoje()
    if (caixaAcao === 'reabertura') {
      await supabase.from('caixa_movimentos').delete().eq('data_ref', d).in('tipo', ['abertura', 'fechamento'])
      await supabase.from('caixa_movimentos').insert({ tipo: 'abertura', valor: v, forma: 'dinheiro', observacoes: caixaObs || null, data_ref: d })
    } else {
      await supabase.from('caixa_movimentos').insert({ tipo: caixaAcao, valor: v, forma: 'dinheiro', observacoes: caixaObs || null, data_ref: d })
    }
    setSalvandoCaixa(false); setShowCaixaModal(false); setCaixaValor(''); setCaixaObs(''); fetchCaixa()
  }

  function novaVenda() {
    setVendaOk(false); setUltimaVenda(null); setEtapa('produtos')
    searchRef.current?.focus()
  }

  function imprimir() {
    if (!ultimaVenda) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;max-width:300px;margin:0 auto;padding:16px}
    .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between;margin:3px 0}</style></head><body>
    <div class="center bold" style="font-size:15px">SOS Celulares</div>
    <div class="center" style="font-size:10px;margin-bottom:8px">${new Date().toLocaleString('pt-BR')}</div>
    <div class="line"></div><div class="bold">Venda #${ultimaVenda.numero}</div><div class="line"></div>
    ${itens.map(i => `<div class="row"><span>${i.descricao} x${i.quantidade}</span><span>R$ ${i.subtotal.toFixed(2).replace('.', ',')}</span></div>`).join('')}
    <div class="line"></div>
    ${desconto > 0 ? `<div class="row"><span>Desconto</span><span>- R$ ${desconto.toFixed(2).replace('.', ',')}</span></div>` : ''}
    <div class="row bold"><span>TOTAL</span><span>R$ ${ultimaVenda.total.toFixed(2).replace('.', ',')}</span></div>
    ${pagamentos.map(p => `<div class="row"><span>${p.forma}</span><span>R$ ${p.valor.toFixed(2).replace('.', ',')}</span></div>`).join('')}
    ${ultimaVenda.troco > 0 ? `<div class="row bold"><span>Troco</span><span>R$ ${ultimaVenda.troco.toFixed(2).replace('.', ',')}</span></div>` : ''}
    <div class="line"></div><div class="center">Obrigado pela preferência!</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const b = new Blob([html], { type: 'text/html;charset=utf-8' }); const u = URL.createObjectURL(b)
    const w = window.open(u, '_blank'); if (w) w.onload = () => URL.revokeObjectURL(u)
  }

  const showDropdown = dropdownOpen && searchProd.trim().length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#e2e8f0', fontFamily: 'var(--font-sans, system-ui, sans-serif)', overflow: 'hidden', padding: '12px' }}>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', boxShadow: '0 4px 24px rgba(15,23,42,0.10)', overflow: 'hidden', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
      <style>{`
        .pdv-card-btn:hover { background: #dbeafe !important; border-color: #93c5fd !important; }
        .pdv-dd-item:hover { background: #eff6ff !important; }
        .pdv-dd-item.selected { background: #eff6ff; }
        .pdv-forma-btn:hover { opacity: 0.85; }
        .pdv-nav-btn:hover { background: #f1f5f9 !important; }
        .pdv-item-row:hover .pdv-remove-btn { opacity: 1 !important; }
        .pdv-remove-btn { opacity: 0; transition: opacity 0.15s; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 52, background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, zIndex: 10 }}>
        {/* Logo / nome */}
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginRight: 8 }}>🛒 PDV</span>

        {/* Abas de tela */}
        <div style={{ display: 'flex', gap: 2 }}>
          {([['venda', '📦 Venda'], ['caixa', '💰 Caixa'], ['historico', '📋 Histórico']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTela(k)} className="pdv-nav-btn"
              style={{ padding: '6px 14px', fontSize: 13, fontWeight: tela === k ? 600 : 400, border: 'none', background: tela === k ? '#eff6ff' : 'transparent', cursor: 'pointer', color: tela === k ? '#2563eb' : '#64748b', borderRadius: 7, transition: 'background 0.1s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Status caixa */}
        <div style={{ marginLeft: 8 }}>
          {caixaAberta
            ? <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#ecfdf5', color: '#065f46' }}>✅ Caixa · {formatMoeda(caixaHoje?.saldo_atual ?? 0)}</span>
            : <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#fef2f2', color: '#991b1b' }}>🔒 Caixa {caixaFechada ? 'fechado' : 'não aberto'}</span>}
        </div>

        {/* Hotkeys hint */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {tela === 'venda' && etapa === 'produtos' && (
            <>
              <HotKey k="F2" label="Buscar" />
              <HotKey k="↑↓" label="Navegar" />
              <HotKey k="Enter" label="Adicionar" />
              {itens.length > 0 && <HotKey k="F6" label="Pagamento" />}
            </>
          )}
          {tela === 'venda' && etapa === 'pagamento' && (
            <>
              <HotKey k="Esc" label="Voltar" />
              {faltaPagar <= 0.01 && formaPag !== 'pix' && <HotKey k="F6" label="Finalizar" />}
            </>
          )}
        </div>

        {/* Fechar PDV */}
        <button onClick={() => router.push('/dashboard')} className="pdv-nav-btn"
          style={{ marginLeft: 12, padding: '6px 14px', fontSize: 13, fontWeight: 500, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b', borderRadius: 7 }}>
          ✕ Fechar PDV
        </button>
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ═══════════════ TELA VENDA ═══════════════ */}
        {tela === 'venda' && (
          <>
            {/* ETAPA 1 — PRODUTOS */}
            {etapa === 'produtos' && (
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

                {/* Coluna esquerda: busca + mais vendidos */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

                  {/* Barra de busca com dropdown */}
                  <div style={{ padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <div ref={searchContainerRef} style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#94a3b8', pointerEvents: 'none', zIndex: 1 }}>🔍</span>
                      <input
                        ref={searchRef}
                        style={{ ...inp, paddingLeft: 42, paddingRight: 100, fontSize: 14, borderRadius: 10, border: '2px solid', borderColor: dropdownOpen ? '#2563eb' : '#e2e8f0', transition: 'border-color 0.15s' }}
                        placeholder="Buscar por nome ou código... (F2)"
                        value={searchProd}
                        onChange={e => { setSearchProd(e.target.value); setDropdownOpen(true); setShowQuickAdd(false) }}
                        onFocus={() => { if (searchProd) setDropdownOpen(true) }}
                        onKeyDown={e => {
                          if (e.key === 'ArrowDown' && prodResults.length > 0) { e.preventDefault(); setDropdownIndex(i => Math.min(i + 1, prodResults.length - 1)) }
                          if (e.key === 'ArrowUp' && prodResults.length > 0) { e.preventDefault(); setDropdownIndex(i => Math.max(i - 1, 0)) }
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (prodResults.length > 0 && dropdownIndex < prodResults.length) adicionarProduto(prodResults[dropdownIndex])
                          }
                          if (e.key === 'Escape') { setSearchProd(''); setDropdownOpen(false); setShowQuickAdd(false) }
                        }}
                        autoComplete="off"
                        autoFocus
                      />
                      {searchProd && (
                        <button onClick={() => { setSearchProd(''); setDropdownOpen(false); setShowQuickAdd(false); searchRef.current?.focus() }}
                          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>
                          ×
                        </button>
                      )}

                      {/* Dropdown de resultados */}
                      {showDropdown && (
                        <div onMouseDown={e => e.preventDefault()} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                          {prodResults.length > 0 ? (
                            <div ref={dropdownRef} style={{ maxHeight: 320, overflowY: 'auto' }}>
                              {prodResults.map((p, idx) => (
                                <div key={p.id} className={`pdv-dd-item${idx === dropdownIndex ? ' selected' : ''}`}
                                  onMouseDown={() => adicionarProduto(p)}
                                  onMouseEnter={() => setDropdownIndex(idx)}
                                  style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f8fafc', transition: 'background 0.1s', background: idx === dropdownIndex ? '#eff6ff' : '#fff' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</p>
                                    <p style={{ fontSize: 11, color: '#94a3b8' }}>Estoque: {p.estoque_atual ?? '—'} · {p.categoria ?? 'Sem categoria'}</p>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                    <p style={{ fontSize: 14, fontWeight: 700, color: '#2563eb' }}>{formatMoeda(p.preco_venda)}</p>
                                    <p style={{ fontSize: 10, color: '#94a3b8' }}>← Enter</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div>
                              <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                                Nenhum resultado para &quot;{searchProd}&quot;
                              </div>
                              {!showQuickAdd ? (
                                <div onMouseDown={() => setShowQuickAdd(true)}
                                  style={{ padding: '11px 14px', cursor: 'pointer', fontSize: 13, color: '#059669', fontWeight: 500, background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  ➕ Cadastrar &quot;{searchProd}&quot; como novo produto
                                </div>
                              ) : (
                                <div style={{ padding: '12px 14px', background: '#f0fdf4' }}>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>Novo produto: <span style={{ color: '#0f172a' }}>{searchProd}</span></p>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                      <label htmlFor="qa-preco" style={{ ...lbl, marginBottom: 2 }}>Preço de venda (R$) *</label>
                                      <input id="qa-preco" ref={el => { if (el && showQuickAdd) setTimeout(() => el.focus(), 0) }} type="number" step="0.01" min="0" value={qaPreco} onChange={e => setQaPreco(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && salvarQuickAdd()}
                                        placeholder="0,00" style={{ ...inp, padding: '6px 10px', fontSize: 13 }} />
                                    </div>
                                    <button onClick={salvarQuickAdd} disabled={qaSaving || !qaPreco}
                                      style={{ marginTop: 16, padding: '7px 14px', background: !qaPreco ? '#e2e8f0' : '#059669', color: !qaPreco ? '#94a3b8' : '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: !qaPreco ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                                      {qaSaving ? '...' : '✓ Salvar'}
                                    </button>
                                    <button onClick={() => { setShowQuickAdd(false); setQaPreco('') }}
                                      style={{ marginTop: 16, padding: '7px 10px', background: 'none', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>✕</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Grid mais vendidos */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                    {vendaOk && ultimaVenda && (
                      <div style={{ marginBottom: 16, padding: '14px 18px', background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>✅ Venda #{ultimaVenda.numero} finalizada!</p>
                          {ultimaVenda.troco > 0 && <p style={{ fontSize: 14, fontWeight: 700, color: '#065f46', marginTop: 2 }}>Troco: {formatMoeda(ultimaVenda.troco)}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={imprimir} style={{ padding: '7px 14px', border: '1px solid #86efac', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#065f46', fontWeight: 500 }}>🖨 Imprimir</button>
                          <button onClick={novaVenda} style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#374151' }}>Nova venda</button>
                        </div>
                      </div>
                    )}
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>⭐ Mais vendidos (30 dias)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                      {maisVendidos.map(p => {
                        const qtd = itens.find(i => i.produto_id === p.id)?.quantidade ?? 0
                        const semEstoque = p.estoque_atual === 0
                        return (
                          <button key={p.id} className={semEstoque ? '' : 'pdv-card-btn'} onClick={() => !semEstoque && adicionarProduto(p)} disabled={semEstoque}
                            style={{ padding: '14px 10px', borderRadius: 12, border: `2px solid ${qtd > 0 ? '#60a5fa' : '#e2e8f0'}`, background: qtd > 0 ? '#dbeafe' : semEstoque ? '#f8fafc' : '#fff', cursor: semEstoque ? 'not-allowed' : 'pointer', textAlign: 'center', opacity: semEstoque ? 0.5 : 1, transition: 'all 0.12s' }}>
                            <div style={{ fontSize: 26, marginBottom: 6 }}>{CATEGORIA_ICONES[p.categoria ?? ''] ?? '📦'}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: qtd > 0 ? '#1d4ed8' : '#0f172a', marginBottom: 4, lineHeight: 1.3, wordBreak: 'break-word' }}>{p.nome.length > 26 ? p.nome.slice(0, 24) + '…' : p.nome}</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#2563eb' }}>{formatMoeda(p.preco_venda)}</div>
                            {qtd > 0 && <div style={{ fontSize: 10, color: '#2563eb', marginTop: 3, fontWeight: 600 }}>× {qtd} no carrinho</div>}
                            {semEstoque && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3 }}>Sem estoque</div>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Coluna direita: carrinho */}
                <div style={{ width: 320, minWidth: 280, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Carrinho {itens.length > 0 && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 6px', marginLeft: 4 }}>{itens.length}</span>}
                    </p>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                    {itens.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '50px 10px', color: '#94a3b8' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🛒</div>
                        <p style={{ fontSize: 13 }}>Busque ou clique em um produto</p>
                      </div>
                    ) : itens.map((item, i) => (
                      <div key={i} className="pdv-item-row" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '9px 11px', marginBottom: 7, position: 'relative' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {item.produto_id
                              ? <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descricao}</p>
                              : <input style={{ ...inp, fontSize: 12, marginBottom: 5, padding: '5px 8px' }} value={item.descricao} onChange={e => atualizarItem(i, 'descricao', e.target.value)} placeholder="Descrição..." />}
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                              <button onClick={() => atualizarItem(i, 'quantidade', Math.max(1, item.quantidade - 1))}
                                style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 18, textAlign: 'center' }}>{item.quantidade}</span>
                              <button onClick={() => atualizarItem(i, 'quantidade', item.quantidade + 1)}
                                style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                              <span style={{ color: '#cbd5e1', fontSize: 11 }}>×</span>
                              <input type="number" step="0.01" value={item.preco_unit} onChange={e => atualizarItem(i, 'preco_unit', parseFloat(e.target.value) || 0)}
                                style={{ width: 64, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{formatMoeda(item.subtotal)}</span>
                            </div>
                          </div>
                          <button className="pdv-remove-btn" onClick={() => removerItem(i)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 17, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Rodapé do carrinho */}
                  <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 14px', background: '#fafafa', flexShrink: 0 }}>
                    {/* Desconto */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Desconto (R$)</span>
                      <input type="number" value={desconto || ''} onChange={e => setDesconto(parseFloat(e.target.value) || 0)}
                        placeholder="0" style={{ width: 80, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, textAlign: 'right', outline: 'none', fontFamily: 'inherit' }} />
                    </div>
                    {/* Total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Total</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{formatMoeda(baseTotal)}</span>
                    </div>
                    {/* Obs */}
                    <input style={{ ...inp, fontSize: 12, padding: '7px 10px', marginBottom: 10 }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações (opcional)..." />
                    {/* Botão ir para pagamento */}
                    <button onClick={() => setEtapa('pagamento')} disabled={itens.length === 0}
                      style={{ width: '100%', padding: '13px', background: itens.length === 0 ? '#e2e8f0' : '#2563eb', color: itens.length === 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: itens.length === 0 ? 'not-allowed' : 'pointer', letterSpacing: '0.01em' }}>
                      {itens.length === 0 ? 'Adicione itens ao carrinho' : `Ir para pagamento → (F6)`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 2 — PAGAMENTO */}
            {etapa === 'pagamento' && (
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

                {/* Esquerda: resumo do pedido */}
                <div style={{ width: 340, minWidth: 300, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setEtapa('produtos')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 20, padding: 0, lineHeight: 1 }}>←</button>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resumo do pedido</p>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                    {itens.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, marginBottom: 5 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descricao}</p>
                          <p style={{ fontSize: 11, color: '#94a3b8' }}>× {item.quantidade} · {formatMoeda(item.preco_unit)}</p>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', flexShrink: 0, marginLeft: 8 }}>{formatMoeda(item.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 14px', flexShrink: 0 }}>
                    {desconto > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 5 }}>
                        <span>Desconto</span><span style={{ color: '#065f46' }}>− {formatMoeda(desconto)}</span>
                      </div>
                    )}
                    {taxaFormaAtual > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#92400e', marginBottom: 5 }}>
                        <span>Taxa ({FORMAS.find(f => f.key === formaPag)?.label}{formaPag === 'credito_parcela' ? ` ${numParcelas}x` : ''})</span>
                        <span>+ {formatMoeda(taxaFormaAtual)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Total a cobrar</span>
                      <span style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{formatMoeda(total)}</span>
                    </div>
                  </div>
                </div>

                {/* Direita: formas de pagamento */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* Grid formas de pagamento */}
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Forma de pagamento</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                      {FORMAS.map(f => (
                        <button key={f.key} className="pdv-forma-btn" onClick={() => setFormaPag(f.key)}
                          style={{ padding: '16px 8px', borderRadius: 12, border: `2px solid ${formaPag === f.key ? f.cor : '#e2e8f0'}`, background: formaPag === f.key ? f.cor + '12' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.12s' }}>
                          <div style={{ fontSize: 24, marginBottom: 6 }}>{f.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: formaPag === f.key ? f.cor : '#374151' }}>{f.label}</div>
                        </button>
                      ))}
                    </div>

                    {/* Parcelas */}
                    {formaPag === 'credito_parcela' && (
                      <div style={{ padding: '14px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>Parcelas:</span>
                          <select value={numParcelas} onChange={e => setNumParcelas(parseInt(e.target.value))}
                            style={{ padding: '5px 10px', border: '1px solid #fde68a', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none', fontFamily: 'inherit' }}>
                            {Array.from({ length: maxParcelasConfig - 1 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}x</option>)}
                          </select>
                          {faltaPagar > 0 && (
                            <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                              = R$ {(faltaPagar / numParcelas).toFixed(2).replace('.', ',')} cada
                            </span>
                          )}
                        </div>
                        {taxaFormaAtual > 0 && (
                          <p style={{ fontSize: 12, color: '#b45309' }}>Acréscimo efetivo: {taxaEfetivaAtual}% = +{formatMoeda(taxaFormaAtual)}</p>
                        )}
                      </div>
                    )}

                    {/* Valor recebido + troco rápido para dinheiro */}
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Valor recebido</p>

                    {formaPag === 'dinheiro' && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        {TROCO_RAPIDO.map(v => (
                          <button key={v} onClick={() => setValorPag(String(v))}
                            style={{ padding: '7px 14px', background: valorPag === String(v) ? '#2563eb' : '#f1f5f9', color: valorPag === String(v) ? '#fff' : '#374151', border: `1px solid ${valorPag === String(v) ? '#2563eb' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                            R${v}
                          </button>
                        ))}
                        <button onClick={() => setValorPag(faltaPagar.toFixed(2))}
                          style={{ padding: '7px 14px', background: valorPag === faltaPagar.toFixed(2) ? '#2563eb' : '#f0fdf4', color: valorPag === faltaPagar.toFixed(2) ? '#fff' : '#065f46', border: `1px solid ${valorPag === faltaPagar.toFixed(2) ? '#2563eb' : '#86efac'}`, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                          Exato
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      <input type="number" step="0.01" value={valorPag} onChange={e => setValorPag(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && adicionarPagamento()}
                        placeholder={faltaPagar > 0 ? faltaPagar.toFixed(2) : '0,00'}
                        style={{ ...inp, flex: 1, fontSize: 15, padding: '10px 12px' }} />
                      <button onClick={adicionarPagamento}
                        style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+</button>
                    </div>

                    {/* Pagamentos adicionados */}
                    {pagamentos.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                        <div>
                          <span style={{ color: '#2563eb', fontWeight: 500 }}>{FORMAS.find(f => f.key === p.forma)?.label ?? p.forma}</span>
                          {p.parcelas && p.valor_parcela && <span style={{ color: '#92400e', fontSize: 11, marginLeft: 6 }}>{p.parcelas}x R$ {p.valor_parcela.toFixed(2).replace('.', ',')}</span>}
                          {p.taxa_aplicada != null && p.taxa_aplicada > 0 && <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>+{p.taxa_aplicada}%</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600 }}>{formatMoeda(p.valor)}</span>
                          <button onClick={() => setPagamentos(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                        </div>
                      </div>
                    ))}

                    {pagamentos.length > 0 && faltaPagar > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13, color: '#991b1b', fontWeight: 600, marginBottom: 8 }}>
                        <span>Falta</span><span>{formatMoeda(faltaPagar)}</span>
                      </div>
                    )}
                    {troco > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 10, fontSize: 15, color: '#065f46', fontWeight: 700, marginBottom: 8 }}>
                        <span>💵 Troco</span><span>{formatMoeda(troco)}</span>
                      </div>
                    )}
                  </div>

                  {/* Botão de finalizar (fixo na base) */}
                  <div style={{ padding: '16px 24px', background: '#fff', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                    {formaPag === 'pix' ? (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={criarPixPresencialPdv} disabled={salvando || pixCriando}
                          style={{ flex: 2, padding: '14px', background: salvando || pixCriando ? '#e2e8f0' : '#2563eb', color: salvando || pixCriando ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: salvando || pixCriando ? 'not-allowed' : 'pointer' }}>
                          {pixCriando ? 'Gerando PIX...' : `📱 Gerar QR PIX · ${formatMoeda(total)}`}
                        </button>
                        <button onClick={criarPixRemotoPdv} disabled={salvando || pixCriando}
                          style={{ flex: 1, padding: '14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: salvando || pixCriando ? 'not-allowed' : 'pointer' }}>
                          📲 Remoto
                        </button>
                      </div>
                    ) : (
                      <button onClick={finalizarVenda} disabled={salvando || faltaPagar > 0.01}
                        style={{ width: '100%', padding: '15px', background: salvando || faltaPagar > 0.01 ? '#e2e8f0' : '#16a34a', color: salvando || faltaPagar > 0.01 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: salvando || faltaPagar > 0.01 ? 'not-allowed' : 'pointer', letterSpacing: '0.01em' }}>
                        {salvando ? 'Finalizando...' : faltaPagar > 0.01 ? `Falta ${formatMoeda(faltaPagar)}` : `✓ Finalizar venda · ${formatMoeda(total)} (F6)`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════ TELA CAIXA ═══════════════ */}
        {tela === 'caixa' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ maxWidth: 620 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
                {[{ label: 'Entradas', value: formatMoeda(caixaHoje?.entradas ?? 0), color: '#065f46', bg: '#ecfdf5' }, { label: 'Saídas', value: formatMoeda(caixaHoje?.saidas ?? 0), color: '#991b1b', bg: '#fef2f2' }].map(m => (
                  <div key={m.label} style={{ background: m.bg, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</p>
                    <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.label}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 16 }}>
                {[
                  { acao: 'abertura' as const,  label: '🔓 Abrir caixa',   disabled: caixaAberta || caixaFechada },
                  { acao: 'fechamento' as const, label: '🔒 Fechar caixa',  disabled: !caixaAberta },
                  { acao: 'sangria' as const,    label: '💸 Sangria',        disabled: !caixaAberta },
                  { acao: 'suprimento' as const, label: '💵 Suprimento',     disabled: !caixaAberta },
                ].map(b => (
                  <button key={b.acao} disabled={b.disabled} onClick={() => { setCaixaAcao(b.acao); setCaixaValor(''); setCaixaObs(''); setShowCaixaModal(true) }}
                    style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: b.disabled ? 'not-allowed' : 'pointer', background: b.disabled ? '#f8fafc' : '#fff', color: b.disabled ? '#94a3b8' : '#374151', opacity: b.disabled ? 0.5 : 1 }}>{b.label}</button>
                ))}
              </div>
              {caixaFechada && (
                <button onClick={() => { setCaixaAcao('reabertura'); setCaixaValor(''); setCaixaObs(''); setShowCaixaModal(true) }}
                  style={{ width: '100%', padding: '11px', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#fffbeb', color: '#92400e', marginBottom: 16 }}>
                  🔄 Reabrir caixa (novo período)
                </button>
              )}
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

        {/* ═══════════════ TELA HISTÓRICO ═══════════════ */}
        {tela === 'historico' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <HistoricoCaixa supabase={supabase} />
          </div>
        )}
      </div>

      {/* Modal PIX remoto */}
      {pixModal && (
        <ModalPixRemoto
          cobrancaId={pixModal.cobrancaId} pixCopiaCola={pixModal.pixCopiaCola}
          valor={pixModal.valor} expiraEm={pixModal.expiraEm} temTelefone={pixModal.temTelefone}
          onClose={() => setPixModal(null)}
          onPago={() => { setVendaOk(true); setUltimaVenda({ numero: 0, total, troco: 0 }); setPixModal(null) }}
        />
      )}

      {/* Modal caixa */}
      {showCaixaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 360, padding: '24px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
              {caixaAcao === 'abertura' ? '🔓 Abrir caixa' : caixaAcao === 'fechamento' ? '🔒 Fechar caixa' : caixaAcao === 'reabertura' ? '🔄 Reabrir caixa' : caixaAcao === 'sangria' ? '💸 Sangria' : '💵 Suprimento'}
            </h3>
            {(caixaAcao === 'abertura' || caixaAcao === 'reabertura') && <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Informe o saldo físico contado na gaveta.</p>}
            {caixaAcao === 'fechamento' && <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Informe o saldo físico contado na gaveta agora.</p>}
            <div style={{ marginBottom: 12 }}><label htmlFor="caixa-valor" style={lbl}>Valor declarado (R$) *</label><input id="caixa-valor" style={inp} type="number" step="0.01" min="0" value={caixaValor} onChange={e => setCaixaValor(e.target.value)} placeholder="0,00" autoFocus /></div>
            <div style={{ marginBottom: 16 }}><label htmlFor="caixa-obs" style={lbl}>Observações</label><input id="caixa-obs" style={inp} value={caixaObs} onChange={e => setCaixaObs(e.target.value)} placeholder="Opcional..." /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCaixaModal(false)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarCaixa} disabled={salvandoCaixa || !caixaValor}
                style={{ flex: 2, padding: '9px', background: !caixaValor ? '#e2e8f0' : '#2563eb', color: !caixaValor ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: !caixaValor ? 'not-allowed' : 'pointer' }}>
                {salvandoCaixa ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

function HotKey({ k, label }: { k: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
      <kbd style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'inherit', color: '#374151', fontWeight: 600 }}>{k}</kbd>
      <span>{label}</span>
    </span>
  )
}

function HistoricoCaixa({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [loading, setLoading] = useState(true)
  const [periodos, setPeriodos] = useState<{ data: string; abertura: MCx | null; fechamento: MCx | null; totalVendas: number; sangrias: number; suprimentos: number }[]>([])
  type MCx = { id: string; tipo: string; valor: number; forma: string | null; observacoes: string | null; created_at: string; data_ref: string }
  function fmt(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

  useEffect(() => {
    async function load() {
      const { data: movs } = await supabase.from('caixa_movimentos').select('*').order('created_at', { ascending: false }).limit(200)
      if (!movs) { setLoading(false); return }
      const porData: Record<string, MCx[]> = {}
      movs.forEach((m: MCx) => { const d = m.data_ref ?? m.created_at?.split('T')[0]; if (d) { porData[d] = porData[d] ?? []; porData[d].push(m) } })
      setPeriodos(Object.entries(porData).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([data, lista]) => ({
        data, abertura: lista.find(m => m.tipo === 'abertura') ?? null, fechamento: lista.find(m => m.tipo === 'fechamento') ?? null,
        totalVendas: lista.filter(m => m.tipo === 'venda').reduce((s, m) => s + Number(m.valor), 0),
        sangrias: lista.filter(m => m.tipo === 'sangria').reduce((s, m) => s + Number(m.valor), 0),
        suprimentos: lista.filter(m => m.tipo === 'suprimento').reduce((s, m) => s + Number(m.valor), 0),
      })))
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Carregando...</div>
  if (periodos.length === 0) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Nenhum movimento registrado.</div>

  return (
    <div style={{ maxWidth: 700 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>📋 Histórico de Caixa</p>
      {periodos.map(p => {
        const ab = p.abertura ? Number(p.abertura.valor) : 0
        const fc = p.fechamento ? Number(p.fechamento.valor) : null
        const esperado = ab + p.totalVendas + p.suprimentos - p.sangrias
        const diff = fc !== null ? fc - esperado : null
        return (
          <div key={p.data} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
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
                { label: 'Abertura', value: fmt(ab), color: '#374151' },
                { label: 'Vendas', value: fmt(p.totalVendas), color: '#065f46' },
                { label: 'Fechamento', value: fc !== null ? fmt(fc) : '—', color: '#374151' },
                { label: 'Diferença', value: diff !== null ? fmt(diff) : '—', color: diff === null ? '#94a3b8' : diff > 0 ? '#065f46' : diff < 0 ? '#991b1b' : '#374151' },
              ].map(c => (
                <div key={c.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.value}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
                </div>
              ))}
            </div>
            {(p.sangrias > 0 || p.suprimentos > 0) && (
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: '#64748b' }}>
                {p.sangrias > 0 && <span>💸 Sangria: {fmt(p.sangrias)}</span>}
                {p.suprimentos > 0 && <span>💵 Suprimento: {fmt(p.suprimentos)}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
