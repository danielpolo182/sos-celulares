'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type OS = {
  id: string
  numero: number
  status: string
  marca: string | null
  modelo: string | null
  imei: string | null
  cor: string | null
  acessorios: string[] | null
  senha_aparelho: string | null
  defeito_relatado: string
  defeito_tecnico: string | null
  solucao: string | null
  valor_orcamento: number | null
  valor_final: number | null
  desconto: number | null
  forma_pagamento: string | null
  pago: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
  clientes: { id: string; nome: string; telefone: string | null; cpf: string | null } | null
}

const STATUS_FLOW = ['aberta', 'em_andamento', 'pronta', 'entregue']
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  aberta:       { label: 'Aberta',        bg: '#eff6ff', color: '#1d4ed8', icon: '📋' },
  em_andamento: { label: 'Em andamento',  bg: '#fef3c7', color: '#92400e', icon: '🔧' },
  pronta:       { label: 'Pronta',        bg: '#ecfdf5', color: '#065f46', icon: '✅' },
  entregue:     { label: 'Entregue',      bg: '#f0fdf4', color: '#14532d', icon: '📦' },
  cancelada:    { label: 'Cancelada',     bg: '#fef2f2', color: '#991b1b', icon: '❌' },
}

const PAGAMENTOS = ['Dinheiro', 'PIX', 'Cartão débito', 'Cartão crédito', 'Transferência']

function formatPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
}

function parseSenha(raw: string | null) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function PatternDisplay({ sequencia }: { sequencia: number[] }) {
  const SIZE = 120
  const PAD = 20
  const STEP = (SIZE - PAD * 2) / 2

  function dotPos(i: number) {
    return { x: PAD + (i % 3) * STEP, y: PAD + Math.floor(i / 3) * STEP }
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ background: '#0f172a', borderRadius: 8 }}>
      {sequencia.map((dot, idx) => {
        if (idx === 0) return null
        const from = dotPos(sequencia[idx - 1])
        const to = dotPos(dot)
        return <line key={idx} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6366f1" strokeWidth="1.5" opacity="0.8" />
      })}
      {Array.from({ length: 9 }, (_, i) => {
        const p = dotPos(i)
        const order = sequencia.indexOf(i)
        const drawn = order !== -1
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={8} fill={drawn ? '#6366f1' : '#1e293b'} stroke={drawn ? '#818cf8' : '#334155'} strokeWidth="1" />
            <circle cx={p.x} cy={p.y} r={3} fill={drawn ? '#fff' : '#475569'} />
          </g>
        )
      })}
    </svg>
  )
}

export default function OSDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const [os, setOs] = useState<OS | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [status, setStatus] = useState('')
  const [defeitoTecnico, setDefeitoTecnico] = useState('')
  const [solucao, setSolucao] = useState('')
  const [valorFinal, setValorFinal] = useState('')
  const [desconto, setDesconto] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [pago, setPago] = useState(false)
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('ordens_servico')
        .select('*,clientes(id,nome,telefone,cpf)')
        .eq('id', id)
        .single()
      if (data) {
        const d = data as unknown as OS
        setOs(d)
        setStatus(d.status)
        setDefeitoTecnico(d.defeito_tecnico ?? '')
        setSolucao(d.solucao ?? '')
        setValorFinal(d.valor_final ? String(d.valor_final) : d.valor_orcamento ? String(d.valor_orcamento) : '')
        setDesconto(d.desconto ? String(d.desconto) : '')
        setFormaPagamento(d.forma_pagamento ?? '')
        setPago(d.pago ?? false)
        setObservacoes(d.observacoes ?? '')
      }
      setLoading(false)
    }
    load()
  }, [id, supabase])

  async function salvar() {
    setSaving(true)
    const { error } = await supabase.from('ordens_servico').update({
      status,
      defeito_tecnico: defeitoTecnico || null,
      solucao: solucao || null,
      valor_final: valorFinal ? parseFloat(valorFinal) : null,
      desconto: desconto ? parseFloat(desconto) : 0,
      forma_pagamento: formaPagamento || null,
      pago,
      observacoes: observacoes || null,
      entregue_em: status === 'entregue' && os?.status !== 'entregue' ? new Date().toISOString() : undefined,
    }).eq('id', id)

    if (!error) {
      await supabase.from('events').insert({
        type: 'OS_ATUALIZADA', entity: 'os', entity_id: id,
        payload: { status, pago },
      })
      router.refresh()
      const { data } = await supabase.from('ordens_servico').select('*,clientes(id,nome,telefone,cpf)').eq('id', id).single()
      if (data) setOs(data as unknown as OS)
    }
    setSaving(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
    borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff',
    outline: 'none', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando OS...</div>
  if (!os) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>OS não encontrada.</div>

  const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
  const senha = parseSenha(os.senha_aparelho)
  const valorTotal = valorFinal ? (parseFloat(valorFinal) - (parseFloat(desconto) || 0)) : null

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>←</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em' }}>OS #{os.numero}</h1>
              <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.icon} {st.label}</span>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              Aberta em {new Date(os.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <button onClick={salvar} disabled={saving} style={{
          padding: '10px 24px', background: saving ? '#a5b4fc' : '#6366f1',
          color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
      </div>

      {/* Status flow */}
      <div style={card}>
        <div style={cardTitle}><span>📊</span> Status da OS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {STATUS_FLOW.map((s, i) => {
            const cfg = STATUS_CONFIG[s]
            const current = status === s
            const past = STATUS_FLOW.indexOf(status) > i
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <button onClick={() => setStatus(s)} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 8, border: '1px solid',
                  cursor: 'pointer', fontSize: 12, fontWeight: current ? 600 : 400,
                  background: current ? cfg.bg : past ? '#f0fdf4' : '#f8fafc',
                  color: current ? cfg.color : past ? '#065f46' : '#94a3b8',
                  borderColor: current ? cfg.color : past ? '#86efac' : '#e2e8f0',
                  textAlign: 'center', transition: 'all 0.15s',
                }}>
                  <div>{cfg.icon}</div>
                  <div style={{ marginTop: 2 }}>{cfg.label}</div>
                </button>
                {i < STATUS_FLOW.length - 1 && (
                  <div style={{ width: 20, height: 1, background: past ? '#86efac' : '#e2e8f0', flexShrink: 0 }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Cliente */}
        <div style={card}>
          <div style={cardTitle}><span>👤</span> Cliente</div>
          {os.clientes ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600 }}>
                  {os.clientes.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{os.clientes.nome}</div>
                  {os.clientes.telefone && <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatPhone(os.clientes.telefone)}</div>}
                </div>
              </div>
            </div>
          ) : <p style={{ fontSize: 13, color: '#94a3b8' }}>Cliente não identificado</p>}
        </div>

        {/* Aparelho */}
        <div style={card}>
          <div style={cardTitle}><span>📱</span> Aparelho</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Modelo', value: os.modelo },
              { label: 'IMEI', value: os.imei },
              { label: 'Cor', value: os.cor },
              { label: 'Acessórios', value: os.acessorios?.join(', ') },
            ].map(r => r.value ? (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{r.value}</span>
              </div>
            ) : null)}
            {senha && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Senha</span>
                {senha.tipo === 'padrao' ? (
                  <PatternDisplay sequencia={senha.sequencia} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', background: '#f1f5f9', padding: '4px 10px', borderRadius: 6 }}>
                    {senha.tipo === 'pin' ? 'PIN: ' : ''}{senha.valor}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Defeito */}
        <div style={card}>
          <div style={cardTitle}><span>🔬</span> Defeito e diagnóstico</div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Defeito relatado pelo cliente</label>
            <div style={{ fontSize: 13, color: '#1e293b', background: '#f8fafc', padding: '9px 12px', borderRadius: 7 }}>{os.defeito_relatado}</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Defeito técnico (diagnóstico)</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={defeitoTecnico} onChange={e => setDefeitoTecnico(e.target.value)} placeholder="Diagnóstico técnico detalhado..." />
          </div>
          <div>
            <label style={lbl}>Solução aplicada</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={solucao} onChange={e => setSolucao(e.target.value)} placeholder="Descreva o que foi feito..." />
          </div>
        </div>

        {/* Financeiro */}
        <div style={card}>
          <div style={cardTitle}><span>💰</span> Financeiro</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={lbl}>Orçamento inicial</label>
              <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', padding: '9px 12px', borderRadius: 7 }}>
                {os.valor_orcamento ? `R$ ${os.valor_orcamento.toFixed(2).replace('.', ',')}` : 'Não informado'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Valor final (R$)</label>
                <input style={inp} type="number" value={valorFinal} onChange={e => setValorFinal(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label style={lbl}>Desconto (R$)</label>
                <input style={inp} type="number" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            {valorTotal !== null && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#065f46' }}>Total a cobrar</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#065f46' }}>R$ {valorTotal.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            <div>
              <label style={lbl}>Forma de pagamento</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PAGAMENTOS.map(p => (
                  <button key={p} onClick={() => setFormaPagamento(p)} style={{
                    fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid',
                    background: formaPagamento === p ? '#e0e7ff' : '#f8fafc',
                    color: formaPagamento === p ? '#3730a3' : '#64748b',
                    borderColor: formaPagamento === p ? '#818cf8' : '#e2e8f0',
                  }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                onClick={() => setPago(!pago)}
                style={{
                  width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                  background: pago ? '#6366f1' : '#e2e8f0',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 3, left: pago ? 23 : 3,
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: pago ? '#065f46' : '#64748b' }}>
                {pago ? '✅ Pagamento confirmado' : 'Aguardando pagamento'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Observações */}
      <div style={card}>
        <div style={cardTitle}><span>📝</span> Observações internas</div>
        <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Anotações internas, histórico de atendimento..." />
      </div>

      {/* Botão salvar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={salvar} disabled={saving} style={{
          padding: '11px 28px', background: saving ? '#a5b4fc' : '#6366f1',
          color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
      </div>
    </div>
  )
}
