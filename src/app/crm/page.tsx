'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Pendencia = {
  tipo: string
  cliente_id: string | null
  os_id: string | null
  nome: string
  telefone: string | null
  valor: number | null
  dias: number | null
  idade: number | null
  enviado_hoje: boolean
}

type Resumo = { tipo: string; total: number; enviados: number; pendentes: number }

type Config = Record<string, string>

const TIPO_CONFIG: Record<string, {
  label: string; icon: string; bg: string; color: string; border: string
  templateKey: string; descricao: string
}> = {
  aniversario: {
    label: 'Aniversariantes hoje', icon: '🎂',
    bg: '#fdf4ff', color: '#701a75', border: '#f0abfc',
    templateKey: 'wa_aniversario',
    descricao: 'Clientes que fazem aniversário hoje',
  },
  os_pronta_nao_retirada: {
    label: 'OS prontas — aguardando retirada', icon: '⏰',
    bg: '#fff7ed', color: '#9a3412', border: '#fed7aa',
    templateKey: 'wa_os_pronta_nao_retirada',
    descricao: 'Aparelhos prontos dentro do prazo, ainda não retirados',
  },
  aparelho_90dias: {
    label: 'Aparelhos além do prazo', icon: '📦',
    bg: '#fef2f2', color: '#991b1b', border: '#fecaca',
    templateKey: 'wa_retirada_90dias',
    descricao: 'Aparelhos na loja além do prazo configurado — taxa de armazenamento sendo gerada',
  },
  cliente_inativo: {
    label: 'Clientes inativos', icon: '😴',
    bg: '#f0f9ff', color: '#075985', border: '#bae6fd',
    templateKey: 'wa_cliente_inativo',
    descricao: 'Sem OS há mais dias do que o limite configurado',
  },
  nunca_retornou: {
    label: 'Nunca retornaram', icon: '👋',
    bg: '#f0fdf4', color: '#065f46', border: '#bbf7d0',
    templateKey: 'wa_nunca_retornou',
    descricao: 'Fizeram apenas 1 OS e não voltaram (mais de 30 dias)',
  },
}

function formatPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
}

function buildMensagem(template: string, p: Pendencia): string {
  const nome = p.nome?.split(' ')[0] ?? 'cliente'
  return template
    .replace(/{nome}/g, nome)
    .replace(/{modelo}/g, 'aparelho')
    .replace(/{numero}/g, p.os_id?.slice(-4) ?? '')
    .replace(/{valor}/g, p.valor ? `R$ ${p.valor.toFixed(2).replace('.', ',')}` : 'a combinar')
    .replace(/{dias}/g, String(p.dias ?? ''))
}

export default function CRMPage() {
  const supabase = createClient()
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [resumo, setResumo] = useState<Resumo[]>([])
  const [config, setConfig] = useState<Config>({})
  const [loading, setLoading] = useState(true)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [mostrarEnviados, setMostrarEnviados] = useState(false)
  const [waModal, setWaModal] = useState<{ pendencia: Pendencia; mensagem: string } | null>(null)

  const fetchTudo = useCallback(async () => {
    setLoading(true)
    const [{ data: pend }, { data: res }, { data: cfg }] = await Promise.all([
      supabase.from('vw_wa_pendencias_dia').select('*').order('enviado_hoje').order('dias', { ascending: false }),
      supabase.from('vw_wa_resumo_dia').select('*'),
      supabase.from('sistema_config').select('chave,valor').in('chave', [
        'wa_aniversario', 'wa_os_pronta_nao_retirada', 'wa_retirada_90dias',
        'wa_cliente_inativo', 'wa_nunca_retornou', 'retirada_prazo_dias',
        'os_pronta_alerta_dias', 'cliente_inativo_dias',
      ]),
    ])
    setPendencias((pend ?? []) as Pendencia[])
    setResumo((res ?? []) as Resumo[])
    const cfgMap: Config = {}
    cfg?.forEach(c => { cfgMap[c.chave] = c.valor })
    setConfig(cfgMap)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  function abrirWA(p: Pendencia) {
    const tc = TIPO_CONFIG[p.tipo]
    if (!tc || !p.telefone) return
    const template = config[tc.templateKey] ?? ''
    const mensagem = buildMensagem(template, p)
    setWaModal({ pendencia: p, mensagem })
  }

  async function confirmarEnvio(p: Pendencia, mensagem: string) {
    const uid = p.os_id ?? p.cliente_id
    if (!uid) return
    setEnviandoId(uid)

    // Abre WhatsApp
    const num = p.telefone!.replace(/\D/g, '')
    window.open(`https://wa.me/55${num}?text=${encodeURIComponent(mensagem)}`, '_blank')

    // Registra no banco como enviado
    await supabase.from('wa_logs').insert({
      tipo: p.tipo,
      cliente_id: p.cliente_id,
      os_id: p.os_id,
      telefone: p.telefone!,
      mensagem,
      data_ref: new Date().toISOString().split('T')[0],
    })

    setEnviandoId(null)
    setWaModal(null)
    fetchTudo()
  }

  const totalPendentes = resumo.reduce((s, r) => s + r.pendentes, 0)
  const totalEnviados  = resumo.reduce((s, r) => s + r.enviados, 0)
  const totalGeral     = resumo.reduce((s, r) => s + r.total, 0)
  const tudo100 = totalGeral > 0 && totalPendentes === 0

  const pendenciasFiltradas = pendencias.filter(p => {
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
    if (!mostrarEnviados && p.enviado_hoje) return false
    return true
  })

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>CRM & Acompanhamento</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
          {loading ? 'Carregando...' : tudo100 ? '🎉 Todos os contatos do dia foram realizados!' : `${totalPendentes} contato(s) pendente(s) hoje`}
        </p>
      </div>

      {/* Barra de progresso geral */}
      {!loading && totalGeral > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              Progresso do dia — {totalEnviados}/{totalGeral} enviados
            </p>
            <span style={{ fontSize: 20, fontWeight: 700, color: tudo100 ? '#10b981' : '#6366f1' }}>
              {Math.round((totalEnviados / totalGeral) * 100)}%
            </span>
          </div>
          <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(totalEnviados / totalGeral) * 100}%`, background: tudo100 ? '#10b981' : '#6366f1', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>

          {/* Cards por tipo */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {resumo.map(r => {
              const tc = TIPO_CONFIG[r.tipo]
              if (!tc) return null
              return (
                <button key={r.tipo} onClick={() => setFiltroTipo(filtroTipo === r.tipo ? 'todos' : r.tipo)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  borderRadius: 8, border: `1px solid ${filtroTipo === r.tipo ? tc.border : '#e2e8f0'}`,
                  background: filtroTipo === r.tipo ? tc.bg : '#f8fafc',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}>
                  <span>{tc.icon}</span>
                  <span style={{ color: '#374151' }}>{tc.label.split(' ')[0]}</span>
                  {r.pendentes > 0 ? (
                    <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>{r.pendentes}</span>
                  ) : (
                    <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Controles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setFiltroTipo('todos')} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid', fontWeight: filtroTipo === 'todos' ? 500 : 400, background: filtroTipo === 'todos' ? '#e0e7ff' : '#fff', color: filtroTipo === 'todos' ? '#3730a3' : '#64748b', borderColor: filtroTipo === 'todos' ? '#818cf8' : '#e2e8f0' }}>
            Todos os tipos
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
          <div onClick={() => setMostrarEnviados(!mostrarEnviados)} style={{ width: 36, height: 20, borderRadius: 10, background: mostrarEnviados ? '#6366f1' : '#e2e8f0', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: mostrarEnviados ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          Mostrar já enviados
        </label>
      </div>

      {/* Lista de pendências */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>Analisando dados dos clientes...</div>
      ) : pendenciasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{totalPendentes === 0 ? 'Tudo enviado hoje!' : 'Nenhum contato neste filtro'}</p>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{totalPendentes === 0 ? 'Todos os contatos do dia foram realizados.' : 'Tente remover o filtro ou ativar "Mostrar já enviados".'}</p>
        </div>
      ) : (
        // Agrupar por tipo
        Object.entries(TIPO_CONFIG).map(([tipo, tc]) => {
          const itens = pendenciasFiltradas.filter(p => p.tipo === tipo)
          if (itens.length === 0) return null
          const pendentesNeste = itens.filter(p => !p.enviado_hoje).length

          return (
            <div key={tipo} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {/* Cabeçalho do grupo */}
              <div style={{ background: tc.bg, borderBottom: `1px solid ${tc.border}`, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: tc.color, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{tc.icon}</span>
                    {tc.label}
                    {pendentesNeste > 0 ? (
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>{pendentesNeste} pendente(s)</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 20 }}>✓ Todos enviados</span>
                    )}
                  </h3>
                  <p style={{ fontSize: 12, color: tc.color, opacity: 0.7, marginTop: 2 }}>{tc.descricao}</p>
                </div>
              </div>

              {/* Tabela */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente</th>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telefone</th>
                    {(tipo === 'os_pronta_nao_retirada' || tipo === 'aparelho_90dias') && (
                      <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tempo</th>
                    )}
                    {tipo === 'aniversario' && (
                      <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Idade</th>
                    )}
                    {(tipo === 'cliente_inativo' || tipo === 'nunca_retornou') && (
                      <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Última OS</th>
                    )}
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((p, i) => {
                    const uid = p.os_id ?? p.cliente_id ?? String(i)
                    const carregando = enviandoId === uid
                    return (
                      <tr key={uid} style={{ borderBottom: '1px solid #f1f5f9', background: p.enviado_hoje ? '#f8fffe' : '#fff' }}
                        onMouseEnter={e => { e.currentTarget.style.background = p.enviado_hoje ? '#f0fdf4' : '#fafafa' }}
                        onMouseLeave={e => { e.currentTarget.style.background = p.enviado_hoje ? '#f8fffe' : '#fff' }}>
                        <td style={{ padding: '11px 16px', fontWeight: 500, color: '#0f172a' }}>{p.nome}</td>
                        <td style={{ padding: '11px 16px', color: '#64748b' }}>
                          {p.telefone ? formatPhone(p.telefone) : <span style={{ color: '#ef4444', fontSize: 11 }}>Sem telefone</span>}
                        </td>
                        {(tipo === 'os_pronta_nao_retirada' || tipo === 'aparelho_90dias') && (
                          <td style={{ padding: '11px 16px' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: (p.dias ?? 0) > 90 ? '#ef4444' : '#f59e0b' }}>
                              {p.dias} dias
                            </span>
                          </td>
                        )}
                        {tipo === 'aniversario' && (
                          <td style={{ padding: '11px 16px', color: '#374151' }}>{p.idade} anos 🎉</td>
                        )}
                        {(tipo === 'cliente_inativo' || tipo === 'nunca_retornou') && (
                          <td style={{ padding: '11px 16px' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>há {p.dias} dias</span>
                          </td>
                        )}
                        <td style={{ padding: '11px 16px' }}>
                          {p.enviado_hoje ? (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#ecfdf5', color: '#065f46' }}>✓ Enviado hoje</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>⏳ Pendente</span>
                          )}
                        </td>
                        <td style={{ padding: '11px 16px' }}>
                          {!p.telefone ? (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Sem número</span>
                          ) : (
                            <button onClick={() => abrirWA(p)} disabled={carregando} style={{
                              padding: '6px 14px', borderRadius: 7, border: '1px solid',
                              cursor: 'pointer', fontSize: 12, fontWeight: 500,
                              display: 'flex', alignItems: 'center', gap: 5,
                              background: p.enviado_hoje ? '#f0fdf4' : '#fff',
                              color: p.enviado_hoje ? '#065f46' : '#374151',
                              borderColor: p.enviado_hoje ? '#86efac' : '#e2e8f0',
                            }}>
                              💬 {p.enviado_hoje ? 'Reenviar' : 'Enviar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })
      )}

      {/* Modal WhatsApp */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>💬 Confirmar envio</h3>
              <button onClick={() => setWaModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                Para: <strong style={{ color: '#0f172a' }}>{waModal.pendencia.nome}</strong>
                {waModal.pendencia.telefone && <span style={{ marginLeft: 8, color: '#94a3b8' }}>· {formatPhone(waModal.pendencia.telefone)}</span>}
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
                {waModal.mensagem}
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                Ao confirmar, o WhatsApp será aberto e o envio ficará registrado no sistema. Se não enviar, clique em Cancelar.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setWaModal(null)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                <button onClick={() => confirmarEnvio(waModal.pendencia, waModal.mensagem)} style={{ flex: 2, padding: '9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  💬 Abrir WhatsApp e registrar envio ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
