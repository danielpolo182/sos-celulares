'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Tipos ────────────────────────────────────────────────
type Produto = { id: string; nome: string; categoria: string | null; preco_venda: number; custo_medio: number; estoque_atual: number }
type ItemVenda = { produto_id: string | null; descricao: string; quantidade: number; preco_unit: number; custo_unit: number; subtotal: number }
type Pagamento = { forma: 'dinheiro' | 'pix' | 'credito' | 'debito'; valor: number }
type Caixa = { id: string; numero: number; status: string; valor_abertura: number; aberto_em: string; aberto_por_nome: string; saldo_atual: number; total_entradas: number; total_saidas: number; qtd_vendas: number; turno: string; device_id: string }
type ModoPDV = 'padrao' | 'touch' | 'visual'

// ─── Constantes ───────────────────────────────────────────
const FORMAS = [
  { key: 'dinheiro' as const, label: 'Dinheiro', icon: 'ti-cash',          cor: '#16a34a' },
  { key: 'pix'      as const, label: 'PIX',      icon: 'ti-qrcode',        cor: '#6366f1' },
  { key: 'credito'  as const, label: 'Crédito',  icon: 'ti-credit-card',   cor: '#0ea5e9' },
  { key: 'debito'   as const, label: 'Débito',   icon: 'ti-credit-card',   cor: '#8b5cf6' },
]
const TURNOS = [{ v: 'manha', l: 'Manhã' }, { v: 'tarde', l: 'Tarde' }, { v: 'noite', l: 'Noite' }, { v: 'unico', l: 'Único' }]
const CATEGORIA_ICONES: Record<string, string> = { 'Display / Tela': 'ti-device-laptop', 'Bateria': 'ti-battery', 'Conector de carga': 'ti-plug', 'Câmera': 'ti-camera', 'Alto-falante': 'ti-volume', 'Outros': 'ti-package' }

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
function fm(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

// ─── Device fingerprint (identifica o computador) ─────────
function getDeviceId(): string {
  const key = 'sos_device_id'
  let id = typeof window !== 'undefined' ? localStorage.getItem(key) : null
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    if (typeof window !== 'undefined') localStorage.setItem(key, id)
  }
  return id!
}

// ─── Componente principal ─────────────────────────────────
export default function PDVPage() {
  const supabase = createClient()
  const deviceId = useRef(getDeviceId())

  // Caixa
  const [caixa, setCaixa] = useState<Caixa | null>(null)
  const [checkingCaixa, setCheckingCaixa] = useState(true)
  const [caixaAnterior, setCaixaAnterior] = useState<Caixa | null>(null) // caixa de ontem em aberto
  const [showAbrirCaixa, setShowAbrirCaixa] = useState(false)
  const [showConfirmarEsquecido, setShowConfirmarEsquecido] = useState(false)

  // Form abertura de caixa
  const [aValorAbertura, setAValorAbertura] = useState('')
  const [aTurno, setATurno] = useState<'manha'|'tarde'|'noite'|'unico'>('manha')
  const [aDeviceLabel, setADeviceLabel] = useState('')
  const [abrindoCaixa, setAbrindoCaixa] = useState(false)
  const [erroCaixa, setErroCaixa] = useState('')

  // Configurações
  const [quemAbre, setQuemAbre] = useState('todos')
  const [maxCaixas, setMaxCaixas] = useState(3)
  const [meuPerfil, setMeuPerfil] = useState<{papel: string; nome: string} | null>(null)

  // PDV
  const [modo, setModo] = useState<ModoPDV>('padrao')
  const [aba, setAba] = useState<'venda' | 'caixa' | 'historico'>('venda')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [searchProd, setSearchProd] = useState('')
  const [prodResults, setProdResults] = useState<Produto[]>([])
  const [itens, setItens] = useState<ItemVenda[]>([])
  const [desconto, setDesconto] = useState(0)
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [formaPag, setFormaPag] = useState<'dinheiro'|'pix'|'credito'|'debito'>('dinheiro')
  const [valorPag, setValorPag] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [vendaOk, setVendaOk] = useState(false)
  const [ultimaVenda, setUltimaVenda] = useState<{numero:number;total:number;troco:number}|null>(null)
  const [movimentos, setMovimentos] = useState<any[]>([])
  const [showMovModal, setShowMovModal] = useState(false)
  const [movAcao, setMovAcao] = useState<'sangria'|'suprimento'>('sangria')
  const [movValor, setMovValor] = useState('')
  const [movObs, setMovObs] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const subtotal = itens.reduce((s, i) => s + i.subtotal, 0)
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0)
  const total = Math.max(0, subtotal - desconto)
  const troco = totalPago > total ? totalPago - total : 0
  const faltaPagar = Math.max(0, total - totalPago)

  // ── Verificar caixa deste dispositivo ──────────────────
  const verificarCaixa = useCallback(async () => {
    setCheckingCaixa(true)
    const devId = deviceId.current
    const hoje = new Date().toISOString().split('T')[0]
    const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    // Buscar caixa aberto deste device
    const { data: caixaAberto } = await supabase
      .from('vw_caixa_aberto').select('*').eq('device_id', devId).maybeSingle()
    if (caixaAberto) { setCaixa(caixaAberto as Caixa); setCheckingCaixa(false); return }

    // Verificar se há caixa esquecido de outro dia deste device
    const { data: antigo } = await supabase
      .from('caixas').select('*').eq('device_id', devId).eq('status', 'aberto')
      .lt('data_ref', hoje).maybeSingle()
    if (antigo) { setCaixaAnterior(antigo as Caixa); setShowConfirmarEsquecido(true) }

    setCaixa(null)
    setCheckingCaixa(false)
  }, [supabase])

  const fetchProdutos = useCallback(async () => {
    const { data } = await supabase.from('produtos').select('*').is('deleted_at', null).eq('ativo', true).order('nome')
    setProdutos((data ?? []) as Produto[])
  }, [supabase])

  const fetchMovimentos = useCallback(async () => {
    if (!caixa) return
    const { data } = await supabase.from('caixa_movimentos').select('*').eq('caixa_id', caixa.id).order('created_at', { ascending: false })
    setMovimentos(data ?? [])
  }, [supabase, caixa])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('perfis').select('papel,nome').eq('id', user.id).single()
        if (p) setMeuPerfil(p)
      }
      const { data: cfgs } = await supabase.from('sistema_config').select('chave,valor')
        .in('chave', ['caixa_quem_pode_abrir','caixa_max_por_filial','pdv_modo_visualizacao'])
      if (cfgs) {
        cfgs.forEach((c: any) => {
          if (c.chave === 'caixa_quem_pode_abrir') setQuemAbre(c.valor)
          if (c.chave === 'caixa_max_por_filial') setMaxCaixas(parseInt(c.valor) || 3)
          if (c.chave === 'pdv_modo_visualizacao') setModo(c.valor as ModoPDV)
        })
      }
      // Recuperar label do device salvo
      const savedLabel = typeof window !== 'undefined' ? localStorage.getItem('sos_device_label') : null
      if (savedLabel) setADeviceLabel(savedLabel)
    }
    init()
    fetchProdutos()
    verificarCaixa()
  }, [fetchProdutos, verificarCaixa, supabase])

  useEffect(() => { if (caixa) fetchMovimentos() }, [caixa, fetchMovimentos])

  // ── Pode abrir caixa? ──────────────────────────────────
  function podeAbrirCaixa(): boolean {
    if (quemAbre === 'todos') return true
    if (quemAbre === 'gerente') return ['admin','gerente'].includes(meuPerfil?.papel ?? '')
    if (quemAbre === 'admin') return meuPerfil?.papel === 'admin'
    return true
  }

  // ── Fechar caixa esquecido e abrir novo ────────────────
  async function confirmarEsquecidoEAbrir() {
    if (!caixaAnterior) return
    const { data: { user } } = await supabase.auth.getUser()
    // Marcar como esquecido
    await supabase.from('caixas').update({
      status: 'esquecido', esquecido: true,
      fechado_em: new Date().toISOString(),
      fechado_por: user?.id,
      observacoes: 'Fechamento automático — caixa esquecido sem encerramento.',
    }).eq('id', caixaAnterior.id)
    // Registrar no fechamento_dia
    await supabase.from('fechamento_dia').upsert({
      data_ref: caixaAnterior.data_ref,
      observacoes: '⚠ Fechamento não realizado — encerrado automaticamente no dia seguinte.',
      status: 'fechado', fechado_em: new Date().toISOString(),
    }, { onConflict: 'filial_id,data_ref' })
    setShowConfirmarEsquecido(false); setCaixaAnterior(null)
    setShowAbrirCaixa(true)
  }

  // ── Abrir caixa ────────────────────────────────────────
  async function abrirCaixa() {
    if (!aValorAbertura && aValorAbertura !== '0') { setErroCaixa('Informe o valor em caixa.'); return }
    setErroCaixa(''); setAbrindoCaixa(true)
    const { data: { user } } = await supabase.auth.getUser()
    const devId = deviceId.current
    const hoje = new Date().toISOString().split('T')[0]

    // Verificar limite de caixas abertos hoje
    const { count } = await supabase.from('caixas').select('id', { count: 'exact', head: true })
      .eq('data_ref', hoje).eq('status', 'aberto')
    if ((count ?? 0) >= maxCaixas) {
      setErroCaixa(`Limite de ${maxCaixas} caixas simultâneos atingido. Solicite ao gestor.`)
      setAbrindoCaixa(false); return
    }

    // Próximo número de caixa
    const { count: numAtual } = await supabase.from('caixas').select('id', { count: 'exact', head: true }).eq('data_ref', hoje)
    const numeroCaixa = (numAtual ?? 0) + 1

    const label = aDeviceLabel || `Caixa ${numeroCaixa}`
    if (typeof window !== 'undefined') localStorage.setItem('sos_device_label', label)

    const { data: novoCaixa } = await supabase.from('caixas').insert({
      numero: numeroCaixa,
      data_ref: hoje,
      device_id: devId,
      device_label: label,
      aberto_por: user?.id,
      valor_abertura: parseFloat(aValorAbertura) || 0,
      turno: aTurno,
      status: 'aberto',
    }).select('id').single()

    if (novoCaixa) {
      // Registrar movimento de abertura
      await supabase.from('caixa_movimentos').insert({
        tipo: 'abertura', valor: parseFloat(aValorAbertura) || 0,
        forma: 'dinheiro', caixa_id: novoCaixa.id, device_id: devId,
        observacoes: `Abertura ${label} — ${TURNOS.find(t => t.v === aTurno)?.l}`,
      })
    }
    setAbrindoCaixa(false); setShowAbrirCaixa(false); setAValorAbertura(''); verificarCaixa()
  }

  // ── Fechar caixa ───────────────────────────────────────
  async function fecharCaixa() {
    if (!caixa) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('caixas').update({
      status: 'fechado', fechado_em: new Date().toISOString(),
      fechado_por: user?.id, valor_fechamento: caixa.saldo_atual,
    }).eq('id', caixa.id)
    setCaixa(null); verificarCaixa()
  }

  // ── Sangria / Suprimento ───────────────────────────────
  async function salvarMovimento() {
    if (!caixa || !movValor) return
    await supabase.from('caixa_movimentos').insert({
      tipo: movAcao, valor: parseFloat(movValor),
      forma: 'dinheiro', caixa_id: caixa.id, device_id: deviceId.current,
      observacoes: movObs || null,
    })
    setMovValor(''); setMovObs(''); setShowMovModal(false); verificarCaixa(); fetchMovimentos()
  }

  // ── Venda ──────────────────────────────────────────────
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

  function adicionarAvulso() { setItens(prev => [...prev, { produto_id: null, descricao: '', quantidade: 1, preco_unit: 0, custo_unit: 0, subtotal: 0 }]) }

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
    if (!caixa || itens.length === 0 || faltaPagar > 0.01) return
    setSalvando(true)
    const { data: venda } = await supabase.from('vendas').insert({
      status: 'finalizada', tipo: 'pdv', subtotal, desconto, total,
      valor_recebido: totalPago, troco, pagamentos,
      forma_pagamento: pagamentos.length === 1 ? pagamentos[0].forma : 'misto',
      pago: true, observacoes: obs || null,
    }).select('id,numero').single()

    if (venda) {
      await supabase.from('venda_itens').insert(itens.map(i => ({ venda_id: venda.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, preco_unit: i.preco_unit })))
      for (const item of itens) {
        if (item.produto_id) {
          const prod = produtos.find(p => p.id === item.produto_id)
          if (prod) await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - item.quantidade) }).eq('id', item.produto_id)
        }
      }
      await supabase.from('caixa_movimentos').insert({
        tipo: 'venda', valor: total, caixa_id: caixa.id, device_id: deviceId.current,
        forma: pagamentos.length === 1 ? pagamentos[0].forma : 'misto',
        referencia_id: venda.id, observacoes: `Venda #${venda.numero}`,
      })
      setUltimaVenda({ numero: venda.numero, total, troco }); setVendaOk(true)
      setItens([]); setPagamentos([]); setDesconto(0); setObs('')
      fetchProdutos(); verificarCaixa()
    }
    setSalvando(false)
  }

  function imprimirRecibo() {
    if (!ultimaVenda) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title>
    <style>*{margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;max-width:76mm;padding:4mm}
    .ct{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:3mm 0}.rw{display:flex;justify-content:space-between}
    </style></head><body>
    <div class="ct b" style="font-size:13px">SOS Celulares</div>
    <div class="ct" style="font-size:8px;margin-bottom:3mm">Recibo de Venda</div>
    <div class="d"></div>
    <div class="rw"><span>Venda #${ultimaVenda.numero}</span><span>${new Date().toLocaleDateString('pt-BR')}</span></div>
    <div class="d"></div>
    ${itens.map(i => `<div class="rw"><span>${i.descricao} x${i.quantidade}</span><span>${fm(i.subtotal)}</span></div>`).join('')}
    <div class="d"></div>
    <div class="rw b"><span>TOTAL</span><span>${fm(ultimaVenda.total)}</span></div>
    ${ultimaVenda.troco > 0 ? `<div class="rw b"><span>TROCO</span><span>${fm(ultimaVenda.troco)}</span></div>` : ''}
    <div class="d"></div>
    <div class="ct" style="font-size:9px">Obrigado pela preferência!</div>
    <script>window.onload=()=>window.print()<\/script></body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob); const w = window.open(url, '_blank'); if (w) w.onload = () => URL.revokeObjectURL(url)
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  // 1. Verificando
  if (checkingCaixa) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-sans)' }}>
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Verificando caixa...</p>
    </div>
  )

  // 2. Caixa esquecido do dia anterior
  if (showConfirmarEsquecido && caixaAnterior) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fef2f2', fontFamily: 'var(--font-sans)', padding: 20 }}>
      <div style={{ background: '#fff', border: '2px solid #fecaca', borderRadius: 20, padding: '40px 48px', maxWidth: 520, width: '100%', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', border: '2px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>⚠</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#991b1b', marginBottom: 8, letterSpacing: '-0.02em' }}>Fechamento não realizado</h2>
        <p style={{ fontSize: 14, color: '#dc2626', fontWeight: 600, marginBottom: 16 }}>
          O caixa do dia {new Date(caixaAnterior.data_ref).toLocaleDateString('pt-BR')} não foi encerrado.
        </p>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 24, textAlign: 'left' }}>
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
            <strong>O que vai acontecer:</strong><br />
            • O caixa anterior será encerrado automaticamente<br />
            • Será registrado no Fechamento do dia como <strong>"esquecido"</strong><br />
            • O gestor verá o alerta no painel de fechamento<br />
            • Em seguida você poderá abrir o novo caixa
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowConfirmarEsquecido(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff', cursor: 'pointer', color: '#374151', fontWeight: 500 }}>
            Cancelar
          </button>
          <button onClick={confirmarEsquecidoEAbrir} style={{ flex: 2, padding: '12px', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
            Confirmar e continuar →
          </button>
        </div>
      </div>
    </div>
  )

  // 3. Caixa fechado — tela de abertura
  if (!caixa) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', fontFamily: 'var(--font-sans)', padding: 20 }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '40px 48px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        {/* Ícone */}
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>
          <i className="ti ti-lock" style={{ fontSize: 28, color: '#6366f1' }} />
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 6, letterSpacing: '-0.03em' }}>Caixa fechado</h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28, lineHeight: 1.5 }}>
          Para realizar vendas é necessário abrir o caixa deste terminal.
        </p>

        {!podeAbrirCaixa() ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#dc2626' }}>
            ⚠ Você não tem permissão para abrir o caixa.<br />Solicite ao gestor ou administrador.
          </div>
        ) : !showAbrirCaixa ? (
          <button onClick={() => setShowAbrirCaixa(true)} style={{ width: '100%', padding: '14px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#6366f1' }}>
            <i className="ti ti-lock-open" style={{ marginRight: 8 }} />
            Abrir caixa
          </button>
        ) : (
          <div style={{ textAlign: 'left' }}>
            {erroCaixa && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
                {erroCaixa}
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Nome deste terminal (opcional)</label>
              <input style={inp} value={aDeviceLabel} onChange={e => setADeviceLabel(e.target.value)} placeholder="Ex: Caixa 1, Balcão, PDV principal..." />
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Aparece no resumo de fechamento para identificar este computador.</p>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Turno</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {TURNOS.map(t => (
                  <button key={t.v} onClick={() => setATurno(t.v as any)} style={{ padding: '8px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: aTurno === t.v ? 600 : 400, background: aTurno === t.v ? '#eef2ff' : '#f8fafc', color: aTurno === t.v ? '#3730a3' : '#64748b', borderColor: aTurno === t.v ? '#818cf8' : '#e2e8f0' }}>
                    {t.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Valor em dinheiro no caixa físico (R$) *</label>
              <input style={{ ...inp, fontSize: 20, fontWeight: 600, textAlign: 'center' }} type="number" step="0.01" value={aValorAbertura} onChange={e => setAValorAbertura(e.target.value)} placeholder="0,00" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAbrirCaixa(false); setErroCaixa('') }} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff', cursor: 'pointer', color: '#374151', fontWeight: 500 }}>
                Cancelar
              </button>
              <button onClick={abrirCaixa} disabled={abrindoCaixa} style={{ flex: 2, padding: '12px', background: abrindoCaixa ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {abrindoCaixa ? 'Abrindo...' : '✓ Confirmar abertura'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // 4. PDV normal (caixa aberto)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--font-sans)', background: '#f8fafc', overflow: 'hidden' }}>
      {/* Barra do PDV */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {/* Abas */}
        <div style={{ display: 'flex', gap: 2, marginRight: 'auto' }}>
          {([['venda','Venda'], ['caixa','Caixa'], ['historico','Histórico']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ padding: '7px 14px', fontSize: 13, fontWeight: aba===k?600:400, border: 'none', background: aba===k?'#eef2ff':'transparent', cursor: 'pointer', color: aba===k?'#6366f1':'#64748b', borderRadius: 7 }}>{l}</button>
          ))}
        </div>

        {/* Info do caixa */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' }}>
          <span style={{ background: '#ecfdf5', color: '#065f46', padding: '3px 10px', borderRadius: 20, fontWeight: 500, fontSize: 11 }}>
            ✓ {caixa.device_label || `Caixa ${caixa.numero}`} · {TURNOS.find(t => t.v === caixa.turno)?.l}
          </span>
          <span style={{ fontWeight: 500, color: '#0f172a' }}>{fm(caixa.saldo_atual)}</span>
        </div>

        {/* Modo visual */}
        <div style={{ display: 'flex', gap: 3 }}>
          {([['padrao','Padrão'], ['touch','Touch'], ['visual','Visual']] as const).map(([m,l]) => (
            <button key={m} onClick={() => setModo(m)} style={{ padding: '6px 11px', fontSize: 11, fontWeight: modo===m?600:400, border: '1px solid', cursor: 'pointer', borderRadius: 6, background: modo===m?'#e0e7ff':'#fff', color: modo===m?'#3730a3':'#64748b', borderColor: modo===m?'#818cf8':'#e2e8f0' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── VENDA ─────────────────────────────────────── */}
        {aba === 'venda' && (modo === 'padrao' || modo === 'touch') && (
          <>
            {/* Lista de itens */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Busca */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                <div style={{ position: 'relative' }}>
                  <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 15 }} />
                  <input style={{ ...inp, paddingLeft: 36, fontSize: modo === 'touch' ? 16 : 13 }} placeholder="Buscar produto..." value={searchProd} onChange={e => buscarProduto(e.target.value)} autoComplete="off" />
                  {prodResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 4, overflow: 'hidden' }}>
                      {prodResults.map(p => (
                        <div key={p.id} onClick={() => adicionarProduto(p)} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f3ff' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}>
                          <div><p style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</p><p style={{ fontSize: 11, color: '#94a3b8' }}>Estoque: {p.estoque_atual}</p></div>
                          <p style={{ fontWeight: 600, color: '#6366f1' }}>{fm(p.preco_venda)}</p>
                        </div>
                      ))}
                      <div onClick={adicionarAvulso} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: '#6366f1', fontWeight: 500, background: '#f8f7ff' }}>+ Item avulso</div>
                    </div>
                  )}
                </div>
                <button onClick={adicionarAvulso} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0' }}>+ Item avulso</button>
              </div>

              {/* Grade (touch) ou lista (padrão) */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                {modo === 'touch' && !searchProd && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
                    {produtos.slice(0, 20).map(p => (
                      <button key={p.id} onClick={() => adicionarProduto(p)} disabled={p.estoque_atual === 0} style={{ padding: '14px 8px', borderRadius: 10, border: '1px solid #e2e8f0', background: p.estoque_atual === 0 ? '#f8fafc' : '#fff', cursor: p.estoque_atual === 0 ? 'not-allowed' : 'pointer', textAlign: 'center', opacity: p.estoque_atual === 0 ? 0.5 : 1 }}>
                        <i className={`ti ${CATEGORIA_ICONES[p.categoria ?? ''] ?? 'ti-package'}`} style={{ fontSize: 24, color: '#6366f1', display: 'block', marginBottom: 6 }} />
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#0f172a', lineHeight: 1.3, marginBottom: 4 }}>{p.nome.slice(0, 28)}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{fm(p.preco_venda)}</div>
                      </button>
                    ))}
                  </div>
                )}

                {itens.length === 0 && (modo !== 'touch' || searchProd) ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                    <i className="ti ti-shopping-cart" style={{ fontSize: 36, display: 'block', marginBottom: 10 }} />
                    <p>Busque um produto para começar</p>
                  </div>
                ) : itens.map((item, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '11px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        {item.produto_id ? <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 6 }}>{item.descricao}</p>
                          : <input style={{ ...inp, marginBottom: 6 }} value={item.descricao} onChange={e => atualizarItem(i, 'descricao', e.target.value)} placeholder="Descrição..." />}
                        <div style={{ display: 'flex', gap: 8 }}>
                          {modo === 'touch' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button onClick={() => atualizarItem(i, 'quantidade', Math.max(1, item.quantidade - 1))} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>−</button>
                              <span style={{ fontSize: 15, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{item.quantidade}</span>
                              <button onClick={() => atualizarItem(i, 'quantidade', item.quantidade + 1)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>+</button>
                            </div>
                          ) : (
                            <div style={{ flex: 1 }}><label style={lbl}>Qtd</label><input style={inp} type="number" min="1" value={item.quantidade} onChange={e => atualizarItem(i, 'quantidade', parseInt(e.target.value) || 1)} /></div>
                          )}
                          <div style={{ flex: 2 }}><label style={lbl}>Preço (R$)</label><input style={inp} type="number" step="0.01" value={item.preco_unit} onChange={e => atualizarItem(i, 'preco_unit', parseFloat(e.target.value) || 0)} /></div>
                          <div style={{ flex: 2, paddingTop: 16 }}><p style={{ fontSize: 14, fontWeight: 600, color: '#6366f1' }}>{fm(item.subtotal)}</p></div>
                        </div>
                      </div>
                      <button onClick={() => removerItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Painel direito */}
            <div style={{ width: 300, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {vendaOk && ultimaVenda && (
                <div style={{ padding: '12px 14px', background: '#ecfdf5', borderBottom: '1px solid #bbf7d0', flexShrink: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>✅ Venda #{ultimaVenda.numero}!</p>
                  {ultimaVenda.troco > 0 && <p style={{ fontSize: 15, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>Troco: {fm(ultimaVenda.troco)}</p>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={imprimirRecibo} style={{ flex: 1, padding: '6px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: '#fff', color: '#065f46' }}>🖨 Recibo</button>
                    <button onClick={() => setVendaOk(false)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: '#fff', color: '#374151' }}>Nova venda</button>
                  </div>
                </div>
              )}
              {/* Resumo */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Subtotal</span><span style={{ fontWeight: 500 }}>{fm(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Desconto</span>
                  <input type="number" value={desconto || ''} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} style={{ width: 70, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, color: '#6366f1', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>Total</span>
                  <span>{fm(total)}</span>
                </div>
              </div>
              {/* Pagamento */}
              <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 10 }}>
                  {FORMAS.map(f => (
                    <button key={f.key} onClick={() => setFormaPag(f.key)} style={{ padding: '9px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 500, textAlign: 'center', background: formaPag===f.key?f.cor+'15':'#f8fafc', color: formaPag===f.key?f.cor:'#64748b', borderColor: formaPag===f.key?f.cor+'80':'#e2e8f0' }}>
                      <i className={`ti ${f.icon}`} style={{ display: 'block', fontSize: 18, marginBottom: 2 }} />
                      {f.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input type="number" step="0.01" value={valorPag} onChange={e => setValorPag(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarPagamento()} placeholder={faltaPagar > 0 ? faltaPagar.toFixed(2) : '0,00'} style={{ ...inp, flex: 1 }} />
                  <button onClick={adicionarPagamento} style={{ padding: '9px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>+</button>
                </div>
                {pagamentos.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8f7ff', border: '1px solid #e0e7ff', borderRadius: 7, marginBottom: 5, fontSize: 13 }}>
                    <span style={{ color: '#4338ca', fontWeight: 500, textTransform: 'capitalize' }}>{p.forma}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{fm(p.valor)}</span>
                      <button onClick={() => setPagamentos(prev => prev.filter((_,j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  </div>
                ))}
                {pagamentos.length > 0 && (
                  <div style={{ padding: '8px', background: '#f8fafc', borderRadius: 7, fontSize: 13, marginTop: 4 }}>
                    {faltaPagar > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#991b1b', fontWeight: 600 }}><span>Falta</span><span>{fm(faltaPagar)}</span></div>}
                    {troco > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#065f46', fontWeight: 700, fontSize: 15 }}><span>Troco</span><span>{fm(troco)}</span></div>}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <label style={lbl}>Observações</label>
                  <input style={inp} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional..." />
                </div>
              </div>
              <div style={{ padding: '12px 14px', flexShrink: 0 }}>
                <button onClick={finalizarVenda} disabled={salvando || itens.length === 0 || faltaPagar > 0.01} style={{ width: '100%', padding: '13px', background: salvando||itens.length===0||faltaPagar>0.01?'#e2e8f0':'#6366f1', color: salvando||itens.length===0||faltaPagar>0.01?'#94a3b8':'#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {salvando ? 'Finalizando...' : itens.length===0 ? 'Adicione itens' : faltaPagar>0.01 ? `Falta ${fm(faltaPagar)}` : `✓ Finalizar · ${fm(total)}`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Modo visual */}
        {aba === 'venda' && modo === 'visual' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', background: '#f8fafc' }}>
              <input style={{ ...inp, fontSize: 15, padding: '11px 16px', borderRadius: 10, marginBottom: 14 }} placeholder="Buscar produto..." value={searchProd} onChange={e => buscarProduto(e.target.value)} autoComplete="off" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {(searchProd ? prodResults : produtos.slice(0, 30)).map(p => {
                  const jaTem = itens.find(i => i.produto_id === p.id)
                  return (
                    <button key={p.id} onClick={() => adicionarProduto(p)} disabled={p.estoque_atual === 0} style={{ padding: '18px 14px', borderRadius: 12, border: `2px solid ${jaTem?'#818cf8':'#e2e8f0'}`, background: jaTem?'#eef2ff':p.estoque_atual===0?'#f8fafc':'#fff', cursor: p.estoque_atual===0?'not-allowed':'pointer', textAlign: 'center', opacity: p.estoque_atual===0?0.4:1, transition: 'all 0.15s' }}>
                      <i className={`ti ${CATEGORIA_ICONES[p.categoria??''] ?? 'ti-package'}`} style={{ fontSize: 32, color: jaTem?'#4338ca':'#6366f1', display: 'block', marginBottom: 8 }} />
                      <div style={{ fontSize: 12, fontWeight: 600, color: jaTem?'#3730a3':'#0f172a', marginBottom: 6, lineHeight: 1.3 }}>{p.nome.slice(0,35)}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: jaTem?'#4338ca':'#6366f1' }}>{fm(p.preco_venda)}</div>
                      {jaTem && <div style={{ fontSize: 10, color: '#4338ca', marginTop: 3, fontWeight: 600 }}>× {jaTem.quantidade} no carrinho</div>}
                    </button>
                  )
                })}
              </div>
            </div>
            {itens.length > 0 && (
              <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '14px 20px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13, color: '#64748b', flex: 1 }}>{itens.length} produto(s) · Subtotal {fm(subtotal)}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {FORMAS.map(f => (
                      <button key={f.key} onClick={() => { setFormaPag(f.key); setPagamentos([{ forma: f.key, valor: total }]) }} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: formaPag===f.key?f.cor+'15':'#f8fafc', color: formaPag===f.key?f.cor:'#64748b', borderColor: formaPag===f.key?f.cor+'80':'#e2e8f0' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 12, color: '#64748b' }}>Total</p>
                    <p style={{ fontSize: 26, fontWeight: 800, color: '#6366f1' }}>{fm(total)}</p>
                  </div>
                  <button onClick={finalizarVenda} disabled={salvando||pagamentos.length===0} style={{ padding: '14px 28px', background: salvando||pagamentos.length===0?'#e2e8f0':'#6366f1', color: salvando||pagamentos.length===0?'#94a3b8':'#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                    {salvando?'Finalizando...':pagamentos.length===0?'Selecione pagamento':'✓ Finalizar'}
                  </button>
                  <button onClick={() => { setItens([]); setPagamentos([]) }} style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, fontSize: 18, cursor: 'pointer', color: '#ef4444' }}>
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CAIXA ─────────────────────────────────────── */}
        {aba === 'caixa' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ maxWidth: 600 }}>
              {/* Status */}
              <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>✅ {caixa.device_label || `Caixa ${caixa.numero}`} — aberto</p>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Aberto por {caixa.aberto_por_nome} · {TURNOS.find(t => t.v === caixa.turno)?.l} · {new Date(caixa.aberto_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{fm(caixa.saldo_atual)}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>{caixa.qtd_vendas} vendas</p>
                  </div>
                </div>
              </div>

              {/* Resumo */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {[{ l: 'Abertura', v: fm(caixa.valor_abertura), c: '#64748b' }, { l: 'Entradas', v: fm(caixa.total_entradas), c: '#065f46' }, { l: 'Saídas', v: fm(caixa.total_saidas), c: '#991b1b' }].map(m => (
                  <div key={m.l} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.l}</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: m.c }}>{m.v}</p>
                  </div>
                ))}
              </div>

              {/* Ações */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                <button onClick={() => { setMovAcao('sangria'); setMovValor(''); setMovObs(''); setShowMovModal(true) }} style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#374151' }}>
                  <i className="ti ti-arrow-bar-down" style={{ display: 'block', fontSize: 18, marginBottom: 4, color: '#ef4444' }} />
                  Sangria
                </button>
                <button onClick={() => { setMovAcao('suprimento'); setMovValor(''); setMovObs(''); setShowMovModal(true) }} style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#374151' }}>
                  <i className="ti ti-arrow-bar-up" style={{ display: 'block', fontSize: 18, marginBottom: 4, color: '#10b981' }} />
                  Suprimento
                </button>
                <button onClick={() => { if (confirm('Fechar o caixa agora?')) fecharCaixa() }} style={{ padding: '10px', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: '#fef2f2', color: '#dc2626' }}>
                  <i className="ti ti-lock" style={{ display: 'block', fontSize: 18, marginBottom: 4 }} />
                  Fechar caixa
                </button>
              </div>

              {/* Movimentos */}
              <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Movimentos deste caixa</p>
              {movimentos.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, marginBottom: 5, fontSize: 13 }}>
                  <div><span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{m.tipo}</span>{m.observacoes && <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 12 }}>{m.observacoes}</span>}</div>
                  <span style={{ fontWeight: 600, color: ['sangria','estorno'].includes(m.tipo) ? '#991b1b' : '#065f46' }}>
                    {['sangria','estorno'].includes(m.tipo) ? '-' : '+'}{fm(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── HISTÓRICO ─────────────────────────────────── */}
        {aba === 'historico' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <HistoricoVendas supabase={supabase} />
          </div>
        )}
      </div>

      {/* Modal sangria / suprimento */}
      {showMovModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 360, padding: '24px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 16, textTransform: 'capitalize' }}>
              {movAcao === 'sangria' ? '↓ Sangria de caixa' : '↑ Suprimento de caixa'}
            </h3>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Valor (R$) *</label><input style={inp} type="number" step="0.01" value={movValor} onChange={e => setMovValor(e.target.value)} autoFocus /></div>
            <div style={{ marginBottom: 16 }}><label style={lbl}>Motivo</label><input style={inp} value={movObs} onChange={e => setMovObs(e.target.value)} placeholder="Opcional..." /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowMovModal(false)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarMovimento} disabled={!movValor} style={{ flex: 2, padding: '9px', background: !movValor?'#e2e8f0':'#6366f1', color: !movValor?'#94a3b8':'#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Confirmar
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
    supabase.from('vendas').select('*,venda_itens(*)').eq('status','finalizada').eq('tipo','pdv').order('created_at',{ascending:false}).limit(30)
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
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{v.venda_itens?.length ?? 0} itens · {v.forma_pagamento}</p>
        </div>
      ))}
    </div>
  )
}
