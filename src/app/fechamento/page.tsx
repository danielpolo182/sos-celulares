'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Perfil = { id: string; nome: string; papel: string }

type RotinaPerfil = {
  perfil: Perfil
  total: number
  feitas: number
  atrasadas: number
  pct: number
}

type CaixaMovimento = {
  tipo: string; valor: number; forma: string | null; created_at: string
}

type WAPendencia = {
  tipo: string; nome: string; telefone: string | null; enviado_hoje: boolean
}

type ProdutoIncompleto = {
  id: string; nome: string; created_at: string
}

type OSHoje = {
  id: string; numero: number; status: string; modelo: string | null
  valor_final: number | null; valor_orcamento: number | null
  clientes: { nome: string } | null
}

export default function FechamentoPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [fechado, setFechado] = useState(false)
  const hoje = new Date().toISOString().split('T')[0]

  // Dados
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [rotinasPorPerfil, setRotinasPorPerfil] = useState<RotinaPerfil[]>([])
  const [movimentos, setMovimentos] = useState<CaixaMovimento[]>([])
  const [waPendencias, setWaPendencias] = useState<WAPendencia[]>([])
  const [produtosIncompletos, setProdutosIncompletos] = useState<ProdutoIncompleto[]>([])
  const [osHoje, setOsHoje] = useState<OSHoje[]>([])
  const [obs, setObs] = useState('')

  // Totais calculados
  const [totais, setTotais] = useState({
    caixa_abertura: 0, total_dinheiro: 0, total_pix: 0,
    total_credito: 0, total_debito: 0, total_os: 0, total_pdv: 0,
    os_abertas: 0, os_entregues: 0, os_prontas: 0,
    wa_pendentes: 0, wa_enviados: 0,
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const [
      { data: p },
      { data: tarefas },
      { data: execucoes },
      { data: movs },
      { data: waPend },
      { data: waRes },
      { data: prodInc },
      { data: osData },
      { data: fechData },
    ] = await Promise.all([
      supabase.from('perfis').select('id,nome,papel').eq('ativo', true),
      supabase.from('rotina_tarefas').select('*').eq('ativo', true),
      supabase.from('rotina_execucoes').select('*').eq('data_ref', hoje),
      supabase.from('caixa_movimentos').select('*').eq('data_ref', hoje).order('created_at'),
      supabase.from('vw_wa_pendencias_dia').select('tipo,nome,telefone,enviado_hoje'),
      supabase.from('vw_wa_resumo_dia').select('*'),
      supabase.from('produtos').select('id,nome,created_at').eq('cadastro_rapido', true).is('deleted_at', null),
      supabase.from('ordens_servico')
        .select('id,numero,status,modelo,valor_final,valor_orcamento,clientes(nome)')
        .is('deleted_at', null)
        .gte('created_at', hoje + 'T00:00:00')
        .order('numero', { ascending: false }),
      supabase.from('fechamento_dia').select('*').eq('data_ref', hoje).single(),
    ])

    const perfisData = (p ?? []) as Perfil[]
    const tarefasData = (tarefas ?? []) as any[]
    const execData = (execucoes ?? []) as any[]
    setPerfis(perfisData)
    setWaPendencias((waPend ?? []) as WAPendencia[])
    setProdutosIncompletos((prodInc ?? []) as ProdutoIncompleto[])
    setOsHoje((osData ?? []) as unknown as OSHoje[])
    setMovimentos((movs ?? []) as CaixaMovimento[])

    // Calcular rotinas por perfil
    const hoje_dia = new Date()
    const rotPerfil: RotinaPerfil[] = perfisData.map(pf => {
      const tarefasHoje = tarefasData.filter((t: any) => {
        if (!t.ativo) return false
        if (t.responsavel_id && t.responsavel_id !== pf.id) return false
        if (t.frequencia === 'diaria') return true
        if (t.frequencia === 'semanal') return t.dias_semana?.includes(hoje_dia.getDay())
        if (t.frequencia === 'mensal') return t.dia_mes === hoje_dia.getDate()
        return false
      })
      const feitas = tarefasHoje.filter((t: any) => execData.some((e: any) => e.tarefa_id === t.id && e.usuario_id === pf.id && e.feito))
      const atrasadas = tarefasHoje.filter((t: any) => {
        const exec = execData.find((e: any) => e.tarefa_id === t.id && e.usuario_id === pf.id)
        if (exec?.feito) return false
        if (!t.horario_limit) return false
        const [h, m] = t.horario_limit.split(':').map(Number)
        const limite = new Date(); limite.setHours(h, m, 0, 0)
        return new Date() > limite
      })
      return { perfil: pf, total: tarefasHoje.length, feitas: feitas.length, atrasadas: atrasadas.length, pct: tarefasHoje.length > 0 ? Math.round(feitas.length / tarefasHoje.length * 100) : 0 }
    })
    setRotinasPorPerfil(rotPerfil)

    // Totais financeiros
    const movsData = (movs ?? []) as CaixaMovimento[]
    const abertura = movsData.find(m => m.tipo === 'abertura')?.valor ?? 0
    const dinheiro = movsData.filter(m => m.tipo !== 'abertura' && m.tipo !== 'sangria' && m.forma === 'dinheiro').reduce((s, m) => s + m.valor, 0)
    const pix = movsData.filter(m => m.forma === 'pix').reduce((s, m) => s + m.valor, 0)
    const credito = movsData.filter(m => m.forma === 'credito').reduce((s, m) => s + m.valor, 0)
    const debito = movsData.filter(m => m.forma === 'debito').reduce((s, m) => s + m.valor, 0)
    const osData2 = (osData ?? []) as any[]
    const totalOS = osData2.filter((o: any) => o.status === 'entregue').reduce((s: number, o: any) => s + (o.valor_final ?? o.valor_orcamento ?? 0), 0)
    const totalPDV = movsData.filter(m => m.tipo === 'venda').reduce((s, m) => s + m.valor, 0)
    const waR = (waRes ?? []) as any[]
    const waPend2 = waR.reduce((s: number, r: any) => s + r.pendentes, 0)
    const waEnv = waR.reduce((s: number, r: any) => s + r.enviados, 0)

    setTotais({
      caixa_abertura: abertura,
      total_dinheiro: dinheiro,
      total_pix: pix,
      total_credito: credito,
      total_debito: debito,
      total_os: totalOS,
      total_pdv: totalPDV,
      os_abertas: osData2.filter((o: any) => ['aberta','em_andamento'].includes(o.status)).length,
      os_entregues: osData2.filter((o: any) => o.status === 'entregue').length,
      os_prontas: osData2.filter((o: any) => o.status === 'pronta').length,
      wa_pendentes: waPend2,
      wa_enviados: waEnv,
    })

    if (fechData) setFechado(fechData.status === 'fechado')
    setLoading(false)
  }, [supabase, hoje])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function fecharDia() {
    setSalvando(true)
    const totalGeral = totais.total_dinheiro + totais.total_pix + totais.total_credito + totais.total_debito
    await supabase.from('fechamento_dia').upsert({
      data_ref: hoje,
      caixa_abertura: totais.caixa_abertura,
      caixa_fechamento: totais.caixa_abertura + totalGeral,
      total_dinheiro: totais.total_dinheiro,
      total_pix: totais.total_pix,
      total_credito: totais.total_credito,
      total_debito: totais.total_debito,
      total_os: totais.total_os,
      total_pdv: totais.total_pdv,
      total_geral: totalGeral,
      os_abertas: totais.os_abertas,
      os_entregues: totais.os_entregues,
      os_prontas_nao_ret: totais.os_prontas,
      wa_pendentes: totais.wa_pendentes,
      wa_enviados: totais.wa_enviados,
      produtos_incompletos: produtosIncompletos.length,
      rotinas_total: rotinasPorPerfil.reduce((s, r) => s + r.total, 0),
      rotinas_feitas: rotinasPorPerfil.reduce((s, r) => s + r.feitas, 0),
      status: 'fechado',
      fechado_em: new Date().toISOString(),
      observacoes: obs || null,
      snapshot_json: { totais, rotinas: rotinasPorPerfil, wa_pendencias: waPendencias },
    }, { onConflict: 'filial_id,data_ref' })
    setSalvando(false)
    setFechado(true)
  }

  const fm = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
  const totalGeral = totais.total_dinheiro + totais.total_pix + totais.total_credito + totais.total_debito
  const waTudo = waPendencias.filter(p => !p.enviado_hoje).length === 0
  const rotinasTudo = rotinasPorPerfil.every(r => r.pct === 100)
  const prodTudo = produtosIncompletos.length === 0
  const score = [waTudo, rotinasTudo, prodTudo].filter(Boolean).length
  const scoreColor = score === 3 ? '#10b981' : score === 2 ? '#f59e0b' : '#ef4444'

  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 16 } as React.CSSProperties
  const cardTitle = { fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando fechamento...</div>

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Fechamento do dia</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {!fechado ? (
          <button onClick={fecharDia} disabled={salvando} style={{ padding: '10px 22px', background: salvando ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {salvando ? 'Fechando...' : '🔐 Fechar o dia'}
          </button>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#065f46', background: '#ecfdf5', border: '1px solid #bbf7d0', padding: '8px 16px', borderRadius: 8 }}>✅ Dia fechado</span>
        )}
      </div>

      {/* Score geral */}
      <div style={{ background: '#fff', border: `2px solid ${scoreColor}20`, borderRadius: 12, padding: '16px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: scoreColor + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: scoreColor, flexShrink: 0 }}>
          {score}/3
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
            {score === 3 ? '✅ Tudo em ordem — pode fechar o dia!' : score === 2 ? '⚠ Quase lá — verifique os pendentes abaixo' : '🔴 Atenção — há itens importantes pendentes'}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { ok: waTudo, label: `WhatsApp ${waTudo ? 'enviados' : `(${waPendencias.filter(p => !p.enviado_hoje).length} pendentes)`}` },
              { ok: rotinasTudo, label: `Rotinas ${rotinasTudo ? 'concluídas' : 'com pendências'}` },
              { ok: prodTudo, label: `Produtos ${prodTudo ? 'completos' : `(${produtosIncompletos.length} incompletos)`}` },
            ].map((s, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: s.ok ? '#ecfdf5' : '#fef2f2', color: s.ok ? '#065f46' : '#991b1b' }}>
                {s.ok ? '✓' : '✗'} {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* FINANCEIRO */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={cardTitle}><span>💰</span> Resumo financeiro</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Abertura de caixa', value: fm(totais.caixa_abertura), color: '#64748b' },
              { label: 'Total em dinheiro', value: fm(totais.total_dinheiro), color: '#065f46' },
              { label: 'Total PIX',         value: fm(totais.total_pix),     color: '#3730a3' },
              { label: 'Cartão crédito',    value: fm(totais.total_credito), color: '#0369a1' },
              { label: 'Cartão débito',     value: fm(totais.total_debito),  color: '#075985' },
              { label: 'OS entregues',      value: fm(totais.total_os),      color: '#92400e' },
              { label: 'Vendas PDV',        value: fm(totais.total_pdv),     color: '#6b21a8' },
              { label: 'TOTAL GERAL',       value: fm(totalGeral),           color: '#0f172a' },
            ].map(m => (
              <div key={m.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</p>
                <p style={{ fontSize: m.label === 'TOTAL GERAL' ? 18 : 15, fontWeight: m.label === 'TOTAL GERAL' ? 700 : 600, color: m.color }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* OS do dia */}
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { label: 'OS abertas/andamento', value: totais.os_abertas, color: '#1d4ed8', bg: '#eff6ff' },
              { label: 'OS entregues',         value: totais.os_entregues, color: '#065f46', bg: '#ecfdf5' },
              { label: 'OS prontas (aguardando)', value: totais.os_prontas, color: '#92400e', bg: '#fef3c7' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
                <p style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ROTINAS POR FUNCIONÁRIO */}
        <div style={card}>
          <div style={cardTitle}><span>✅</span> Rotinas por funcionário</div>
          {rotinasPorPerfil.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum funcionário ativo.</p>
          ) : rotinasPorPerfil.map(r => (
            <div key={r.perfil.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                    {r.perfil.nome.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{r.perfil.nome}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {r.atrasadas > 0 && <span style={{ fontSize: 11, background: '#fef2f2', color: '#991b1b', padding: '1px 7px', borderRadius: 20 }}>{r.atrasadas} atrasada(s)</span>}
                  <span style={{ fontSize: 13, fontWeight: 700, color: r.pct === 100 ? '#10b981' : r.pct >= 50 ? '#f59e0b' : '#ef4444' }}>{r.pct}%</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${r.pct}%`, background: r.pct === 100 ? '#10b981' : r.pct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.feitas}/{r.total}</span>
              </div>
            </div>
          ))}
        </div>

        {/* WHATSAPP */}
        <div style={card}>
          <div style={cardTitle}>
            <span>💬</span> WhatsApp
            {waTudo
              ? <span style={{ fontSize: 11, fontWeight: 600, background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 20, marginLeft: 'auto' }}>✓ Todos enviados</span>
              : <span style={{ fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#991b1b', padding: '2px 8px', borderRadius: 20, marginLeft: 'auto' }}>{waPendencias.filter(p => !p.enviado_hoje).length} pendentes</span>
            }
          </div>
          {waPendencias.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma pendência de WhatsApp hoje.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {waPendencias.slice(0, 8).map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: p.enviado_hoje ? '#f8fffe' : '#fff', border: '1px solid #f1f5f9', borderRadius: 7, fontSize: 12 }}>
                  <span style={{ color: '#374151' }}>{p.nome}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: p.enviado_hoje ? '#ecfdf5' : '#fef2f2', color: p.enviado_hoje ? '#065f46' : '#991b1b' }}>
                    {p.enviado_hoje ? '✓ Enviado' : '⏳ Pendente'}
                  </span>
                </div>
              ))}
              {waPendencias.length > 8 && <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>+{waPendencias.length - 8} mais</p>}
            </div>
          )}
        </div>

        {/* PRODUTOS INCOMPLETOS */}
        <div style={card}>
          <div style={cardTitle}>
            <span>🏷</span> Produtos para completar
            {prodTudo
              ? <span style={{ fontSize: 11, fontWeight: 600, background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 20, marginLeft: 'auto' }}>✓ Todos completos</span>
              : <span style={{ fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 20, marginLeft: 'auto' }}>{produtosIncompletos.length} incompletos</span>
            }
          </div>
          {produtosIncompletos.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum produto com cadastro incompleto.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {produtosIncompletos.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</span>
                  <a href={`/produtos`} style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>Completar →</a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OS DO DIA */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={cardTitle}><span>🔧</span> OS abertas hoje ({osHoje.filter(o => ['aberta','em_andamento'].includes(o.status)).length})</div>
          {osHoje.filter(o => ['aberta','em_andamento'].includes(o.status)).length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma OS aberta hoje.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {osHoje.filter(o => ['aberta','em_andamento'].includes(o.status)).map(os => (
                <div key={os.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: '#6366f1', fontSize: 13 }}>#{os.numero}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 20, background: os.status === 'aberta' ? '#eff6ff' : '#fef3c7', color: os.status === 'aberta' ? '#1d4ed8' : '#92400e' }}>
                      {os.status === 'aberta' ? 'Aberta' : 'Em andamento'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{(os.clientes as any)?.nome ?? '—'}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>{os.modelo ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OBSERVAÇÕES */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={cardTitle}><span>📝</span> Observações do fechamento</div>
          <textarea style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit', minHeight: 80, resize: 'vertical' }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Anotações do dia, ocorrências, observações para o próximo turno..." disabled={fechado} />
        </div>
      </div>

      {/* Botão fechar no final */}
      {!fechado && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={fecharDia} disabled={salvando} style={{ padding: '12px 32px', background: salvando ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {salvando ? 'Fechando...' : '🔐 Confirmar fechamento do dia'}
          </button>
        </div>
      )}
    </div>
  )
}
