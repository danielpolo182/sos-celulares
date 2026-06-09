'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { searchByModel, searchByTAC, validateIMEI, suggestRepair, type ModelSpec, type RepairSuggestion } from '@/lib/tac-database'

// ─── Types ───────────────────────────────────────────────────
type Cliente = { id: string; nome: string; telefone: string | null; cpf: string | null; data_nascimento: string | null }

type PatternCell = number // order drawn (0 = not drawn)

const DISPLAY_TYPES = ['AMOLED', 'Super AMOLED', 'OLED', 'IPS LCD', 'LCD', 'TFT'] as const

const SINTOMAS = [
  'Sem imagem', 'Tela preta', 'Tela trincada', 'Vidro quebrado',
  'Não carrega', 'Carregando lento', 'Não liga', 'Desligando sozinho',
  'Sem áudio', 'Som baixo', 'Câmera', 'Molhado', 'Caiu na água',
  'Falante', 'Foto',
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

  const SIZE = 180
  const COLS = 3
  const PAD = 30
  const STEP = (SIZE - PAD * 2) / (COLS - 1)

  function dotPos(i: number) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    return { x: PAD + col * STEP, y: PAD + row * STEP }
  }

  function nearestDot(x: number, y: number): number | null {
    for (let i = 0; i < 9; i++) {
      const p = dotPos(i)
      if (Math.hypot(x - p.x, y - p.y) < 18) return i
    }
    return null
  }

  function getSVGPos(e: React.MouseEvent | React.TouchEvent) {
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    const scaleX = SIZE / rect.width
    const scaleY = SIZE / rect.height
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  function onStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const pos = getSVGPos(e)
    const dot = nearestDot(pos.x, pos.y)
    if (dot !== null) {
      onChange([dot])
      setDrawing(true)
      setMousePos(pos)
    }
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing) return
    const pos = getSVGPos(e)
    setMousePos(pos)
    const dot = nearestDot(pos.x, pos.y)
    if (dot !== null && !value.includes(dot)) {
      onChange([...value, dot])
    }
  }

  function onEnd() { setDrawing(false) }

  function clear(e: React.MouseEvent) {
    e.preventDefault()
    onChange([])
    setDrawing(false)
  }

  return (
    <div style={{ userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width={SIZE} height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ background: '#0f172a', borderRadius: 12, cursor: 'crosshair', touchAction: 'none', display: 'block' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      >
        {/* Lines between drawn dots */}
        {value.map((dot, idx) => {
          if (idx === 0) return null
          const from = dotPos(value[idx - 1])
          const to = dotPos(dot)
          return <line key={idx} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6366f1" strokeWidth="2" opacity="0.8" />
        })}
        {/* Line from last dot to mouse */}
        {drawing && value.length > 0 && (() => {
          const last = dotPos(value[value.length - 1])
          return <line x1={last.x} y1={last.y} x2={mousePos.x} y2={mousePos.y} stroke="#6366f1" strokeWidth="2" opacity="0.4" strokeDasharray="4 2" />
        })()}
        {/* Dots */}
        {Array.from({ length: 9 }, (_, i) => {
          const p = dotPos(i)
          const order = value.indexOf(i)
          const drawn = order !== -1
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={12} fill={drawn ? '#6366f1' : '#1e293b'} stroke={drawn ? '#818cf8' : '#334155'} strokeWidth="1.5" />
              <circle cx={p.x} cy={p.y} r={4} fill={drawn ? '#fff' : '#475569'} />
              {drawn && (
                <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize="9" fill="#818cf8" fontFamily="monospace">
                  {order + 1}
                </text>
              )}
            </g>
          )
        })}
        {/* Arrow on lines */}
        {value.map((dot, idx) => {
          if (idx === 0) return null
          const from = dotPos(value[idx - 1])
          const to = dotPos(dot)
          const mx = (from.x + to.x) / 2
          const my = (from.y + to.y) / 2
          const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI
          return (
            <g key={`arrow-${idx}`} transform={`translate(${mx},${my}) rotate(${angle})`}>
              <polygon points="-4,-3 4,0 -4,3" fill="#6366f1" opacity="0.9" />
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {value.length === 0 ? 'Desenhe o padrão' : `${value.length} ponto${value.length > 1 ? 's' : ''}: ${value.map(v => v + 1).join(' → ')}`}
        </span>
        {value.length > 0 && (
          <button onMouseDown={clear} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Limpar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── USB Reading Component ───────────────────────────────────
type USBReading = '0' | '0.6' | '0.6-3.0' | 'above3'
const USB_OPTIONS: { value: USBReading; label: string; color: string }[] = [
  { value: '0',        label: '0A — Sem leitura',       color: '#ef4444' },
  { value: '0.6',      label: '0.6A — Carregando lento', color: '#f59e0b' },
  { value: '0.6-3.0',  label: '0.6–3.0A — Normal',      color: '#10b981' },
  { value: 'above3',   label: '>3.0A — Curto/anormal',   color: '#8b5cf6' },
]

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
  const [displayEscolhido, setDisplayEscolhido] = useState<string>('')
  const [imei, setImei] = useState('')
  const [imeiValido, setImeiValido] = useState<boolean | null>(null)
  const [cor, setCor] = useState('')
  const [acessorios, setAcessorios] = useState<string[]>([])
  const modeloTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Senha
  const [tipoSenha, setTipoSenha] = useState<'nenhuma' | 'pin' | 'senha' | 'padrao'>('nenhuma')
  const [senhaValor, setSenhaValor] = useState('')
  const [padrao, setPadrao] = useState<number[]>([])

  // ── Diagnóstico
  const [sintomasSelecionados, setSintomasSelecionados] = useState<string[]>([])
  const [apresentaImagem, setApresentaImagem] = useState<boolean | null>(null)
  const [usbReading, setUsbReading] = useState<USBReading | null>(null)
  const [botaoPower, setBotaoPower] = useState<boolean | null>(null)
  const [touchFunciona, setTouchFunciona] = useState<boolean | null>(null)
  const [sugestoes, setSugestoes] = useState<RepairSuggestion[]>([])
  const [sugestaoAtiva, setSugestaoAtiva] = useState<RepairSuggestion | null>(null)

  // ── OS
  const [defeito, setDefeito] = useState('')
  const [valor, setValor] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    setClienteSearch(v)
    setClienteSelecionado(null)
    setNovoCliente(false)
    if (clienteTimer.current) clearTimeout(clienteTimer.current)
    clienteTimer.current = setTimeout(() => buscarCliente(v), 250)
  }

  function selecionarCliente(c: Cliente) {
    setClienteSelecionado(c)
    setClienteSearch(c.nome)
    setClienteResults([])
    setNovoCliente(false)
  }

  function ativarNovoCliente() {
    setNomeCliente(clienteSearch)
    setNovoCliente(true)
    setClienteResults([])
    setClienteSelecionado(null)
  }

  // ─── Busca modelo
  function onModeloChange(v: string) {
    setModeloSearch(v)
    setModeloSelecionado(null)
    if (modeloTimer.current) clearTimeout(modeloTimer.current)
    modeloTimer.current = setTimeout(() => {
      setModeloResults(searchByModel(v))
    }, 200)
  }

  function selecionarModelo(m: ModelSpec) {
    setModeloSelecionado(m)
    setModeloSearch(`${m.marca} ${m.modelo}`)
    setDisplayEscolhido(m.displayTipo)
    setModeloResults([])
  }

  // ─── IMEI
  function onIMEIChange(v: string) {
    const raw = v.replace(/\D/g, '').slice(0, 15)
    setImei(raw)
    if (raw.length === 15) {
      const valid = validateIMEI(raw)
      setImeiValido(valid)
      if (valid) {
        const tac = raw.slice(0, 8)
        const spec = searchByTAC(tac)
        if (spec && !modeloSelecionado) selecionarModelo(spec)
      }
    } else {
      setImeiValido(null)
    }
  }

  // ─── Diagnóstico → sugestão
  function toggleSintoma(s: string) {
    const next = sintomasSelecionados.includes(s)
      ? sintomasSelecionados.filter(x => x !== s)
      : [...sintomasSelecionados, s]
    setSintomasSelecionados(next)

    const allSintomas = [...next]
    if (apresentaImagem === false) allSintomas.push('sem imagem')
    if (usbReading === '0') allSintomas.push('não carrega')

    if (allSintomas.length > 0 && modeloSelecionado) {
      const s = suggestRepair(allSintomas, modeloSelecionado.modelo, modeloSelecionado.marca)
      setSugestoes(s)
      if (!sugestaoAtiva && s.length > 0) {
        setSugestaoAtiva(s[0])
        setValor(String(Math.round((s[0].valorMin + s[0].valorMax) / 2)))
        if (!defeito) setDefeito(s[0].problema)
      }
    }
  }

  function aplicarSugestao(s: RepairSuggestion) {
    setSugestaoAtiva(s)
    setValor(String(Math.round((s.valorMin + s.valorMax) / 2)))
    if (!defeito) setDefeito(s.problema)
  }

  // ─── Salvar OS
  async function salvar() {
    if (!clienteSelecionado && !nomeCliente.trim()) { setError('Informe o cliente.'); return }
    if (!defeito.trim()) { setError('Informe o defeito relatado.'); return }
    setSaving(true)
    setError('')

    let clienteId = clienteSelecionado?.id ?? null

    if (novoCliente && nomeCliente.trim()) {
      const { data } = await supabase.from('clientes').insert({
        nome: nomeCliente.trim(),
        telefone: telefoneCliente.replace(/\D/g, '') || null,
        cpf: cpfCliente.replace(/\D/g, '') || null,
        data_nascimento: nascCliente || null,
      }).select('id').single()
      clienteId = data?.id ?? null
    }

    const senhaInfo = tipoSenha === 'padrao'
      ? JSON.stringify({ tipo: 'padrao', sequencia: padrao })
      : tipoSenha !== 'nenhuma' ? JSON.stringify({ tipo: tipoSenha, valor: senhaValor }) : null

    const { error: err } = await supabase.from('ordens_servico').insert({
      cliente_id: clienteId,
      imei: imei || null,
      tac: imei ? imei.slice(0, 8) : null,
      marca: modeloSelecionado?.marca ?? null,
      modelo: modeloSelecionado ? `${modeloSelecionado.marca} ${modeloSelecionado.modelo}` : modeloSearch || null,
      cor: cor || null,
      acessorios: acessorios.length > 0 ? acessorios : null,
      senha_aparelho: senhaInfo,
      defeito_relatado: defeito.trim(),
      valor_orcamento: valor ? parseFloat(valor) : null,
      observacoes: observacoes || null,
      status: 'aberta',
    })

    if (err) { setError(`Erro: ${err.message}`); setSaving(false); return }

    // Emit event
    await supabase.from('events').insert({
      type: 'OS_CRIADA', entity: 'os',
      payload: { clienteId, defeito, modelo: modeloSelecionado?.modelo },
    })

    router.push('/os')
  }

  // ─── Styles
  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
    borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff',
    outline: 'none', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }
  const section: React.CSSProperties = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: '20px 24px', marginBottom: 16,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 16,
    paddingBottom: 10, borderBottom: '1px solid #f1f5f9',
    display: 'flex', alignItems: 'center', gap: 8,
  }

  const ACESSORIOS_LIST = ['Capinha', 'Película', 'Carregador', 'Cabo USB', 'Fone', 'Caixa']

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', width: '100%' }}>

      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>←</button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Nova Ordem de Serviço</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Preencha os dados do atendimento</p>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── 1. CLIENTE */}
      <div style={section}>
        <div style={sectionTitle}><span>👤</span> Cliente</div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <label style={lbl}>Buscar cliente por nome, CPF ou telefone</label>
          <input
            style={inp}
            value={clienteSearch}
            onChange={e => onClienteSearchChange(e.target.value)}
            placeholder="Digite para buscar..."
            autoComplete="off"
          />
          {clienteResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden', marginTop: 4,
            }}>
              {clienteResults.map(c => (
                <div key={c.id} onClick={() => selecionarCliente(c)} style={{
                  padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid #f1f5f9',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.nome}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {[c.telefone ? formatPhone(c.telefone) : null, c.cpf ? formatCPF(c.cpf) : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
              <div onClick={ativarNovoCliente} style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: '#6366f1', fontWeight: 500,
                background: '#f8f7ff', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>+</span> Cadastrar &quot;{clienteSearch}&quot; como novo cliente
              </div>
            </div>
          )}
          {clienteSearch.length >= 2 && clienteResults.length === 0 && !clienteSelecionado && !novoCliente && (
            <div style={{ marginTop: 8 }}>
              <button onClick={ativarNovoCliente} style={{
                fontSize: 13, color: '#6366f1', background: '#f5f3ff', border: '1px solid #e0e7ff',
                borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontWeight: 500,
              }}>+ Cadastrar como novo cliente</button>
            </div>
          )}
        </div>

        {clienteSelecionado && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#065f46' }}>{clienteSelecionado.nome}</div>
              <div style={{ fontSize: 11, color: '#059669' }}>
                {[clienteSelecionado.telefone ? formatPhone(clienteSelecionado.telefone) : null, clienteSelecionado.cpf ? formatCPF(clienteSelecionado.cpf) : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button onClick={() => { setClienteSelecionado(null); setClienteSearch('') }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}

        {novoCliente && (
          <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8, padding: 14, marginTop: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#92400e', marginBottom: 10 }}>NOVO CLIENTE — apenas nome é obrigatório</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Nome *</label>
                <input style={inp} value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <label style={lbl}>Telefone</label>
                <input style={inp} value={telefoneCliente} onChange={e => setTelefoneCliente(formatPhone(e.target.value))} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label style={lbl}>CPF</label>
                <input style={inp} value={cpfCliente} onChange={e => setCpfCliente(formatCPF(e.target.value))} placeholder="000.000.000-00" />
              </div>
              <div>
                <label style={lbl}>Data de nascimento</label>
                <input style={inp} type="date" value={nascCliente} onChange={e => setNascCliente(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. APARELHO */}
      <div style={section}>
        <div style={sectionTitle}><span>📱</span> Aparelho</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Modelo */}
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Modelo</label>
            <input style={inp} value={modeloSearch} onChange={e => onModeloChange(e.target.value)} placeholder="Ex: A32, iPhone 13, Moto G52..." autoComplete="off" />
            {modeloResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden', marginTop: 4 }}>
                {modeloResults.map((m, i) => (
                  <div key={i} onClick={() => selecionarModelo(m)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <div style={{ fontWeight: 500, color: '#0f172a' }}>{m.marca} {m.modelo}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {m.display} · {m.displayTipo} · {m.bateria} · {m.ram} RAM
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* IMEI */}
          <div>
            <label style={lbl}>IMEI <span style={{ fontWeight: 400, color: '#94a3b8' }}>(digitar *#06# no aparelho)</span></label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inp, paddingRight: 32, borderColor: imeiValido === false ? '#ef4444' : imeiValido === true ? '#10b981' : '#e2e8f0' }}
                value={imei} onChange={e => onIMEIChange(e.target.value)}
                placeholder="000000000000000" maxLength={15}
              />
              {imeiValido !== null && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>
                  {imeiValido ? '✅' : '❌'}
                </span>
              )}
            </div>
            {imeiValido === false && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>IMEI inválido</p>}
            {imeiValido === true && !modeloSelecionado && <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>TAC {imei.slice(0, 8)} — modelo não encontrado na base local</p>}
          </div>

          {/* Cor */}
          <div>
            <label style={lbl}>Cor</label>
            <input style={inp} value={cor} onChange={e => setCor(e.target.value)} placeholder="Preto, Branco, Azul..." />
          </div>

          {/* Acessórios */}
          <div>
            <label style={lbl}>Acessórios que vieram junto</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              {ACESSORIOS_LIST.map(a => (
                <button key={a} onClick={() => setAcessorios(ac => ac.includes(a) ? ac.filter(x => x !== a) : [...ac, a])} style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 20,
                  border: '1px solid', cursor: 'pointer',
                  background: acessorios.includes(a) ? '#e0e7ff' : '#f8fafc',
                  color: acessorios.includes(a) ? '#3730a3' : '#64748b',
                  borderColor: acessorios.includes(a) ? '#c7d2fe' : '#e2e8f0',
                }}>{a}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Especificações do modelo */}
        {modeloSelecionado && (
          <div style={{ marginTop: 16, background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 10 }}>ESPECIFICAÇÕES DO MODELO</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Display', value: modeloSelecionado.display },
                { label: 'Original', value: modeloSelecionado.displayTipo },
                { label: 'Bateria', value: modeloSelecionado.bateria },
                { label: 'Processador', value: modeloSelecionado.processador },
              ].map(s => (
                <div key={s.label} style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <label style={lbl}>Display que será utilizado no reparo</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DISPLAY_TYPES.map(d => {
                const isOriginal = d === modeloSelecionado.displayTipo
                const isSelected = displayEscolhido === d
                return (
                  <button key={d} onClick={() => setDisplayEscolhido(d)} style={{
                    fontSize: 12, padding: '5px 12px', borderRadius: 20,
                    border: '1px solid', cursor: 'pointer',
                    background: isSelected ? '#e0e7ff' : '#fff',
                    color: isSelected ? '#3730a3' : '#64748b',
                    borderColor: isSelected ? '#818cf8' : '#e2e8f0',
                    position: 'relative',
                  }}>
                    {d}
                    {isOriginal && <span style={{ marginLeft: 4, fontSize: 10, color: '#10b981', fontWeight: 600 }}>●original</span>}
                    {isSelected && !isOriginal && <span style={{ marginLeft: 4, fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>⚠ inferior</span>}
                  </button>
                )
              })}
            </div>
            {displayEscolhido && displayEscolhido !== modeloSelecionado.displayTipo && (
              <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, background: '#fffbeb', padding: '6px 10px', borderRadius: 6 }}>
                ⚠ Cliente optou por qualidade inferior à original ({modeloSelecionado.displayTipo}). Isso ficará registrado na OS.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 3. SENHA */}
      <div style={section}>
        <div style={sectionTitle}><span>🔐</span> Senha do aparelho</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['nenhuma', 'pin', 'senha', 'padrao'] as const).map(t => (
            <button key={t} onClick={() => setTipoSenha(t)} style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
              border: '1px solid', fontWeight: tipoSenha === t ? 500 : 400,
              background: tipoSenha === t ? '#e0e7ff' : '#fff',
              color: tipoSenha === t ? '#3730a3' : '#64748b',
              borderColor: tipoSenha === t ? '#818cf8' : '#e2e8f0',
            }}>
              {t === 'nenhuma' ? 'Sem senha' : t === 'pin' ? 'PIN' : t === 'senha' ? 'Senha' : 'Padrão'}
            </button>
          ))}
        </div>

        {(tipoSenha === 'pin' || tipoSenha === 'senha') && (
          <div style={{ maxWidth: 260 }}>
            <label style={lbl}>{tipoSenha === 'pin' ? 'Código PIN' : 'Senha'}</label>
            <input
              style={inp}
              type={tipoSenha === 'pin' ? 'number' : 'text'}
              value={senhaValor}
              onChange={e => setSenhaValor(e.target.value)}
              placeholder={tipoSenha === 'pin' ? '0000' : 'Digite a senha'}
            />
          </div>
        )}

        {tipoSenha === 'padrao' && (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <PatternLock value={padrao} onChange={setPadrao} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 500 }}>COMO USAR</p>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                Clique e arraste sobre as bolinhas para desenhar o padrão de desbloqueio. Os números indicam a ordem dos pontos. As setas mostram a direção do traço.
              </p>
              {padrao.length > 0 && (
                <div style={{ marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
                  <p style={{ fontSize: 11, color: '#64748b' }}>Sequência registrada:</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', fontFamily: 'monospace' }}>
                    {padrao.map(p => p + 1).join(' → ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 4. DIAGNÓSTICO INICIAL */}
      <div style={section}>
        <div style={sectionTitle}><span>🔬</span> Diagnóstico inicial</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Apresenta imagem */}
          <div>
            <label style={lbl}>Apresenta imagem?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ v: true, l: '✅ Sim' }, { v: false, l: '❌ Não' }].map(({ v, l }) => (
                <button key={String(v)} onClick={() => { setApresentaImagem(v); if (!v) toggleSintoma('sem imagem') }} style={{
                  flex: 1, padding: '8px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid',
                  background: apresentaImagem === v ? '#e0e7ff' : '#fff',
                  color: apresentaImagem === v ? '#3730a3' : '#64748b',
                  borderColor: apresentaImagem === v ? '#818cf8' : '#e2e8f0',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Botão power */}
          <div>
            <label style={lbl}>Botão power responde?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ v: true, l: '✅ Sim' }, { v: false, l: '❌ Não' }].map(({ v, l }) => (
                <button key={String(v)} onClick={() => setBotaoPower(v)} style={{
                  flex: 1, padding: '8px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid',
                  background: botaoPower === v ? '#e0e7ff' : '#fff',
                  color: botaoPower === v ? '#3730a3' : '#64748b',
                  borderColor: botaoPower === v ? '#818cf8' : '#e2e8f0',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Touch */}
          <div>
            <label style={lbl}>Touch funciona?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ v: true, l: '✅ Sim' }, { v: false, l: '❌ Não' }].map(({ v, l }) => (
                <button key={String(v)} onClick={() => setTouchFunciona(v)} style={{
                  flex: 1, padding: '8px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid',
                  background: touchFunciona === v ? '#e0e7ff' : '#fff',
                  color: touchFunciona === v ? '#3730a3' : '#64748b',
                  borderColor: touchFunciona === v ? '#818cf8' : '#e2e8f0',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* USB */}
          <div>
            <label style={lbl}>Leitura USB (amperímetro)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {USB_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => { setUsbReading(opt.value); if (opt.value === '0') toggleSintoma('não carrega') }} style={{
                  padding: '7px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  border: `1px solid`, textAlign: 'left',
                  background: usbReading === opt.value ? opt.color + '20' : '#fff',
                  color: usbReading === opt.value ? opt.color : '#64748b',
                  borderColor: usbReading === opt.value ? opt.color : '#e2e8f0',
                  fontWeight: usbReading === opt.value ? 500 : 400,
                }}>{opt.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Sintomas */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Sintomas observados</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SINTOMAS.map(s => (
              <button key={s} onClick={() => toggleSintoma(s)} style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid',
                background: sintomasSelecionados.includes(s) ? '#e0e7ff' : '#f8fafc',
                color: sintomasSelecionados.includes(s) ? '#3730a3' : '#64748b',
                borderColor: sintomasSelecionados.includes(s) ? '#818cf8' : '#e2e8f0',
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Sugestões */}
        {sugestoes.length > 0 && (
          <div style={{ background: '#f8f7ff', border: '1px solid #e0e7ff', borderRadius: 8, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#4338ca', marginBottom: 10 }}>💡 Sugestões de reparo (baseado no histórico)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sugestoes.map((s, i) => (
                <button key={i} onClick={() => aplicarSugestao(s)} style={{
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: sugestaoAtiva === s ? '#e0e7ff' : '#fff',
                  borderColor: sugestaoAtiva === s ? '#818cf8' : '#e2e8f0',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{s.sugestao}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.problema} · confiança {s.confianca}%</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>
                      R$ {s.valorMin}–{s.valorMax}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>estimado</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 5. OS */}
      <div style={section}>
        <div style={sectionTitle}><span>📋</span> Dados da OS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={lbl}>Defeito relatado pelo cliente *</label>
            <textarea
              style={{ ...inp, minHeight: 80, resize: 'vertical' }}
              value={defeito} onChange={e => setDefeito(e.target.value)}
              placeholder="Descreva o problema relatado pelo cliente..."
            />
          </div>
          <div>
            <label style={lbl}>Valor do orçamento (R$)</label>
            <input style={inp} type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
            {sugestaoAtiva && (
              <p style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>
                Sugerido: R$ {sugestaoAtiva.valorMin}–{sugestaoAtiva.valorMax}
              </p>
            )}
          </div>
          <div>
            <label style={lbl}>Observações internas</label>
            <input style={inp} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Anotações para o técnico..." />
          </div>
        </div>
      </div>

      {/* ── Botões */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={() => router.back()} style={{
          padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8,
          fontSize: 14, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#374151',
        }}>Cancelar</button>
        <button onClick={salvar} disabled={saving} style={{
          padding: '10px 28px', background: saving ? '#a5b4fc' : '#6366f1',
          color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '-0.01em',
        }}>{saving ? 'Salvando...' : 'Abrir OS'}</button>
      </div>
    </div>
  )
}
