'use client'
export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { searchByModel, searchByTAC, validateIMEI, type ModelSpec } from '@/lib/tac-database'

// ─── Types ───────────────────────────────────────────────────
type Cliente = { id: string; nome: string; telefone: string | null; cpf: string | null; data_nascimento: string | null }
type Produto = { id: string; nome: string; preco_venda: number; categoria: string | null }
type PatternCell = number

const SINTOMAS = [
  'Tela trincada', 'Vidro quebrado', 'Sem imagem', 'Tela preta',
  'Não carrega', 'Carregando lento', 'Não liga', 'Desligando sozinho',
  'Sem áudio', 'Som baixo', 'Câmera', 'Molhado', 'Caiu na água',
  'Falante', 'Botão power', 'Touch',
]


function formatPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
}
function formatCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// ─── Pattern Lock Component ──────────────────────────────────
function PatternLock({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [drawing, setDrawing] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const SIZE = 180, COLS = 3, PAD = 30, STEP = (SIZE - PAD * 2) / (COLS - 1)

  function dotPos(i: number) { return { x: PAD + (i % COLS) * STEP, y: PAD + Math.floor(i / COLS) * STEP } }
  function nearestDot(x: number, y: number): number | null {
    for (let i = 0; i < 9; i++) { const p = dotPos(i); if (Math.hypot(x - p.x, y - p.y) < 18) return i }
    return null
  }
  function getSVGPos(e: React.MouseEvent | React.TouchEvent) {
    const svg = svgRef.current!; const rect = svg.getBoundingClientRect()
    const scaleX = SIZE / rect.width, scaleY = SIZE / rect.height
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }
  function onStart(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); const pos = getSVGPos(e); const dot = nearestDot(pos.x, pos.y); if (dot !== null) { onChange([dot]); setDrawing(true); setMousePos(pos) } }
  function onMove(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); if (!drawing) return; const pos = getSVGPos(e); setMousePos(pos); const dot = nearestDot(pos.x, pos.y); if (dot !== null && !value.includes(dot)) onChange([...value, dot]) }
  function onEnd() { setDrawing(false) }
  function clear(e: React.MouseEvent) { e.preventDefault(); onChange([]); setDrawing(false) }

  return (
    <div style={{ userSelect: 'none' }}>
      <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ background: '#0f172a', borderRadius: 12, cursor: 'crosshair', touchAction: 'none', display: 'block' }} onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        {value.map((dot, idx) => { if (idx === 0) return null; const from = dotPos(value[idx - 1]), to = dotPos(dot); return <line key={idx} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6366f1" strokeWidth="2" opacity="0.8" /> })}
        {drawing && value.length > 0 && (() => { const last = dotPos(value[value.length - 1]); return <line x1={last.x} y1={last.y} x2={mousePos.x} y2={mousePos.y} stroke="#6366f1" strokeWidth="2" opacity="0.4" strokeDasharray="4 2" /> })()}
        {Array.from({ length: 9 }, (_, i) => { const p = dotPos(i), order = value.indexOf(i), drawn = order !== -1; return (<g key={i}><circle cx={p.x} cy={p.y} r={12} fill={drawn ? '#6366f1' : '#1e293b'} stroke={drawn ? '#818cf8' : '#334155'} strokeWidth="1.5" /><circle cx={p.x} cy={p.y} r={4} fill={drawn ? '#fff' : '#475569'} />{drawn && <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize="9" fill="#818cf8" fontFamily="monospace">{order + 1}</text>}</g>) })}
        {value.map((dot, idx) => { if (idx === 0) return null; const from = dotPos(value[idx - 1]), to = dotPos(dot), mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2, angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI; return <g key={`arrow-${idx}`} transform={`translate(${mx},${my}) rotate(${angle})`}><polygon points="-4,-3 4,0 -4,3" fill="#6366f1" opacity="0.9" /></g> })}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{value.length === 0 ? 'Desenhe o padrão' : `${value.length} ponto${value.length > 1 ? 's' : ''}: ${value.map(v => v + 1).join(' → ')}`}</span>
        {value.length > 0 && <button onMouseDown={clear} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Limpar</button>}
      </div>
    </div>
  )
}


// ─── Modal pós-salvamento ────────────────────────────────────
function ModalSalvo({
  osId, osNumero, clienteNome, clienteTelefone, defeito, modelo,
  onFechar
}: {
  osId: string
  osNumero: number
  clienteNome: string
  clienteTelefone: string | null
  defeito: string
  modelo: string
  onFechar: () => void
}) {
  const router = useRouter()

  function gerarWA() {
    const nome = clienteNome.split(' ')[0]
    const msg = `Olá, ${nome}! 😊 Seu aparelho *${modelo}* foi recebido em nossa assistência técnica.\n\n🔧 *OS Nº ${osNumero}*\n📱 Aparelho: ${modelo}\n🛠 Defeito: ${defeito}\n\nAssim que tivermos novidades, entraremos em contato. Obrigado pela confiança!`
    const num = clienteTelefone?.replace(/\D/g, '') ?? ''
    window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        {/* Header verde de sucesso */}
        <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '24px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>OS #{osNumero} aberta!</h2>
          <p style={{ fontSize: 13, color: '#a7f3d0', marginTop: 4 }}>{clienteNome} · {modelo}</p>
        </div>

        {/* Opções */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 4 }}>O que deseja fazer agora?</p>

          {/* Imprimir OS */}
          <button
            onClick={() => router.push(`/os/${osId}?imprimir=1`)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid #e0e7ff', borderRadius: 10, background: '#f5f3ff', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>🖨️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#3730a3' }}>Imprimir OS</div>
              <div style={{ fontSize: 12, color: '#6366f1' }}>Abrir a OS e imprimir o comprovante para o cliente</div>
            </div>
          </button>

          {/* WhatsApp */}
          {clienteTelefone && (
            <button
              onClick={gerarWA}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid #bbf7d0', borderRadius: 10, background: '#f0fdf4', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>💬</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Enviar WhatsApp</div>
                <div style={{ fontSize: 12, color: '#059669' }}>Avisar o cliente que o aparelho foi recebido</div>
              </div>
            </button>
          )}

          {/* Fechar */}
          <button
            onClick={onFechar}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>📋</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Ir para lista de OS</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Voltar para as pendências</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function NovaOSPage() {
  const supabase = createClient()
  const router = useRouter()

  // ── Cliente
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteResults, setClienteResults] = useState<Cliente[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [novoCliente, setNovoCliente] = useState(false)
  const [nomeCliente, setNomeCliente] = useState('')
  const [telefoneCliente, setTelefoneCliente] = useState('')
  const [cpfCliente, setCpfCliente] = useState('')
  const [nascCliente, setNascCliente] = useState('')
  const clienteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Aparelho
  const [modeloSearch, setModeloSearch] = useState('')
  const [modeloResults, setModeloResults] = useState<ModelSpec[]>([])
  const [modeloSelecionado, setModeloSelecionado] = useState<ModelSpec | null>(null)
  const [imei, setImei] = useState('')
  const [imeiValido, setImeiValido] = useState<boolean | null>(null)
  const [cor, setCor] = useState('')
  const [acessorios, setAcessorios] = useState<string[]>([])
  const modeloTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Senha
  const [tipoSenha, setTipoSenha] = useState<'nenhuma' | 'pin' | 'senha' | 'padrao'>('nenhuma')
  const [senhaValor, setSenhaValor] = useState('')
  const [padrao, setPadrao] = useState<number[]>([])

  // ── Assinatura do cliente
  const clienteSigRef = useRef<HTMLCanvasElement>(null)
  const [assinaturaCliente, setAssinaturaCliente] = useState('')
  const [desenhando, setDesenhando] = useState(false)

  function onSigDown(e: React.MouseEvent<HTMLCanvasElement>) {
    setDesenhando(true); const c = clienteSigRef.current; if (!c) return
    const r = c.getBoundingClientRect(); const ctx = c.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
  }
  function onSigMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!desenhando) return; const c = clienteSigRef.current; if (!c) return
    const r = c.getBoundingClientRect(); const ctx = c.getContext('2d')!
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke()
  }
  function onSigUp() { setDesenhando(false); setAssinaturaCliente(clienteSigRef.current?.toDataURL() ?? '') }
  function limparSig() {
    const c = clienteSigRef.current; if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setAssinaturaCliente('')
  }

  // ── Produto / peça
  const [produtoSearch, setProdutoSearch] = useState('')
  const [produtoResults, setProdutoResults] = useState<Produto[]>([])
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null)
  const [novoProduto, setNovoProduto] = useState(false)
  const [nomeProduto, setNomeProduto] = useState('')
  const [precoProduto, setPrecoProduto] = useState('')
  const produtoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function buscarProduto(q: string) {
    if (!q || q.length < 2) { setProdutoResults([]); return }
    const { data } = await supabase.from('produtos').select('id,nome,preco_venda,categoria').eq('ativo', true).ilike('nome', `%${q}%`).is('deleted_at', null).limit(6).order('nome')
    setProdutoResults(data ?? [])
  }

  function onProdutoSearchChange(v: string) {
    setProdutoSearch(v); setProdutoSelecionado(null); setNovoProduto(false)
    if (produtoTimer.current) clearTimeout(produtoTimer.current)
    produtoTimer.current = setTimeout(() => buscarProduto(v), 250)
  }

  function selecionarProduto(p: Produto) { setProdutoSelecionado(p); setProdutoSearch(p.nome); setProdutoResults([]) }
  function ativarNovoProduto() { setNomeProduto(produtoSearch); setNovoProduto(true); setProdutoResults([]) }

  // ── OS
  const [sintomasSelecionados, setSintomasSelecionados] = useState<string[]>([])
  const [valor, setValor] = useState('')
  const [defeito, setDefeito] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleSintoma(s: string) {
    setSintomasSelecionados(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  // ── Modal pós-salvamento
  const [modalSalvo, setModalSalvo] = useState<{
    osId: string; osNumero: number; clienteNome: string; clienteTelefone: string | null
  } | null>(null)

  // ─── Busca cliente
  const buscarCliente = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setClienteResults([]); return }
    const raw = q.replace(/\D/g, '')
    let query = supabase.from('clientes').select('id,nome,telefone,cpf,data_nascimento').is('deleted_at', null).limit(5)
    if (raw.length >= 4) query = query.or(`cpf.ilike.%${raw}%,telefone.ilike.%${raw}%`)
    else query = query.ilike('nome', `%${q}%`)
    const { data } = await query.order('nome')
    setClienteResults(data ?? [])
  }, [supabase])

  function onClienteSearchChange(v: string) {
    setClienteSearch(v); setClienteSelecionado(null); setNovoCliente(false)
    if (clienteTimer.current) clearTimeout(clienteTimer.current)
    clienteTimer.current = setTimeout(() => buscarCliente(v), 250)
  }

  function selecionarCliente(c: Cliente) { setClienteSelecionado(c); setClienteSearch(c.nome); setClienteResults([]); setNovoCliente(false) }
  function ativarNovoCliente() { setNomeCliente(clienteSearch); setNovoCliente(true); setClienteResults([]); setClienteSelecionado(null) }

  function onModeloChange(v: string) {
    setModeloSearch(v); setModeloSelecionado(null)
    if (modeloTimer.current) clearTimeout(modeloTimer.current)
    modeloTimer.current = setTimeout(() => setModeloResults(searchByModel(v)), 200)
  }

  function selecionarModelo(m: ModelSpec) { setModeloSelecionado(m); setModeloSearch(`${m.marca} ${m.modelo}`); setModeloResults([]) }

  function onIMEIChange(v: string) {
    const raw = v.replace(/\D/g, '').slice(0, 15); setImei(raw)
    if (raw.length === 15) {
      const valid = validateIMEI(raw); setImeiValido(valid)
      if (valid) { const spec = searchByTAC(raw.slice(0, 8)); if (spec && !modeloSelecionado) selecionarModelo(spec) }
    } else { setImeiValido(null) }
  }

  // ─── Salvar OS — agora abre modal em vez de redirecionar
  async function salvar() {
    if (!clienteSelecionado && !nomeCliente.trim()) { setError('Informe o cliente.'); return }
    if (!defeito.trim()) { setError('Informe o defeito relatado.'); return }
    setSaving(true); setError('')

    let clienteId = clienteSelecionado?.id ?? null
    let clienteNomeFinal = clienteSelecionado?.nome ?? nomeCliente.trim()
    let clienteTelFinal = clienteSelecionado?.telefone ?? (telefoneCliente.replace(/\D/g, '') || null)

    if (novoCliente && nomeCliente.trim()) {
      const { data } = await supabase.from('clientes').insert({
        nome: nomeCliente.trim(),
        telefone: telefoneCliente.replace(/\D/g, '') || null,
        cpf: cpfCliente.replace(/\D/g, '') || null,
        data_nascimento: nascCliente || null,
      }).select('id').single()
      clienteId = data?.id ?? null
      clienteNomeFinal = nomeCliente.trim()
      clienteTelFinal = telefoneCliente.replace(/\D/g, '') || null
    }

    const senhaInfo = tipoSenha === 'padrao'
      ? JSON.stringify({ tipo: 'padrao', sequencia: padrao })
      : tipoSenha !== 'nenhuma' ? JSON.stringify({ tipo: tipoSenha, valor: senhaValor }) : null

    const { data: osData, error: err } = await supabase.from('ordens_servico').insert({
      cliente_id: clienteId,
      imei: imei || null,
      tac: imei ? imei.slice(0, 8) : null,
      marca: modeloSelecionado?.marca ?? null,
      modelo: modeloSelecionado ? `${modeloSelecionado.marca} ${modeloSelecionado.modelo}` : modeloSearch || null,
      cor: cor || null,
      acessorios: acessorios.length > 0 ? acessorios : null,
      senha_aparelho: senhaInfo,
      defeito_relatado: sintomasSelecionados.length > 0
        ? `[${sintomasSelecionados.join(', ')}] ${defeito.trim()}`
        : defeito.trim(),
      observacoes: observacoes || null,
      valor_orcamento: valor ? parseFloat(valor) : null,
      status: 'aguardando_diagnostico',
      assinatura_cliente: assinaturaCliente || null,
    }).select('id, numero').single()

    if (err) { setError(`Erro: ${err.message}`); setSaving(false); return }

    // Produto/peça vinculado à OS
    let produtoId = produtoSelecionado?.id ?? null
    let produtoNomeFinal = produtoSelecionado?.nome ?? null
    let produtoPrecoFinal = produtoSelecionado?.preco_venda ?? null

    if (novoProduto && nomeProduto.trim()) {
      const preco = precoProduto ? parseFloat(precoProduto) : 0
      const { data: pData } = await supabase.from('produtos').insert({
        nome: nomeProduto.trim(),
        preco_venda: preco,
        categoria: 'Peça',
        estoque_atual: 0,
      }).select('id,nome,preco_venda').single()
      produtoId = pData?.id ?? null
      produtoNomeFinal = pData?.nome ?? nomeProduto.trim()
      produtoPrecoFinal = pData?.preco_venda ?? preco
    }

    if (produtoId && produtoNomeFinal) {
      await supabase.from('os_itens').insert({
        os_id: osData.id,
        produto_id: produtoId,
        descricao: produtoNomeFinal,
        quantidade: 1,
        preco_unit: produtoPrecoFinal ?? 0,
      })
    }

    try { await supabase.from('events').insert({ type: 'OS_CRIADA', entity: 'os', payload: { clienteId, defeito, modelo: modeloSelecionado?.modelo } }) } catch { /* non-critical */ }

    setSaving(false)

    // Abre modal de ações pós-salvamento
    setModalSalvo({
      osId: osData.id,
      osNumero: osData.numero,
      clienteNome: clienteNomeFinal,
      clienteTelefone: clienteTelFinal,
    })
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3 }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }
  const cardTitle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#0f172a', marginBottom: 10, paddingBottom: 7, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const ACESSORIOS_LIST = ['Capinha', 'Película', 'Carregador', 'Cabo USB', 'Fone', 'Caixa']

  return (
    <div style={{ padding: '12px 20px', fontFamily: 'var(--font-sans)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Modal pós-salvamento */}
      {modalSalvo && (
        <ModalSalvo
          osId={modalSalvo.osId}
          osNumero={modalSalvo.osNumero}
          clienteNome={modalSalvo.clienteNome}
          clienteTelefone={modalSalvo.clienteTelefone}
          defeito={defeito}
          modelo={modeloSelecionado ? `${modeloSelecionado.marca} ${modeloSelecionado.modelo}` : modeloSearch || 'Aparelho'}
          onFechar={() => router.push('/os')}
        />
      )}

      {/* Cabeçalho compacto */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>←</button>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Nova Ordem de Serviço</h1>
        {error && <span style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 10px' }}>{error}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => router.back()} style={{ padding: '7px 16px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} style={{ padding: '7px 22px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Salvando...' : 'Abrir OS'}
          </button>
        </div>
      </div>

      {/* Layout duas colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1, minHeight: 0 }}>

        {/* ── COLUNA ESQUERDA: Cliente · Aparelho · Senha */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto' }}>

          {/* Cliente */}
          <div style={card}>
            <div style={cardTitle}><span>👤</span> Cliente</div>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <label style={lbl}>Buscar por nome, CPF ou telefone</label>
              <input style={inp} value={clienteSearch} onChange={e => onClienteSearchChange(e.target.value)} placeholder="Digite para buscar..." autoComplete="off" />
              {clienteResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden', marginTop: 4 }}>
                  {clienteResults.map(c => (
                    <div key={c.id} onClick={() => selecionarCliente(c)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{c.nome.charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>{c.nome}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{[c.telefone ? formatPhone(c.telefone) : null, c.cpf ? formatCPF(c.cpf) : null].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  ))}
                  <div onClick={ativarNovoCliente} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#6366f1', fontWeight: 500, background: '#f8f7ff' }}>
                    + Cadastrar &quot;{clienteSearch}&quot; como novo cliente
                  </div>
                </div>
              )}
              {clienteSearch.length >= 2 && clienteResults.length === 0 && !clienteSelecionado && !novoCliente && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={ativarNovoCliente} style={{ fontSize: 12, color: '#6366f1', background: '#f5f3ff', border: '1px solid #e0e7ff', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 500 }}>+ Cadastrar como novo cliente</button>
                </div>
              )}
            </div>
            {clienteSelecionado && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>✅</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#065f46' }}>{clienteSelecionado.nome}</div>
                  <div style={{ fontSize: 11, color: '#059669' }}>{[clienteSelecionado.telefone ? formatPhone(clienteSelecionado.telefone) : null, clienteSelecionado.cpf ? formatCPF(clienteSelecionado.cpf) : null].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => { setClienteSelecionado(null); setClienteSearch('') }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            )}
            {novoCliente && (
              <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: 7, padding: 10, marginTop: 6 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#92400e', marginBottom: 8 }}>NOVO CLIENTE — apenas nome é obrigatório</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Nome *</label><input style={inp} value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome completo" /></div>
                  <div><label style={lbl}>Telefone</label><input style={inp} value={telefoneCliente} onChange={e => setTelefoneCliente(formatPhone(e.target.value))} placeholder="(11) 99999-9999" /></div>
                  <div><label style={lbl}>CPF</label><input style={inp} value={cpfCliente} onChange={e => setCpfCliente(formatCPF(e.target.value))} placeholder="000.000.000-00" /></div>
                  <div><label style={lbl}>Data de nascimento</label><input style={inp} type="date" value={nascCliente} onChange={e => setNascCliente(e.target.value)} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Aparelho */}
          <div style={card}>
            <div style={cardTitle}><span>📱</span> Aparelho</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <label style={lbl}>Modelo</label>
                <input style={inp} value={modeloSearch} onChange={e => onModeloChange(e.target.value)} placeholder="Ex: A32, iPhone 13..." autoComplete="off" />
                {modeloResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden', marginTop: 4 }}>
                    {modeloResults.map((m, i) => (
                      <div key={i} onClick={() => selecionarModelo(m)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                        <div style={{ fontWeight: 500, color: '#0f172a' }}>{m.marca} {m.modelo}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{m.display} · {m.displayTipo} · {m.bateria} · {m.ram} RAM</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>IMEI <span style={{ fontWeight: 400, color: '#94a3b8' }}>(*#06#)</span></label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inp, paddingRight: 28, borderColor: imeiValido === false ? '#ef4444' : imeiValido === true ? '#10b981' : '#e2e8f0' }} value={imei} onChange={e => onIMEIChange(e.target.value)} placeholder="000000000000000" maxLength={15} />
                  {imeiValido !== null && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>{imeiValido ? '✅' : '❌'}</span>}
                </div>
                {imeiValido === false && <p style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>IMEI inválido</p>}
              </div>
              <div><label style={lbl}>Cor</label><input style={inp} value={cor} onChange={e => setCor(e.target.value)} placeholder="Preto, Branco, Azul..." /></div>
              <div>
                <label style={lbl}>Acessórios entregues</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                  {ACESSORIOS_LIST.map(a => (
                    <button key={a} onClick={() => setAcessorios(ac => ac.includes(a) ? ac.filter(x => x !== a) : [...ac, a])} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, border: '1px solid', cursor: 'pointer', background: acessorios.includes(a) ? '#e0e7ff' : '#f8fafc', color: acessorios.includes(a) ? '#3730a3' : '#64748b', borderColor: acessorios.includes(a) ? '#c7d2fe' : '#e2e8f0' }}>{a}</button>
                  ))}
                </div>
              </div>
            </div>
            {modeloSelecionado && (
              <div style={{ marginTop: 8, background: '#f8fafc', borderRadius: 7, padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 10, fontWeight: 500, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Especificações</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {[{ label: 'Display', value: modeloSelecionado.display }, { label: 'Original', value: modeloSelecionado.displayTipo }, { label: 'Bateria', value: modeloSelecionado.bateria }, { label: 'Processador', value: modeloSelecionado.processador }].map(s => (
                    <div key={s.label} style={{ background: '#fff', borderRadius: 5, padding: '5px 8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 1 }}>{s.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#0f172a' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Senha */}
          <div style={card}>
            <div style={cardTitle}><span>🔐</span> Senha do aparelho</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: tipoSenha !== 'nenhuma' ? 10 : 0 }}>
              {(['nenhuma', 'pin', 'senha', 'padrao'] as const).map(t => (
                <button key={t} onClick={() => setTipoSenha(t)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid', fontWeight: tipoSenha === t ? 500 : 400, background: tipoSenha === t ? '#e0e7ff' : '#fff', color: tipoSenha === t ? '#3730a3' : '#64748b', borderColor: tipoSenha === t ? '#818cf8' : '#e2e8f0' }}>
                  {t === 'nenhuma' ? 'Sem senha' : t === 'pin' ? 'PIN' : t === 'senha' ? 'Senha' : 'Padrão'}
                </button>
              ))}
            </div>
            {(tipoSenha === 'pin' || tipoSenha === 'senha') && (
              <div style={{ maxWidth: 220 }}>
                <label style={lbl}>{tipoSenha === 'pin' ? 'Código PIN' : 'Senha'}</label>
                <input style={inp} type={tipoSenha === 'pin' ? 'number' : 'text'} value={senhaValor} onChange={e => setSenhaValor(e.target.value)} placeholder={tipoSenha === 'pin' ? '0000' : 'Digite a senha'} />
              </div>
            )}
            {tipoSenha === 'padrao' && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <PatternLock value={padrao} onChange={setPadrao} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 500 }}>COMO USAR</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>Clique e arraste sobre as bolinhas para desenhar o padrão.</p>
                  {padrao.length > 0 && <div style={{ marginTop: 8, background: '#f8fafc', borderRadius: 6, padding: '6px 10px' }}><p style={{ fontSize: 10, color: '#64748b' }}>Sequência:</p><p style={{ fontSize: 12, fontWeight: 500, color: '#0f172a', fontFamily: 'monospace' }}>{padrao.map(p => p + 1).join(' → ')}</p></div>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── COLUNA DIREITA: OS · Assinatura */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto' }}>

          {/* Dados da OS */}
          <div style={card}>
            <div style={cardTitle}><span>📋</span> Dados da OS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

              {/* Sintomas */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Sintomas relatados</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {SINTOMAS.map(s => (
                    <button key={s} type="button" onClick={() => toggleSintoma(s)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid', background: sintomasSelecionados.includes(s) ? '#6366f1' : '#f8fafc', color: sintomasSelecionados.includes(s) ? '#fff' : '#475569', borderColor: sintomasSelecionados.includes(s) ? '#6366f1' : '#e2e8f0' }}>{s}</button>
                  ))}
                </div>
              </div>

              {/* Produto / peça */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Produto / peça a utilizar</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inp, background: produtoSelecionado ? '#f0fdf4' : '#fff', borderColor: produtoSelecionado ? '#86efac' : '#e2e8f0' }} value={produtoSearch} onChange={e => onProdutoSearchChange(e.target.value)} placeholder="Buscar peça ou produto no estoque..." />
                  {produtoSelecionado && (
                    <button type="button" onClick={() => { setProdutoSelecionado(null); setProdutoSearch(''); setNovoProduto(false) }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>×</button>
                  )}
                  {produtoResults.length > 0 && !produtoSelecionado && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 4, overflow: 'hidden' }}>
                      {produtoResults.map(p => (
                        <button key={p.id} type="button" onClick={() => selecionarProduto(p)} style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 12, color: '#1e293b' }}>
                          <span style={{ fontWeight: 500 }}>{p.nome}</span>
                          {p.categoria && <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8' }}>{p.categoria}</span>}
                          <span style={{ float: 'right', fontSize: 11, color: '#059669', fontWeight: 600 }}>R$ {p.preco_venda.toFixed(2)}</span>
                        </button>
                      ))}
                      <button type="button" onClick={ativarNovoProduto} style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: '#f8fafc', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6366f1', fontWeight: 500 }}>
                        + Cadastrar &quot;{produtoSearch}&quot;
                      </button>
                    </div>
                  )}
                  {produtoSearch.length >= 2 && produtoResults.length === 0 && !produtoSelecionado && !novoProduto && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 4 }}>
                      <button type="button" onClick={ativarNovoProduto} style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6366f1', fontWeight: 500 }}>
                        + Cadastrar &quot;{produtoSearch}&quot;
                      </button>
                    </div>
                  )}
                </div>
                {novoProduto && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 7 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', marginBottom: 8 }}>Novo produto</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Nome *</label><input style={inp} value={nomeProduto} onChange={e => setNomeProduto(e.target.value)} placeholder="Ex: Tela Samsung A54 Incell" /></div>
                      <div><label style={lbl}>Preço de venda (R$)</label><input style={inp} type="number" min="0" step="0.01" value={precoProduto} onChange={e => setPrecoProduto(e.target.value)} placeholder="0,00" /></div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Defeito relatado pelo cliente *</label>
                <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={defeito} onChange={e => setDefeito(e.target.value)} placeholder="Descreva o problema relatado pelo cliente..." />
              </div>
              <div>
                <label style={lbl}>Observações internas</label>
                <input style={inp} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Anotações para o técnico..." />
              </div>
              <div>
                <label style={lbl}>Valor do orçamento (R$)</label>
                <input style={inp} type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
              </div>
            </div>
          </div>

          {/* Assinatura */}
          <div style={card}>
            <div style={cardTitle}>Assinatura do cliente</div>
            <p style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>O cliente assina autorizando o serviço e confirmando as informações.</p>
            <div style={{ position: 'relative', display: 'inline-block', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fafafa' }}>
              <canvas ref={clienteSigRef} width={460} height={80} style={{ display: 'block', cursor: 'crosshair', borderRadius: 7 }}
                onMouseDown={onSigDown} onMouseMove={onSigMove} onMouseUp={onSigUp} onMouseLeave={onSigUp} />
              {!assinaturaCliente && <p style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#cbd5e1', fontSize: 11, pointerEvents: 'none', userSelect: 'none' }}>Assinar aqui...</p>}
            </div>
            {assinaturaCliente && <button onClick={limparSig} style={{ marginLeft: 8, fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Limpar</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
