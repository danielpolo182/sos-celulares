'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Produto = {
  id: string; nome: string; categoria: string | null
  qualidade: string; preco_venda: number; custo_medio: number
  estoque_atual: number
}

type ItemVenda = {
  produto_id: string | null; descricao: string
  quantidade: number; preco_unit: number; custo_unit: number; subtotal: number
}

type Pagamento = { forma: 'dinheiro' | 'pix' | 'credito' | 'debito'; valor: number }

type MovimentoCaixa = {
  id: string; tipo: string; valor: number
  forma: string | null; observacoes: string | null; created_at: string
}

type CaixaHoje = {
  saldo_atual: number; entradas: number; saidas: number
  valor_abertura: number; total_vendas: number
  aberto_em: string | null; fechado_em: string | null
}

type ModoPDV = 'padrao' | 'touch' | 'visual'

const FORMAS: { key: 'dinheiro' | 'pix' | 'credito' | 'debito'; label: string; icon: string; cor: string }[] = [
  { key: 'dinheiro', label: 'Dinheiro', icon: '💵', cor: '#16a34a' },
  { key: 'pix',      label: 'PIX',      icon: '📱', cor: '#6366f1' },
  { key: 'credito',  label: 'Crédito',  icon: '💳', cor: '#0ea5e9' },
  { key: 'debito',   label: 'Débito',   icon: '💳', cor: '#8b5cf6' },
]

const CATEGORIA_ICONES: Record<string, string> = {
  'Display / Tela': '🖥', 'Bateria': '🔋', 'Conector de carga': '⚡',
  'Câmera': '📷', 'Alto-falante': '🔊', 'Outros': '📦',
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }

function formatMoeda(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

export default function PDVPage() {
  const supabase = createClient()
  const [modo, setModo] = useState<ModoPDV>('padrao')
  const [aba, setAba] = useState<'venda' | 'caixa' | 'historico'>('venda')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [searchProd, setSearchProd] = useState('')
  const [prodResults, setProdResults] = useState<Produto[]>([])
  const [itens, setItens] = useState<ItemVenda[]>([])
  const [desconto, setDesconto] = useState(0)
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [formaPag, setFormaPag] = useState<'dinheiro' | 'pix' | 'credito' | 'debito'>('dinheiro')
  const [valorPag, setValorPag] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [vendaOk, setVendaOk] = useState(false)
  const [ultimaVenda, setUltimaVenda] = useState<{ numero: number; total: number; troco: number } | null>(null)
  const [caixaHoje, setCaixaHoje] = useState<CaixaHoje | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [showCaixaModal, setShowCaixaModal] = useState(false)
  const [caixaAcao, setCaixaAcao] = useState<'abertura' | 'fechamento' | 'sangria' | 'suprimento'>('abertura')
  const [caixaValor, setCaixaValor] = useState('')
  const [caixaObs, setCaixaObs] = useState('')
  const [salvandoCaixa, setSalvandoCaixa] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const subtotal = itens.reduce((s, i) => s + i.subtotal, 0)
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0)
  const total = Math.max(0, subtotal - desconto)
  const troco = totalPago > total ? totalPago - total : 0
  const faltaPagar = Math.max(0, total - totalPago)

  const fetchProdutos = useCallback(async () => {
    const { data } = await supabase.from('produtos').select('*').is('deleted_at', null).eq('ativo', true).order('nome')
    setProdutos((data ?? []) as Produto[])
  }, [supabase])

  const fetchCaixa = useCallback(async () => {
    const hoje = new Date().toISOString().split('T')[0]
    const { data: caixa } = await supabase.from('vw_caixa_hoje').select('*').eq('data_ref', hoje).single()
    setCaixaHoje(caixa as CaixaHoje | null)
    const { data: movs } = await supabase.from('caixa_movimentos').select('*').eq('data_ref', hoje).order('created_at', { ascending: false })
    setMovimentos((movs ?? []) as MovimentoCaixa[])
  }, [supabase])

  // Carregar modo salvo nas configs
  useEffect(() => {
    fetchProdutos()
    fetchCaixa()
    supabase.from('sistema_config').select('valor').eq('chave', 'pdv_modo_visualizacao').single()
      .then(({ data }) => { if (data) setModo(data.valor as ModoPDV) })
  }, [fetchProdutos, fetchCaixa, supabase])

  function buscarProduto(q: string) {
    setSearchProd(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      if (!q.trim()) { setProdResults([]); return }
      setProdResults(produtos.filter(p => p.nome.toLowerCase().includes(q.toLowerCase())).slice(0, 8))
    }, 200)
  }

  function adicionarProduto(p: Produto) {
    const exist = itens.findIndex(i => i.produto_id === p.id)
    if (exist >= 0) {
      const novo = [...itens]; novo[exist].quantidade++; novo[exist].subtotal = novo[exist].quantidade * novo[exist].preco_unit; setItens(novo)
    } else {
      setItens(prev => [...prev, { produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unit: p.preco_venda, custo_unit: p.custo_medio, subtotal: p.preco_venda }])
    }
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

  function adicionarPagamento() {
    const v = parseFloat(valorPag); if (!v || v <= 0) return
    setPagamentos(prev => [...prev, { forma: formaPag, valor: v }]); setValorPag('')
  }

  async function finalizarVenda() {
    if (itens.length === 0 || faltaPagar > 0.01) return
    setSalvando(true)
    const { data: venda } = await supabase.from('vendas').insert({
      status: 'finalizada', tipo: 'pdv', subtotal, desconto, total,
      valor_recebido: totalPago, troco,
      pagamentos: pagamentos,
      forma_pagamento: pagamentos.length === 1 ? pagamentos[0].forma : 'misto',
      pago: true, observacoes: obs || null,
    }).select('id, numero').single()

    if (venda) {
      await supabase.from('venda_itens').insert(itens.map(i => ({ venda_id: venda.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, preco_unit: i.preco_unit })))
      for (const item of itens) {
        if (item.produto_id) {
          const prod = produtos.find(p => p.id === item.produto_id)
          if (prod) await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - item.quantidade) }).eq('id', item.produto_id)
        }
      }
      await supabase.from('caixa_movimentos').insert({ tipo: 'venda', valor: total, forma: pagamentos.length === 1 ? pagamentos[0].forma : 'misto', referencia_id: venda.id, observacoes: `Venda #${venda.numero}` })
      setUltimaVenda({ numero: venda.numero, total, troco })
      setVendaOk(true)
      setItens([]); setPagamentos([]); setDesconto(0); setObs('')
      fetchProdutos(); fetchCaixa()
    }
    setSalvando(false)
  }

  async function salvarCaixa() {
    const v = parseFloat(caixaValor); if (!v) return
    setSalvandoCaixa(true)
    await supabase.from('caixa_movimentos').insert({ tipo: caixaAcao, valor: v, forma: 'dinheiro', observacoes: caixaObs || null })
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

  const caixaAberta = caixaHoje?.aberto_em && !caixaHoje?.fechado_em

  // ── PAINEL DIREITO (resumo + pagamento) — igual nos 3 modos
  const painelDireito = (
    <div style={{ width: modo === 'visual' ? '100%' : 320, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: modo === 'visual' ? 'none' : '1px solid #e2e8f0', overflow: 'hidden' }}>
      {vendaOk && ultimaVenda && (
        <div style={{ padding: '14px 16px', background: '#ecfdf5', borderBottom: '1px solid #bbf7d0' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>✅ Venda #{ultimaVenda.numero} finalizada!</p>
          {ultimaVenda.troco > 0 && <p style={{ fontSize: 15, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>Troco: {formatMoeda(ultimaVenda.troco)}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={imprimir} style={{ flex: 1, padding: '7px', border: '1px solid #86efac', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#065f46', fontWeight: 500 }}>🖨 Imprimir</button>
            <button onClick={() => setVendaOk(false)} style={{ flex: 1, padding: '7px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#374151' }}>Nova venda</button>
          </div>
        </div>
      )}

      {/* Resumo */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Resumo</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: '#64748b' }}>Subtotal ({itens.length} itens)</span>
          <span style={{ fontWeight: 500 }}>{formatMoeda(subtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: '#64748b' }}>Desconto (R$)</span>
          <input type="number" value={desconto || ''} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} placeholder="0"
            style={{ width: 80, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, color: '#6366f1', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>Total</span>
          <span>{formatMoeda(total)}</span>
        </div>
      </div>

      {/* Pagamento */}
      <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Pagamento</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
          {FORMAS.map(f => (
            <button key={f.key} onClick={() => setFormaPag(f.key)} style={{ padding: '10px 4px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 11, fontWeight: 500, textAlign: 'center', background: formaPag === f.key ? f.cor + '15' : '#f8fafc', color: formaPag === f.key ? f.cor : '#64748b', borderColor: formaPag === f.key ? f.cor + '80' : '#e2e8f0' }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{f.icon}</div>
              <div>{f.label}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input type="number" step="0.01" value={valorPag} onChange={e => setValorPag(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarPagamento()}
            placeholder={faltaPagar > 0 ? faltaPagar.toFixed(2) : '0,00'} style={{ ...inp, flex: 1 }} />
          <button onClick={adicionarPagamento} style={{ padding: '9px 14px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>+</button>
        </div>
        {pagamentos.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8f7ff', border: '1px solid #e0e7ff', borderRadius: 7, marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: '#4338ca', fontWeight: 500, textTransform: 'capitalize' }}>{p.forma}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{formatMoeda(p.valor)}</span>
              <button onClick={() => setPagamentos(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          </div>
        ))}
        {pagamentos.length > 0 && (
          <div style={{ padding: '10px', background: '#f8fafc', borderRadius: 8, fontSize: 13, marginTop: 6 }}>
            {faltaPagar > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#991b1b', fontWeight: 600 }}><span>Falta</span><span>{formatMoeda(faltaPagar)}</span></div>}
            {troco > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#065f46', fontWeight: 700, fontSize: 15 }}><span>Troco</span><span>{formatMoeda(troco)}</span></div>}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <label style={lbl}>Observações</label>
          <input style={inp} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional..." />
        </div>
      </div>

      {/* Botão finalizar */}
      <div style={{ padding: '14px 16px' }}>
        <button onClick={finalizarVenda} disabled={salvando || itens.length === 0 || faltaPagar > 0.01} style={{ width: '100%', padding: '14px', background: salvando || itens.length === 0 || faltaPagar > 0.01 ? '#e2e8f0' : '#6366f1', color: salvando || itens.length === 0 || faltaPagar > 0.01 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: salvando || itens.length === 0 || faltaPagar > 0.01 ? 'not-allowed' : 'pointer' }}>
          {salvando ? 'Finalizando...' : itens.length === 0 ? 'Adicione itens' : faltaPagar > 0.01 ? `Falta ${formatMoeda(faltaPagar)}` : `✓ Finalizar · ${formatMoeda(total)}`}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--font-sans)', background: '#f8fafc', overflow: 'hidden' }}>

      {/* Seletor de modo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, marginRight: 'auto' }}>
          {([['venda', '🛒 Venda'], ['caixa', '💰 Caixa'], ['historico', '📋 Histórico']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: aba === k ? '#eef2ff' : 'transparent', cursor: 'pointer', color: aba === k ? '#6366f1' : '#64748b', borderRadius: 7 }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['padrao', '⊞ Padrão'], ['touch', '👆 Touch'], ['visual', '🎨 Visual']] as const).map(([m, l]) => (
            <button key={m} onClick={() => setModo(m)} style={{ padding: '7px 12px', fontSize: 12, fontWeight: modo === m ? 600 : 400, border: '1px solid', cursor: 'pointer', borderRadius: 7, background: modo === m ? '#e0e7ff' : '#fff', color: modo === m ? '#3730a3' : '#64748b', borderColor: modo === m ? '#818cf8' : '#e2e8f0' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── MODO PADRÃO */}
        {aba === 'venda' && modo === 'padrao' && (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inp, paddingLeft: 36 }} placeholder="Buscar produto..." value={searchProd} onChange={e => buscarProduto(e.target.value)} autoComplete="off" />
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#94a3b8' }}>🔍</span>
                  {prodResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 4, overflow: 'hidden' }}>
                      {prodResults.map(p => (
                        <div key={p.id} onClick={() => adicionarProduto(p)} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                          <div><p style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</p><p style={{ fontSize: 11, color: '#94a3b8' }}>Estoque: {p.estoque_atual}</p></div>
                          <p style={{ fontWeight: 600, color: '#6366f1' }}>{formatMoeda(p.preco_venda)}</p>
                        </div>
                      ))}
                      <div onClick={adicionarAvulso} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: '#6366f1', fontWeight: 500, background: '#f8f7ff' }}>+ Item avulso</div>
                    </div>
                  )}
                </div>
                <button onClick={adicionarAvulso} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0' }}>+ Item avulso</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                {itens.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}><div style={{ fontSize: 36, marginBottom: 10 }}>🛒</div><p>Busque um produto para começar</p></div>
                ) : itens.map((item, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        {item.produto_id ? <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 6 }}>{item.descricao}</p> : <input style={{ ...inp, marginBottom: 6 }} value={item.descricao} onChange={e => atualizarItem(i, 'descricao', e.target.value)} placeholder="Descrição..." />}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}><label style={lbl}>Qtd</label><input style={inp} type="number" min="1" value={item.quantidade} onChange={e => atualizarItem(i, 'quantidade', parseInt(e.target.value) || 1)} /></div>
                          <div style={{ flex: 2 }}><label style={lbl}>Preço (R$)</label><input style={inp} type="number" step="0.01" value={item.preco_unit} onChange={e => atualizarItem(i, 'preco_unit', parseFloat(e.target.value) || 0)} /></div>
                          <div style={{ flex: 2, paddingTop: 16 }}><p style={{ fontSize: 14, fontWeight: 600, color: '#6366f1' }}>{formatMoeda(item.subtotal)}</p></div>
                        </div>
                      </div>
                      <button onClick={() => removerItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, padding: 0, flexShrink: 0 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {painelDireito}
          </>
        )}

        {/* ── MODO TOUCH (botões grandes para tablet) */}
        {aba === 'venda' && modo === 'touch' && (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                <input style={{ ...inp, fontSize: 16, padding: '12px 16px' }} placeholder="🔍 Buscar produto..." value={searchProd} onChange={e => buscarProduto(e.target.value)} autoComplete="off" />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
                {/* Grid de produtos para touch */}
                {!searchProd && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                    {produtos.slice(0, 20).map(p => (
                      <button key={p.id} onClick={() => adicionarProduto(p)} disabled={p.estoque_atual === 0} style={{
                        padding: '16px 10px', borderRadius: 12, border: '1px solid #e2e8f0',
                        background: p.estoque_atual === 0 ? '#f8fafc' : '#fff', cursor: p.estoque_atual === 0 ? 'not-allowed' : 'pointer',
                        textAlign: 'center', opacity: p.estoque_atual === 0 ? 0.5 : 1,
                      }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>{CATEGORIA_ICONES[p.categoria ?? ''] ?? '📦'}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a', marginBottom: 4, lineHeight: 1.3 }}>{p.nome.length > 30 ? p.nome.slice(0, 28) + '…' : p.nome}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#6366f1' }}>{formatMoeda(p.preco_venda)}</div>
                        <div style={{ fontSize: 10, color: p.estoque_atual === 0 ? '#ef4444' : '#94a3b8', marginTop: 2 }}>{p.estoque_atual === 0 ? 'Sem estoque' : `${p.estoque_atual} un`}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Resultados da busca */}
                {searchProd && prodResults.map(p => (
                  <div key={p.id} onClick={() => adicionarProduto(p)} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><p style={{ fontSize: 15, fontWeight: 500, color: '#0f172a' }}>{p.nome}</p><p style={{ fontSize: 12, color: '#94a3b8' }}>Estoque: {p.estoque_atual}</p></div>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#6366f1' }}>{formatMoeda(p.preco_venda)}</p>
                  </div>
                ))}

                {/* Itens adicionados */}
                {itens.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Itens ({itens.length})</p>
                    {itens.map((item, i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{item.descricao || 'Item avulso'}</p>
                          <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center' }}>
                            <button onClick={() => atualizarItem(i, 'quantidade', Math.max(1, item.quantidade - 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                            <span style={{ fontSize: 15, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{item.quantidade}</span>
                            <button onClick={() => atualizarItem(i, 'quantidade', item.quantidade + 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 16, fontWeight: 700, color: '#6366f1' }}>{formatMoeda(item.subtotal)}</p>
                          <button onClick={() => removerItem(i)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>Remover</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {painelDireito}
          </>
        )}

        {/* ── MODO VISUAL (tela cheia, checkout embaixo) */}
        {aba === 'venda' && modo === 'visual' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Produtos em grade grande */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#f8fafc' }}>
              <div style={{ marginBottom: 14 }}>
                <input style={{ ...inp, fontSize: 15, padding: '12px 16px', borderRadius: 10 }} placeholder="🔍 Buscar produto..." value={searchProd} onChange={e => buscarProduto(e.target.value)} autoComplete="off" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {(searchProd ? prodResults : produtos.slice(0, 30)).map(p => {
                  const jaAdicionado = itens.find(i => i.produto_id === p.id)
                  return (
                    <button key={p.id} onClick={() => adicionarProduto(p)} disabled={p.estoque_atual === 0} style={{
                      padding: '20px 16px', borderRadius: 14, border: `2px solid ${jaAdicionado ? '#818cf8' : '#e2e8f0'}`,
                      background: jaAdicionado ? '#eef2ff' : p.estoque_atual === 0 ? '#f8fafc' : '#fff',
                      cursor: p.estoque_atual === 0 ? 'not-allowed' : 'pointer', textAlign: 'center',
                      opacity: p.estoque_atual === 0 ? 0.4 : 1, transition: 'all 0.15s',
                    }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>{CATEGORIA_ICONES[p.categoria ?? ''] ?? '📦'}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: jaAdicionado ? '#3730a3' : '#0f172a', marginBottom: 6, lineHeight: 1.4 }}>{p.nome.length > 35 ? p.nome.slice(0, 33) + '…' : p.nome}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: jaAdicionado ? '#4338ca' : '#6366f1' }}>{formatMoeda(p.preco_venda)}</div>
                      {jaAdicionado && <div style={{ fontSize: 11, color: '#4338ca', marginTop: 4, fontWeight: 600 }}>× {jaAdicionado.quantidade} no carrinho</div>}
                      {p.estoque_atual === 0 && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Sem estoque</div>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Checkout fixo na base */}
            {itens.length > 0 && (
              <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{itens.length} produto(s) · Subtotal {formatMoeda(subtotal)}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {FORMAS.map(f => (
                        <button key={f.key} onClick={() => { setFormaPag(f.key); setPagamentos([{ forma: f.key, valor: total }]) }} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: formaPag === f.key ? f.cor + '15' : '#f8fafc', color: formaPag === f.key ? f.cor : '#64748b', borderColor: formaPag === f.key ? f.cor + '80' : '#e2e8f0' }}>
                          {f.icon} {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 12, color: '#64748b' }}>Total</p>
                      <p style={{ fontSize: 28, fontWeight: 800, color: '#6366f1' }}>{formatMoeda(total)}</p>
                    </div>
                    <button onClick={finalizarVenda} disabled={salvando || faltaPagar > 0.01} style={{ padding: '16px 32px', background: salvando || pagamentos.length === 0 ? '#e2e8f0' : '#6366f1', color: salvando || pagamentos.length === 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: salvando || pagamentos.length === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                      {salvando ? 'Finalizando...' : pagamentos.length === 0 ? 'Selecione pagamento' : `✓ Finalizar`}
                    </button>
                    {itens.length > 0 && <button onClick={() => { setItens([]); setPagamentos([]) }} style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, fontSize: 20, cursor: 'pointer', color: '#ef4444' }}>🗑</button>}
                  </div>
                </div>
                {vendaOk && ultimaVenda && (
                  <div style={{ marginTop: 12, background: '#ecfdf5', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46', flex: 1 }}>✅ Venda #{ultimaVenda.numero} · {ultimaVenda.troco > 0 ? `Troco: ${formatMoeda(ultimaVenda.troco)}` : 'Exato'}</p>
                    <button onClick={imprimir} style={{ padding: '6px 12px', border: '1px solid #86efac', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#065f46' }}>🖨 Imprimir</button>
                    <button onClick={() => setVendaOk(false)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#374151' }}>Nova venda</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ABA CAIXA */}
        {aba === 'caixa' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ maxWidth: 600 }}>
              <div style={{ background: caixaAberta ? '#f0fdf4' : '#fef2f2', border: `1px solid ${caixaAberta ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: caixaAberta ? '#065f46' : '#991b1b' }}>{caixaAberta ? '✅ Caixa aberto' : '🔒 Caixa fechado'}</p>
                    {caixaHoje?.aberto_em && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Aberto às {new Date(caixaHoje.aberto_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{formatMoeda(caixaHoje?.saldo_atual ?? 0)}</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>Saldo atual · {caixaHoje?.total_vendas ?? 0} vendas</p>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
                {[
                  { acao: 'abertura' as const, label: '🔓 Abrir caixa', disabled: !!caixaAberta },
                  { acao: 'fechamento' as const, label: '🔒 Fechar caixa', disabled: !caixaAberta },
                  { acao: 'sangria' as const, label: '💸 Sangria', disabled: !caixaAberta },
                  { acao: 'suprimento' as const, label: '💵 Suprimento', disabled: !caixaAberta },
                ].map(b => (
                  <button key={b.acao} disabled={b.disabled} onClick={() => { setCaixaAcao(b.acao); setCaixaValor(''); setCaixaObs(''); setShowCaixaModal(true) }} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: b.disabled ? 'not-allowed' : 'pointer', background: b.disabled ? '#f8fafc' : '#fff', color: b.disabled ? '#94a3b8' : '#374151', opacity: b.disabled ? 0.5 : 1 }}>{b.label}</button>
                ))}
              </div>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Movimentos de hoje</p>
              {movimentos.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                  <div><span style={{ fontWeight: 500, color: '#374151', textTransform: 'capitalize' }}>{m.tipo}</span>{m.observacoes && <span style={{ color: '#94a3b8', marginLeft: 8 }}>{m.observacoes}</span>}</div>
                  <span style={{ fontWeight: 600, color: ['sangria','estorno'].includes(m.tipo) ? '#991b1b' : '#065f46' }}>
                    {['sangria','estorno'].includes(m.tipo) ? '-' : '+'}{formatMoeda(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ABA HISTÓRICO */}
        {aba === 'historico' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <HistoricoVendas supabase={supabase} />
          </div>
        )}
      </div>

      {/* Modal caixa */}
      {showCaixaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 360, padding: '24px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 16, textTransform: 'capitalize' }}>
              {caixaAcao === 'abertura' ? '🔓 Abrir caixa' : caixaAcao === 'fechamento' ? '🔒 Fechar caixa' : caixaAcao === 'sangria' ? '💸 Sangria' : '💵 Suprimento'}
            </h3>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Valor (R$) *</label><input style={inp} type="number" step="0.01" value={caixaValor} onChange={e => setCaixaValor(e.target.value)} placeholder="0,00" autoFocus /></div>
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

function HistoricoVendas({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [vendas, setVendas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('vendas').select('*, venda_itens(*)').eq('status', 'finalizada').eq('tipo', 'pdv').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { setVendas(data ?? []); setLoading(false) })
  }, [supabase])
  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Carregando...</div>
  if (vendas.length === 0) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Nenhuma venda registrada</div>
  return (
    <div style={{ maxWidth: 600 }}>
      {vendas.map(v => (
        <div key={v.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><p style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>Venda #{v.numero}</p><p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(v.created_at).toLocaleString('pt-BR')}</p></div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>R$ {Number(v.total).toFixed(2).replace('.', ',')}</p>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{v.venda_itens?.length ?? 0} itens · {v.forma_pagamento}</p>
        </div>
      ))}
    </div>
  )
}