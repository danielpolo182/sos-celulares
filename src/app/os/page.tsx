'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type OS = {
  id: string
  numero: number
  status: string
  marca: string | null
  modelo: string | null
  defeito_relatado: string
  valor_orcamento: number | null
  created_at: string
  clientes: { nome: string; telefone: string | null } | null
}

type Pendencia = {
  id: string
  numero: number
  status: string
  modelo: string | null
  defeito_relatado: string
  valor_orcamento: number | null
  snooze_ate: string | null
  wa_enviado: Record<string, boolean>
  clientes: { nome: string; telefone: string | null } | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  aberta:       { label: 'Aberta',       bg: '#eff6ff', color: '#1d4ed8', icon: '📋' },
  em_andamento: { label: 'Em andamento', bg: '#fef3c7', color: '#92400e', icon: '🔧' },
  pronta:       { label: 'Pronta',       bg: '#ecfdf5', color: '#065f46', icon: '✅' },
  entregue:     { label: 'Entregue',     bg: '#f0fdf4', color: '#14532d', icon: '📦' },
  cancelada:    { label: 'Cancelada',    bg: '#fef2f2', color: '#991b1b', icon: '❌' },
}

const WA_MENSAGENS: Record<string, string> = {
  aberta: 'Olá, {nome}! 😊 Seu aparelho *{modelo}* foi recebido.\n\n🔧 *OS Nº {numero}*\nDefeito: {defeito}\n\nEm breve teremos novidades!',
  em_andamento: 'Olá, {nome}! 👋 Sua *OS Nº {numero}* está em andamento. Já estamos trabalhando no seu *{modelo}*!',
  pronta: 'Olá, {nome}! 🎉 Seu *{modelo}* está *PRONTO* para retirada!\n\n*OS Nº {numero}*\n💰 Valor: R$ {valor}\n\nAguardamos você!',
  entregue: 'Olá, {nome}! Confirmando a entrega do seu *{modelo}*. Obrigado pela confiança! 🙏',
}

function gerarMensagem(status: string, os: Pendencia) {
  const nome = os.clientes?.nome?.split(' ')[0] ?? 'cliente'
  return (WA_MENSAGENS[status] ?? '')
    .replace('{nome}', nome)
    .replace(/{numero}/g, String(os.numero))
    .replace(/{modelo}/g, os.modelo ?? 'aparelho')
    .replace('{defeito}', os.defeito_relatado)
    .replace('{valor}', os.valor_orcamento ? os.valor_orcamento.toFixed(2).replace('.', ',') : 'a combinar')
}

function abrirWA(telefone: string | null, msg: string) {
  const num = telefone?.replace(/\D/g, '') ?? ''
  window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
}

export default function OSPage() {
  const supabase = createClient()
  const router = useRouter()
  const [aba, setAba] = useState<'lista' | 'pendencias'>('lista')
  const [items, setItems] = useState<OS[]>([])
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [snoozeModal, setSnoozeModal] = useState<{ id: string; data: string } | null>(null)
  const [waModal, setWaModal] = useState<{ os: Pendencia; status: string } | null>(null)

  const fetchOS = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('ordens_servico')
      .select('id,numero,status,marca,modelo,defeito_relatado,valor_orcamento,created_at,clientes(nome,telefone)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    if (filtroStatus !== 'todos') query = query.eq('status', filtroStatus)
    if (search.trim()) query = query.or(`modelo.ilike.%${search}%,defeito_relatado.ilike.%${search}%`)
    const { data } = await query
    setItems((data as unknown as OS[]) ?? [])
    setLoading(false)
  }, [supabase, filtroStatus, search])

  const fetchPendencias = useCallback(async () => {
    const hoje = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('ordens_servico')
      .select('id,numero,status,modelo,defeito_relatado,valor_orcamento,snooze_ate,wa_enviado,created_at,clientes(nome,telefone)')
      .is('deleted_at', null)
      .neq('status', 'entregue')
      .neq('status', 'cancelada')
      .or(`snooze_ate.is.null,snooze_ate.lte.${hoje}`)
      .order('created_at', { ascending: false })
    setPendencias((data as unknown as Pendencia[]) ?? [])
  }, [supabase])

  useEffect(() => {
    fetchOS()
    fetchPendencias()
  }, [fetchOS, fetchPendencias])

  async function salvarSnooze(id: string, data: string) {
    await supabase.from('ordens_servico').update({ snooze_ate: data || null }).eq('id', id)
    setSnoozeModal(null)
    fetchPendencias()
  }

  async function marcarWAEnviado(os: Pendencia, status: string) {
    const waAtual = os.wa_enviado ?? {}
    const novo = { ...waAtual, [status]: true }
    await supabase.from('ordens_servico').update({ wa_enviado: novo }).eq('id', os.id)
    fetchPendencias()
    setWaModal(null)
  }

  const inp: React.CSSProperties = {
    padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7,
    fontSize: 13, color: '#1e293b', background: '#f8fafc', outline: 'none', fontFamily: 'inherit',
  }

  // ── Dias em aberto
  function diasAberto(created_at: string) {
    const diff = Date.now() - new Date(created_at).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Ordens de Serviço</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{items.length} registros · {pendencias.length} pendências ativas</p>
        </div>
        <Link href="/os/nova" style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
          + Nova OS
        </Link>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {([['lista', '📋 Visão geral'], ['pendencias', `⏳ Pendências (${pendencias.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setAba(key)} style={{
            padding: '10px 18px', fontSize: 13, fontWeight: aba === key ? 600 : 400,
            border: 'none', background: 'none', cursor: 'pointer',
            color: aba === key ? '#6366f1' : '#64748b',
            borderBottom: aba === key ? '2px solid #6366f1' : '2px solid transparent',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* ═══ ABA LISTA ═══ */}
      {aba === 'lista' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <input style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="Buscar por modelo, defeito..." value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ display: 'flex', gap: 6 }}>
              {['todos', 'aberta', 'em_andamento', 'pronta', 'entregue'].map(s => (
                <button key={s} onClick={() => setFiltroStatus(s)} style={{
                  padding: '8px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid',
                  fontWeight: filtroStatus === s ? 500 : 400,
                  background: filtroStatus === s ? '#e0e7ff' : '#fff',
                  color: filtroStatus === s ? '#3730a3' : '#64748b',
                  borderColor: filtroStatus === s ? '#818cf8' : '#e2e8f0',
                }}>{s === 'todos' ? 'Todas' : STATUS_CONFIG[s]?.label}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhuma OS encontrada</p>
              <Link href="/os/nova" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', background: '#6366f1', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>+ Nova OS</Link>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['OS', 'Cliente', 'Aparelho', 'Defeito', 'Valor', 'Status', 'Data'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(os => {
                    const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
                    return (
                      <tr key={os.id} onClick={() => router.push(`/os/${os.id}`)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fafafa' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#6366f1' }}>#{os.numero}</td>
                        <td style={{ padding: '12px 16px', color: '#0f172a' }}>{os.clientes?.nome ?? '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{os.modelo ?? '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{os.defeito_relatado}</td>
                        <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>
                          {os.valor_orcamento ? `R$ ${os.valor_orcamento.toFixed(2).replace('.', ',')}` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{new Date(os.created_at).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ ABA PENDÊNCIAS ═══ */}
      {aba === 'pendencias' && (
        <>
          {pendencias.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Nenhuma pendência!</p>
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Todas as OS estão entregues ou em snooze.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {pendencias.map(os => {
                const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
                const dias = diasAberto(os.created_at)
                const waAtual = os.wa_enviado ?? {}
                const waStatusEnviado = waAtual[os.status] === true

                return (
                  <div key={os.id} style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}>
                    {/* Topo estilo smartphone */}
                    <div style={{
                      background: '#0f172a',
                      padding: '14px 14px 10px',
                      position: 'relative',
                    }}>
                      {/* Notch simulado */}
                      <div style={{ width: 40, height: 5, background: '#1e293b', borderRadius: 3, margin: '0 auto 10px' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>OS #{os.numero}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginTop: 2, lineHeight: 1.2 }}>
                            {os.modelo ?? 'Aparelho'}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: st.bg, color: st.color, flexShrink: 0 }}>
                          {st.icon} {st.label}
                        </span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                        {os.defeito_relatado.slice(0, 60)}{os.defeito_relatado.length > 60 ? '…' : ''}
                      </div>
                      {dias > 0 && (
                        <div style={{ marginTop: 6, fontSize: 10, color: dias > 7 ? '#ef4444' : '#f59e0b', fontWeight: 500 }}>
                          ⏱ {dias} dia{dias > 1 ? 's' : ''} em aberto
                        </div>
                      )}
                    </div>

                    {/* Corpo do card */}
                    <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>

                      {/* Cliente */}
                      <div style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                        👤 {os.clientes?.nome ?? 'Cliente não identificado'}
                      </div>

                      {/* Valor */}
                      {os.valor_orcamento && (
                        <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>
                          💰 R$ {os.valor_orcamento.toFixed(2).replace('.', ',')}
                        </div>
                      )}

                      {/* WhatsApp com confirmação */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => setWaModal({ os, status: os.status })}
                          style={{
                            flex: 1, padding: '6px 8px', borderRadius: 7, border: '1px solid',
                            cursor: 'pointer', fontSize: 11, fontWeight: 500,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            background: waStatusEnviado ? '#f0fdf4' : '#fff',
                            color: waStatusEnviado ? '#065f46' : '#374151',
                            borderColor: waStatusEnviado ? '#86efac' : '#e2e8f0',
                          }}
                        >
                          💬 WhatsApp
                        </button>
                        {waStatusEnviado && (
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#ecfdf5', border: '1px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }} title="Mensagem enviada">
                            ✓
                          </div>
                        )}
                      </div>

                      {/* Snooze */}
                      <div>
                        {os.snooze_ate ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fef3c7', borderRadius: 6, padding: '5px 8px' }}>
                            <span style={{ fontSize: 11, color: '#92400e' }}>
                              😴 Snooze até {new Date(os.snooze_ate + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                            <button onClick={() => salvarSnooze(os.id, '')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#92400e' }}>×</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSnoozeModal({ id: os.id, data: '' })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px dashed #e2e8f0', cursor: 'pointer', fontSize: 11, color: '#94a3b8', background: '#fafafa' }}
                          >
                            😴 Adiar até...
                          </button>
                        )}
                      </div>

                      {/* Abrir OS */}
                      <button
                        onClick={() => router.push(`/os/${os.id}`)}
                        style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid #e0e7ff', cursor: 'pointer', fontSize: 11, fontWeight: 500, color: '#4338ca', background: '#eef2ff' }}
                      >
                        Abrir OS →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ MODAL SNOOZE ═══ */}
      {snoozeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 320 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>😴 Adiar pendência</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>A OS não aparecerá nas pendências até a data escolhida.</p>
            <input
              type="date"
              value={snoozeModal.data}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setSnoozeModal({ ...snoozeModal, data: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSnoozeModal(null)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={() => salvarSnooze(snoozeModal.id, snoozeModal.data)} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL WHATSAPP ═══ */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>💬 Enviar mensagem WhatsApp</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              Para: <strong>{waModal.os.clientes?.nome}</strong> · {waModal.os.clientes?.telefone ?? 'sem telefone'}
            </p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto' }}>
              {gerarMensagem(waModal.status, waModal.os)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setWaModal(null)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button
                onClick={() => {
                  abrirWA(waModal.os.clientes?.telefone ?? null, gerarMensagem(waModal.status, waModal.os))
                  marcarWAEnviado(waModal.os, waModal.status)
                }}
                style={{ flex: 2, padding: '9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                💬 Abrir WhatsApp e marcar como enviado ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
