'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Conversa = {
  id: string
  telefone: string
  status: 'bot' | 'humano' | 'resolvida'
  atualizado_em: string
  ultima_mensagem: string
  ultima_direcao: 'entrada' | 'saida'
}

type Mensagem = {
  id: string
  direcao: 'entrada' | 'saida'
  conteudo: string
  criado_em: string
}

const STATUS_LABEL: Record<string, string> = {
  bot: 'Bot',
  humano: 'Humano',
  resolvida: 'Resolvida',
}

const STATUS_COLOR: Record<string, string> = {
  bot: '#6ee7b7',
  humano: '#fcd34d',
  resolvida: '#94a3b8',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return formatTime(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function WhatsAppInboxPage() {
  const supabase = createClient()
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [filtro, setFiltro] = useState<'todas' | 'humano' | 'bot'>('todas')
  const [toast, setToast] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const conversaAtual = conversas.find(c => c.id === selecionada) ?? null

  const carregarConversas = useCallback(async () => {
    const res = await fetch('/api/whatsapp/conversas')
    if (res.ok) setConversas(await res.json())
  }, [])

  const carregarMensagens = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('wa_mensagens')
      .select('id, direcao, conteudo, criado_em')
      .eq('conversa_id', id)
      .order('criado_em', { ascending: true })
    setMensagens((data as Mensagem[]) ?? [])
  }, [supabase])

  useEffect(() => {
    carregarConversas()
  }, [carregarConversas])

  useEffect(() => {
    if (!selecionada) return
    carregarMensagens(selecionada)

    const channel = supabase
      .channel(`wa_msgs_${selecionada}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_mensagens', filter: `conversa_id=eq.${selecionada}` }, payload => {
        setMensagens(prev => [...prev, payload.new as Mensagem])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selecionada, supabase, carregarMensagens])

  // Realtime para novas conversas / badge
  useEffect(() => {
    const channel = supabase
      .channel('wa_conversas_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, () => {
        carregarConversas()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, carregarConversas])

  // Realtime toast para técnico — nova mensagem de cliente em conversa humano
  useEffect(() => {
    const channel = supabase
      .channel('wa_toast_tecnico')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_mensagens' }, async payload => {
        const msg = payload.new as Mensagem & { conversa_id: string }
        if (msg.direcao !== 'entrada') return
        const conv = conversas.find(c => c.id === msg.conversa_id)
        if (conv?.status === 'humano' && conv.id !== selecionada) {
          setToast(`Nova mensagem de ${conv.telefone}`)
          setTimeout(() => setToast(null), 4000)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, conversas, selecionada])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function enviar() {
    if (!texto.trim() || !selecionada) return
    setEnviando(true)
    await fetch('/api/whatsapp/conversas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversaId: selecionada, acao: 'enviar', texto }),
    })
    setTexto('')
    setEnviando(false)
    await carregarConversas()
  }

  async function resolver() {
    if (!selecionada) return
    await fetch('/api/whatsapp/conversas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversaId: selecionada, acao: 'resolver' }),
    })
    await carregarConversas()
  }

  const conversasFiltradas = conversas.filter(c => {
    if (filtro === 'todas') return c.status !== 'resolvida'
    return c.status === filtro
  })

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', -apple-system, sans-serif", background: '#0f172a' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: '#166534', color: '#bbf7d0', padding: '10px 16px', borderRadius: 10, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <i className="ti ti-brand-whatsapp" style={{ marginRight: 6 }} />
          {toast}
        </div>
      )}

      {/* Painel esquerdo — lista de conversas */}
      <div style={{ width: 320, minWidth: 320, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
            <i className="ti ti-brand-whatsapp" style={{ marginRight: 8, color: '#6ee7b7' }} />
            Inbox WhatsApp
          </h2>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {(['todas', 'humano', 'bot'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, border: 'none', cursor: 'pointer',
                  background: filtro === f ? '#2563eb' : 'rgba(255,255,255,0.07)',
                  color: filtro === f ? '#fff' : '#94a3b8',
                  fontWeight: filtro === f ? 600 : 400,
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversasFiltradas.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 13 }}>
              Nenhuma conversa
            </div>
          )}
          {conversasFiltradas.map(c => (
            <div
              key={c.id}
              onClick={() => setSelecionada(c.id)}
              style={{
                padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
                background: selecionada === c.id ? 'rgba(37,99,235,0.2)' : 'transparent',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (selecionada !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (selecionada !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{c.telefone}</span>
                <span style={{ fontSize: 10, color: '#64748b' }}>{formatDate(c.atualizado_em)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {c.ultima_direcao === 'saida' ? '→ ' : ''}{c.ultima_mensagem}
                </span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: `${STATUS_COLOR[c.status]}20`, color: STATUS_COLOR[c.status], whiteSpace: 'nowrap', marginLeft: 6 }}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Painel direito — chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
        {!selecionada ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 48, display: 'block', marginBottom: 12, opacity: 0.3 }} />
              Selecione uma conversa
            </div>
          </div>
        ) : (
          <>
            {/* Header conversa */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12, background: '#1e293b' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{conversaAtual?.telefone}</div>
                <div style={{ fontSize: 11, color: STATUS_COLOR[conversaAtual?.status ?? 'bot'] }}>
                  {STATUS_LABEL[conversaAtual?.status ?? 'bot']}
                </div>
              </div>
              {conversaAtual?.status !== 'resolvida' && (
                <button
                  onClick={resolver}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'rgba(37,99,235,0.15)', color: '#93c5fd', fontSize: 12, cursor: 'pointer' }}
                >
                  Resolver
                </button>
              )}
            </div>

            {/* Mensagens */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mensagens.map(m => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.direcao === 'saida' ? 'flex-end' : 'flex-start',
                    maxWidth: '70%',
                  }}
                >
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: m.direcao === 'saida' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: m.direcao === 'saida' ? '#2563eb' : '#1e293b',
                    color: '#f1f5f9',
                    fontSize: 13,
                    lineHeight: 1.4,
                    border: m.direcao === 'entrada' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  }}>
                    {m.conteudo}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 3, textAlign: m.direcao === 'saida' ? 'right' : 'left' }}>
                    {formatTime(m.criado_em)}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            {conversaAtual?.status !== 'resolvida' && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, background: '#1e293b' }}>
                <input
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder="Digite uma mensagem..."
                  style={{
                    flex: 1, padding: '9px 14px', borderRadius: 10,
                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#f1f5f9', fontSize: 13, outline: 'none',
                  }}
                />
                <button
                  onClick={enviar}
                  disabled={enviando || !texto.trim()}
                  style={{
                    padding: '9px 16px', borderRadius: 10, border: 'none',
                    background: enviando || !texto.trim() ? '#1e293b' : '#2563eb',
                    color: enviando || !texto.trim() ? '#475569' : '#fff',
                    cursor: enviando || !texto.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 600, transition: 'background 0.12s',
                  }}
                >
                  <i className="ti ti-send" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
