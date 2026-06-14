'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Resumo = {
  total_mensagens: number
  total_conversas: number
  conversas_bot: number
  conversas_humano: number
  conversas_resolvidas: number
  notificacoes_enviadas: number
}

type LogRow = {
  id: string
  tipo: string
  telefone: string
  mensagem: string
  status: string
  criado_em: string
}

export default function RelatorioWhatsAppPage() {
  const supabase = createClient()
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'hoje' | '7d' | '30d'>('7d')

  const carregar = useCallback(async () => {
    setLoading(true)
    const agora = new Date()
    const desde = new Date(agora)
    if (periodo === 'hoje') desde.setHours(0, 0, 0, 0)
    else if (periodo === '7d') desde.setDate(agora.getDate() - 7)
    else desde.setDate(agora.getDate() - 30)

    const desdeIso = desde.toISOString()

    const [
      { count: totalMsgs },
      { data: conversas },
      { count: notifs },
      { data: logsData },
    ] = await Promise.all([
      supabase.from('wa_mensagens').select('id', { count: 'exact', head: true }).gte('criado_em', desdeIso),
      supabase.from('wa_conversas').select('status').gte('criado_em', desdeIso),
      supabase.from('wa_logs').select('id', { count: 'exact', head: true }).eq('tipo', 'notificacao_status').gte('criado_em', desdeIso),
      supabase.from('wa_logs').select('id, tipo, telefone, mensagem, status, criado_em').gte('criado_em', desdeIso).order('criado_em', { ascending: false }).limit(100),
    ])

    const convArr = conversas ?? []
    setResumo({
      total_mensagens: totalMsgs ?? 0,
      total_conversas: convArr.length,
      conversas_bot: convArr.filter(c => c.status === 'bot').length,
      conversas_humano: convArr.filter(c => c.status === 'humano').length,
      conversas_resolvidas: convArr.filter(c => c.status === 'resolvida').length,
      notificacoes_enviadas: notifs ?? 0,
    })
    setLogs((logsData as LogRow[]) ?? [])
    setLoading(false)
  }, [supabase, periodo])

  useEffect(() => { carregar() }, [carregar])

  const cards = resumo ? [
    { label: 'Mensagens', value: resumo.total_mensagens, icon: 'ti-message', color: '#2563eb' },
    { label: 'Conversas', value: resumo.total_conversas, icon: 'ti-messages', color: '#7c3aed' },
    { label: 'Bot', value: resumo.conversas_bot, icon: 'ti-robot', color: '#0891b2' },
    { label: 'Humano', value: resumo.conversas_humano, icon: 'ti-headset', color: '#d97706' },
    { label: 'Resolvidas', value: resumo.conversas_resolvidas, icon: 'ti-circle-check', color: '#059669' },
    { label: 'Notificações OS', value: resumo.notificacoes_enviadas, icon: 'ti-bell', color: '#db2777' },
  ] : []

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
            <i className="ti ti-brand-whatsapp" style={{ marginRight: 8, color: '#22c55e' }} />
            Relatório WhatsApp
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Atividade de mensagens e notificações</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['hoje', '7d', '30d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              style={{
                padding: '7px 16px', borderRadius: 8, border: '1px solid',
                borderColor: periodo === p ? '#2563eb' : '#e2e8f0',
                background: periodo === p ? '#2563eb' : '#fff',
                color: periodo === p ? '#fff' : '#374151',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              {p === 'hoje' ? 'Hoje' : p === '7d' ? '7 dias' : '30 dias'}
            </button>
          ))}
        </div>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <i className={`ti ${c.icon}`} style={{ fontSize: 22, color: c.color, display: 'block', marginBottom: 8 }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
              {loading ? '—' : c.value}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tabela de logs */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Log de Atividades</h2>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhuma atividade no período</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Data', 'Tipo', 'Telefone', 'Mensagem', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(l.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: '#f1f5f9', color: '#374151' }}>
                      {l.tipo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#374151', fontFamily: 'monospace' }}>{l.telefone}</td>
                  <td style={{ padding: '10px 16px', color: '#374151', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.mensagem}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: l.status === 'enviado' ? '#dcfce7' : '#fee2e2', color: l.status === 'enviado' ? '#166534' : '#991b1b' }}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
