'use client'
export const dynamic = 'force-dynamic'

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
  snooze_motivo: string | null
  wa_enviado: Record<string, boolean>
  clientes: { nome: string; telefone: string | null } | null
  created_at: string
}

type SubGrupo = 'atrasada' | 'pendente' | 'no_prazo' | 'adiada'

const SUBGRUPO_CONFIG: Record<SubGrupo, { label: string; cor: string; corFundo: string; corTexto: string; icone: string }> = {
  atrasada: { label: 'Atrasadas',  cor: '#f87171', corFundo: 'rgba(248,113,113,0.1)',  corTexto: '#f87171', icone: '🔴' },
  pendente: { label: 'Pendentes',  cor: '#fbbf24', corFundo: 'rgba(251,191,36,0.1)',   corTexto: '#fbbf24', icone: '🟡' },
  no_prazo: { label: 'No Prazo',   cor: '#34d399', corFundo: 'rgba(52,211,153,0.1)',   corTexto: '#34d399', icone: '🟢' },
  adiada:   { label: 'Adiadas',    cor: '#0df5d8', corFundo: 'rgba(13,245,216,0.08)', corTexto: '#0df5d8', icone: '⏸️' },
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  aberta:       { label: 'Aberta',       bg: 'rgba(96,165,250,0.12)',   color: '#60a5fa', icon: '📋' },
  em_andamento: { label: 'Em andamento', bg: 'rgba(251,191,36,0.12)',   color: '#fbbf24', icon: '🔧' },
  pronta:       { label: 'Pronta',       bg: 'rgba(52,211,153,0.12)',   color: '#34d399', icon: '✅' },
  entregue:     { label: 'Entregue',     bg: 'rgba(74,222,128,0.12)',   color: '#4ade80', icon: '📦' },
  cancelada:    { label: 'Cancelada',    bg: 'rgba(248,113,113,0.12)',  color: '#f87171', icon: '❌' },
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

function diasAberto(created_at: string) {
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 86400000)
}

function horasAberto(created_at: string) {
  return (Date.now() - new Date(created_at).getTime()) / 3600000
}

function classificarOS(os: Pendencia, prazoHoras: number, prazoAlertaDias: number): SubGrupo {
  const hoje = new Date().toISOString().split('T')[0]
  if (os.snooze_ate && os.snooze_ate >= hoje) return 'adiada'
  if (os.status === 'pronta') return diasAberto(os.created_at) > prazoAlertaDias ? 'atrasada' : 'pendente'
  return horasAberto(os.created_at) > prazoHoras ? 'atrasada' : 'no_prazo'
}

function SubGrupoSection({
  subgrupo, lista, onAdiar, onWA, onAbrir, colapsavel
}: {
  subgrupo: SubGrupo
  lista: Pendencia[]
  onAdiar: (os: Pendencia) => void
  onWA: (os: Pendencia) => void
  onAbrir: (id: string) => void
  colapsavel?: boolean
}) {
  const [aberto, setAberto] = useState(!colapsavel)
  const cfg = SUBGRUPO_CONFIG[subgrupo]
  if (lista.length === 0) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        onClick={() => colapsavel && setAberto(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: aberto ? 14 : 0, cursor: colapsavel ? 'pointer' : 'default', userSelect: 'none' }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 8, background: cfg.corFundo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
          {cfg.icone}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#dff0ff' }}>{cfg.label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: cfg.corFundo, color: cfg.corTexto }}>{lista.length}</span>
        {colapsavel && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{aberto ? '▲' : '▼'}</span>}
      </div>

      {aberto && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {lista.map(os => {
            const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
            const dias = diasAberto(os.created_at)
            const waAtual = os.wa_enviado ?? {}
            const waStatusEnviado = waAtual[os.status] === true

            return (
              <div key={os.id} style={{ background: '#060e17', border: `1px solid ${cfg.cor}30`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                {/* Barra colorida 4px */}
                <div style={{ height: 4, background: cfg.cor }} />

                <div style={{ padding: '14px 14px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#3d6070', fontWeight: 500, letterSpacing: '0.05em' }}>OS #{os.numero}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#dff0ff', marginTop: 2, lineHeight: 1.2 }}>{os.modelo ?? 'Aparelho'}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: st.bg, color: st.color, flexShrink: 0 }}>{st.icon} {st.label}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#4a7a90', lineHeight: 1.4 }}>
                    {os.defeito_relatado.slice(0, 60)}{os.defeito_relatado.length > 60 ? '…' : ''}
                  </div>
                  {dias > 0 && (
                    <div style={{ marginTop: 6, fontSize: 10, color: subgrupo === 'atrasada' ? '#f87171' : subgrupo === 'pendente' ? '#fbbf24' : '#3d6070', fontWeight: 500 }}>
                      ⏱ {dias} dia{dias > 1 ? 's' : ''} em aberto
                    </div>
                  )}
                </div>

                <div style={{ padding: '0 14px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 4 }} />
                  <div style={{ fontSize: 12, color: '#7ba8c0', fontWeight: 500 }}>👤 {os.clientes?.nome ?? 'Cliente não identificado'}</div>

                  {os.valor_orcamento && (
                    <div style={{ fontSize: 12, color: '#0df5d8', fontWeight: 600 }}>
                      💰 R$ {os.valor_orcamento.toFixed(2).replace('.', ',')}
                    </div>
                  )}

                  {subgrupo === 'adiada' && os.snooze_motivo && (
                    <div style={{ fontSize: 11, color: '#0df5d8', background: 'rgba(13,245,216,0.08)', borderRadius: 7, padding: '6px 9px', borderLeft: '3px solid #0df5d8' }}>
                      <span style={{ fontWeight: 600 }}>Motivo:</span> {os.snooze_motivo}
                    </div>
                  )}
                  {subgrupo === 'adiada' && os.snooze_ate && (
                    <div style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', borderRadius: 6, padding: '4px 8px' }}>
                      ⏸️ Adiada até {new Date(os.snooze_ate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => onWA(os)} style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: '1px solid', cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: waStatusEnviado ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)', color: waStatusEnviado ? '#34d399' : '#7ba8c0', borderColor: waStatusEnviado ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)' }}>
                      💬 WhatsApp
                    </button>
                    {waStatusEnviado && (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, color: '#34d399' }}>✓</div>
                    )}
                  </div>

                  <button onClick={() => onAdiar(os)} style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: subgrupo === 'adiada' ? '1px solid rgba(13,245,216,0.25)' : '1px dashed rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: 11, color: subgrupo === 'adiada' ? '#0df5d8' : '#3d6070', background: subgrupo === 'adiada' ? 'rgba(13,245,216,0.08)' : 'transparent' }}>
                    {subgrupo === 'adiada' ? '✏️ Alterar adiamento' : '😴 Adiar até...'}
                  </button>

                  <button onClick={() => onAbrir(os.id)} style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid rgba(13,245,216,0.2)', cursor: 'pointer', fontSize: 11, fontWeight: 500, color: '#0df5d8', background: 'rgba(13,245,216,0.07)' }}>
                    Abrir OS →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function OSPage() {
  const supabase = createClient()
  const router = useRouter()
  const [aba, setAba] = useState<'lista' | 'pendencias'>('pendencias')
  const [items, setItems] = useState<OS[]>([])
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [prazoHoras, setPrazoHoras] = useState(4)
  const [prazoAlertaDias, setPrazoAlertaDias] = useState(3)
  const [snoozeModal, setSnoozeModal] = useState<{ os: Pendencia; data: string; motivo: string } | null>(null)
  const [waModal, setWaModal] = useState<{ os: Pendencia; status: string } | null>(null)

  // Carregar configs
  const carregarConfigs = useCallback(async () => {
    const { data } = await supabase.from('sistema_config').select('chave, valor').in('chave', ['os_prazo_producao_horas', 'alerta_os_pronta_1'])
    if (data) data.forEach((c: { chave: string; valor: string }) => {
      if (c.chave === 'os_prazo_producao_horas') setPrazoHoras(Number(c.valor) || 4)
      if (c.chave === 'alerta_os_pronta_1') setPrazoAlertaDias(Number(c.valor) || 3)
    })
  }, [supabase])

  const fetchOS = useCallback(async () => {
    setLoading(true)
    await carregarConfigs()
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
  }, [supabase, filtroStatus, search, carregarConfigs])

  const fetchPendencias = useCallback(async () => {
    const { data } = await supabase
      .from('ordens_servico')
      .select('id,numero,status,modelo,defeito_relatado,valor_orcamento,snooze_ate,snooze_motivo,wa_enviado,created_at,clientes(nome,telefone)')
      .is('deleted_at', null)
      .neq('status', 'entregue')
      .neq('status', 'cancelada')
      .order('created_at', { ascending: false })
    setPendencias((data as unknown as Pendencia[]) ?? [])
  }, [supabase])

  // Carregar na montagem
  useEffect(() => {
    fetchOS()
    fetchPendencias()
  }, [fetchOS, fetchPendencias])

  async function salvarSnooze() {
    if (!snoozeModal) return
    await supabase.from('ordens_servico').update({
      snooze_ate: snoozeModal.data || null,
      snooze_motivo: snoozeModal.data ? snoozeModal.motivo.trim() : null,
    }).eq('id', snoozeModal.os.id)
    setSnoozeModal(null)
    fetchPendencias()
  }

  async function removerSnooze(os: Pendencia) {
    await supabase.from('ordens_servico').update({ snooze_ate: null, snooze_motivo: null }).eq('id', os.id)
    fetchPendencias()
  }

  async function marcarWAEnviado(os: Pendencia, status: string) {
    const novo = { ...(os.wa_enviado ?? {}), [status]: true }
    await supabase.from('ordens_servico').update({ wa_enviado: novo }).eq('id', os.id)
    fetchPendencias()
    setWaModal(null)
  }

  function abrirModalAdiar(os: Pendencia) {
    const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    setSnoozeModal({ os, data: os.snooze_ate && os.snooze_ate > amanha ? os.snooze_ate : amanha, motivo: os.snooze_motivo || '' })
  }

  const hoje = new Date().toISOString().split('T')[0]
  const grupos: Record<SubGrupo, Pendencia[]> = { atrasada: [], pendente: [], no_prazo: [], adiada: [] }
  pendencias.forEach(os => { grupos[classificarOS(os, prazoHoras, prazoAlertaDias)].push(os) })

  const qtdAtrasadas = grupos.atrasada.length
  const totalPendencias = pendencias.length
  const snoozeValido = !!snoozeModal?.data && snoozeModal.data > hoje && snoozeModal.motivo.trim().length > 3

  const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, fontSize: 13, color: '#dff0ff', background: 'rgba(255,255,255,0.04)', outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#dff0ff', letterSpacing: '-0.02em' }}>Ordens de Serviço</h1>
          <p style={{ fontSize: 13, color: '#3d6070', marginTop: 2 }}>
            {items.length} registros · {totalPendencias} pendências ativas
            {qtdAtrasadas > 0 && <span style={{ color: '#f87171', fontWeight: 600, marginLeft: 8 }}>· {qtdAtrasadas} atrasada{qtdAtrasadas !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <Link href="/os/nova" style={{ padding: '9px 18px', background: '#0df5d8', color: '#020c12', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>+ Nova OS</Link>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {([['lista', '📋 Visão geral'], ['pendencias', `⏳ Pendências (${totalPendencias})${qtdAtrasadas > 0 ? ` 🔴 ${qtdAtrasadas}` : ''}`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setAba(key); if (key === 'lista') fetchOS(); else fetchPendencias() }} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === key ? '#0df5d8' : key === 'pendencias' && qtdAtrasadas > 0 ? '#f87171' : '#3d6070', borderBottom: aba === key ? '2px solid #0df5d8' : '2px solid transparent', marginBottom: -1 }}>{label}</button>
        ))}
      </div>

      {/* ═══ ABA LISTA ═══ */}
      {aba === 'lista' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <input style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="Buscar por modelo, defeito..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchOS()} />
            <div style={{ display: 'flex', gap: 6 }}>
              {['todos', 'aberta', 'em_andamento', 'pronta', 'entregue'].map(s => (
                <button key={s} onClick={() => setFiltroStatus(s)} style={{ padding: '8px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid', fontWeight: filtroStatus === s ? 600 : 400, background: filtroStatus === s ? 'rgba(13,245,216,0.1)' : 'rgba(255,255,255,0.03)', color: filtroStatus === s ? '#0df5d8' : '#3d6070', borderColor: filtroStatus === s ? 'rgba(13,245,216,0.3)' : 'rgba(255,255,255,0.07)' }}>
                  {s === 'todos' ? 'Todas' : STATUS_CONFIG[s]?.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#3d6070', fontSize: 13 }}>Carregando...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#7ba8c0' }}>Nenhuma OS encontrada</p>
              <Link href="/os/nova" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', background: '#0df5d8', color: '#020c12', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>+ Nova OS</Link>
            </div>
          ) : (
            <div style={{ background: '#060e17', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['OS', 'Cliente', 'Aparelho', 'Defeito', 'Valor', 'Status', 'Data'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#3d6070', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(os => {
                    const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
                    return (
                      <tr key={os.id} onClick={() => router.push(`/os/${os.id}`)} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(13,245,216,0.04)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0df5d8' }}>#{os.numero}</td>
                        <td style={{ padding: '12px 16px', color: '#dff0ff' }}>{os.clientes?.nome ?? '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#7ba8c0' }}>{os.modelo ?? '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#4a7a90', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{os.defeito_relatado}</td>
                        <td style={{ padding: '12px 16px', color: '#dff0ff', fontWeight: 500 }}>{os.valor_orcamento ? `R$ ${os.valor_orcamento.toFixed(2).replace('.', ',')}` : '—'}</td>
                        <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span></td>
                        <td style={{ padding: '12px 16px', color: '#3d6070' }}>{new Date(os.created_at).toLocaleDateString('pt-BR')}</td>
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
        totalPendencias === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#dff0ff' }}>Nenhuma pendência!</p>
            <p style={{ fontSize: 13, color: '#3d6070', marginTop: 6 }}>Todas as OS estão entregues ou em snooze.</p>
          </div>
        ) : (
          <div>
            <SubGrupoSection subgrupo="atrasada" lista={grupos.atrasada} onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} />
            <SubGrupoSection subgrupo="pendente" lista={grupos.pendente} onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} />
            <SubGrupoSection subgrupo="no_prazo" lista={grupos.no_prazo} onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} />
            <SubGrupoSection subgrupo="adiada" lista={grupos.adiada} onAdiar={abrirModalAdiar} onWA={os => setWaModal({ os, status: os.status })} onAbrir={id => router.push(`/os/${id}`)} colapsavel />
          </div>
        )
      )}

      {/* ═══ MODAL SNOOZE ═══ */}
      {snoozeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,10,16,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#060e17', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#dff0ff', margin: 0 }}>😴 Adiar OS #{snoozeModal.os.numero}</h3>
                <p style={{ fontSize: 12, color: '#3d6070', margin: '2px 0 0' }}>{snoozeModal.os.clientes?.nome} · {snoozeModal.os.modelo ?? 'Aparelho'}</p>
              </div>
              <button onClick={() => setSnoozeModal(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#3d6070' }}>×</button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#3d6070', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Retornar na lista em *</label>
                <input type="date" value={snoozeModal.data} min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} onChange={e => setSnoozeModal({ ...snoozeModal, data: e.target.value })} style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', color: '#dff0ff' }} />
                <p style={{ fontSize: 11, color: '#3d6070', marginTop: 4 }}>A OS ficará oculta das demais seções até esta data.</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#3d6070', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Justificativa *</label>
                <textarea value={snoozeModal.motivo} onChange={e => setSnoozeModal({ ...snoozeModal, motivo: e.target.value })} placeholder="Ex: Aguardando peça do fornecedor, cliente viaja, orçamento pendente..." rows={3} style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', color: '#dff0ff' }} />
                <p style={{ fontSize: 11, color: '#3d6070', marginTop: 4 }}>O motivo ficará visível no card enquanto a OS estiver adiada.</p>
              </div>
              {snoozeModal.os.snooze_ate && (
                <button onClick={() => { removerSnooze(snoozeModal.os); setSnoozeModal(null) }} style={{ fontSize: 12, color: '#3d6070', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  ✕ Remover adiamento (voltar para lista agora)
                </button>
              )}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setSnoozeModal(null)} style={{ padding: '8px 18px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, background: 'transparent', cursor: 'pointer', color: '#7ba8c0' }}>Cancelar</button>
              <button onClick={salvarSnooze} disabled={!snoozeValido} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: snoozeValido ? 'pointer' : 'not-allowed', background: snoozeValido ? '#0df5d8' : 'rgba(255,255,255,0.06)', color: snoozeValido ? '#020c12' : '#3d6070' }}>
                Confirmar adiamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL WHATSAPP ═══ */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,10,16,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#060e17', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dff0ff', marginBottom: 6 }}>💬 Enviar mensagem WhatsApp</h3>
            <p style={{ fontSize: 13, color: '#3d6070', marginBottom: 14 }}>Para: <strong style={{ color: '#7ba8c0' }}>{waModal.os.clientes?.nome}</strong> · {waModal.os.clientes?.telefone ?? 'sem telefone'}</p>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 14, fontSize: 13, color: '#7ba8c0', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto' }}>
              {gerarMensagem(waModal.status, waModal.os)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setWaModal(null)} style={{ flex: 1, padding: '9px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, background: 'transparent', cursor: 'pointer', color: '#7ba8c0' }}>Cancelar</button>
              <button onClick={() => { abrirWA(waModal.os.clientes?.telefone ?? null, gerarMensagem(waModal.status, waModal.os)); marcarWAEnviado(waModal.os, waModal.status) }} style={{ flex: 2, padding: '9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                💬 Abrir WhatsApp e marcar como enviado ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
