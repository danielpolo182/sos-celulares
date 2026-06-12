export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [
    { data: osHoje },
    { data: osMes },
    { data: osAbertas },
    { data: osProntas },
    { data: osAtrasadas },
    { data: vendasHoje },
    { data: caixaHoje },
    { data: osPorTecnico },
    { data: clientesNovos },
    { data: osRecentes },
  ] = await Promise.all([
    supabase.from('ordens_servico').select('id,valor_final,valor_orcamento').is('deleted_at', null).gte('created_at', hoje),
    supabase.from('ordens_servico').select('id,valor_final,valor_orcamento,created_at,entregue_em').is('deleted_at', null).gte('created_at', inicioMes),
    supabase.from('ordens_servico').select('id').is('deleted_at', null).in('status', ['aberta', 'em_andamento']),
    supabase.from('ordens_servico').select('id').is('deleted_at', null).eq('status', 'pronta'),
    supabase.from('ordens_servico').select('id').is('deleted_at', null).in('status', ['aberta', 'em_andamento']).lt('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('vendas').select('total').eq('status', 'finalizada').eq('tipo', 'pdv').gte('created_at', hoje),
    supabase.from('vw_caixa_hoje').select('saldo_atual,total_vendas').eq('data_ref', hoje).single(),
    supabase.from('ordens_servico').select('tecnico_id,perfis(nome)').is('deleted_at', null).not('tecnico_id', 'is', null).gte('created_at', inicioMes),
    supabase.from('clientes').select('id').is('deleted_at', null).gte('created_at', inicioMes),
    supabase.from('ordens_servico').select('id,numero,status,modelo,defeito_relatado,valor_orcamento,valor_final,created_at,clientes(nome)').is('deleted_at', null).order('created_at', { ascending: false }).limit(6),
  ])

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const userName = user?.email?.split('@')[0] ?? 'usuário'
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const receitaHoje = (osHoje ?? []).reduce((s: number, o: any) => s + (o.valor_final ?? o.valor_orcamento ?? 0), 0)
  const receitaMes  = (osMes ?? []).reduce((s: number, o: any) => s + (o.valor_final ?? o.valor_orcamento ?? 0), 0)
  const vendaPDVHoje = (vendasHoje ?? []).reduce((s: number, v: any) => s + (v.total ?? 0), 0)

  const tecnicoMap: Record<string, { nome: string; total: number }> = {}
  ;(osPorTecnico ?? []).forEach((o: any) => {
    if (!o.tecnico_id) return
    const nome = o.perfis?.nome ?? 'Sem nome'
    if (!tecnicoMap[o.tecnico_id]) tecnicoMap[o.tecnico_id] = { nome, total: 0 }
    tecnicoMap[o.tecnico_id].total++
  })
  const tecnicoRanking = Object.values(tecnicoMap).sort((a, b) => b.total - a.total).slice(0, 5)

  const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; bar: string }> = {
    aberta:       { label: 'Aberta',       bg: '#dbeafe', color: '#1d4ed8', bar: '#2563eb' },
    em_andamento: { label: 'Em andamento', bg: '#fef3c7', color: '#92400e', bar: '#f59e0b' },
    pronta:       { label: 'Pronta',       bg: '#d1fae5', color: '#065f46', bar: '#10b981' },
    entregue:     { label: 'Entregue',     bg: '#d1fae5', color: '#14532d', bar: '#059669' },
    cancelada:    { label: 'Cancelada',    bg: '#fee2e2', color: '#991b1b', bar: '#ef4444' },
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const s: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }

  const kpis = [
    { label: 'OS este mês',        value: String(osMes?.length ?? 0),                    sub: `${osAbertas?.length ?? 0} em aberto`,  icon: '🔧', iconBg: '#dbeafe', subColor: '#92400e', subBg: '#fef3c7' },
    { label: 'Faturamento mensal', value: `R$ ${receitaMes.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, sub: `Hoje: R$ ${fmt(receitaHoje)}`, icon: '💰', iconBg: '#d1fae5', subColor: '#065f46', subBg: '#d1fae5' },
    { label: 'OS atrasadas',       value: String(osAtrasadas?.length ?? 0),               sub: 'mais de 3 dias abertas',               icon: '⏰', iconBg: '#fee2e2', subColor: '#991b1b', subBg: '#fee2e2' },
    { label: 'Clientes novos/mês', value: String(clientesNovos?.length ?? 0),             sub: `PDV hoje: R$ ${fmt(vendaPDVHoje)}`,    icon: '👥', iconBg: '#ede9fe', subColor: '#5b21b6', subBg: '#ede9fe' },
  ]

  return (
    <div style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, textTransform: 'capitalize' }}>{dateStr}</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {greeting}, {userName} 👋
        </h1>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...s, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{k.icon}</div>
              <span style={{ fontSize: 10, fontWeight: 600, color: k.subColor, background: k.subBg, padding: '2px 8px', borderRadius: 20 }}>{k.sub}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 3 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Linha 2 — OS recentes + Coluna direita */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>

        {/* OS recentes */}
        <div style={{ ...s, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>OS Recentes</div>
            <a href="/os" style={{ fontSize: 11, color: '#2563eb', fontWeight: 500, textDecoration: 'none' }}>Ver todas →</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(osRecentes ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>Nenhuma OS ainda</p>
            ) : (osRecentes ?? []).map((os: any) => {
              const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
              return (
                <a key={os.id} href={`/os/${os.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: `1px solid ${st.bg}`, background: st.bg + '55', textDecoration: 'none', transition: 'opacity 0.15s' }}>
                  <div style={{ width: 4, height: 38, borderRadius: 4, background: st.bar, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {os.modelo ?? os.defeito_relatado?.slice(0, 30) ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>OS #{os.numero} · {os.clientes?.nome ?? '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 20 }}>{st.label}</span>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{new Date(os.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Caixa hoje */}
          <div style={{ ...s, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Caixa hoje</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981', letterSpacing: '-0.02em', marginBottom: 3 }}>
              R$ {fmt(Number((caixaHoje as any)?.saldo_atual ?? 0))}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{(caixaHoje as any)?.total_vendas ?? 0} vendas finalizadas</div>
          </div>

          {/* Prontas p/ retirar */}
          <div style={{ ...s, padding: '16px 18px', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Prontas p/ retirar</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981', letterSpacing: '-0.02em', marginBottom: 3 }}>{osProntas?.length ?? 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>aguardando o cliente</div>
          </div>

          {/* OS por técnico */}
          <div style={{ ...s, padding: '16px 18px', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>OS por técnico (mês)</div>
            {tecnicoRanking.length === 0 ? (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>Nenhuma OS com técnico</p>
            ) : tecnicoRanking.map((t, i) => {
              const max = tecnicoRanking[0].total
              return (
                <div key={t.nome} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: '#0f172a', fontWeight: 500 }}>{t.nome}</span>
                    <span style={{ color: '#64748b' }}>{t.total} OS</span>
                  </div>
                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(t.total / max) * 100}%`, background: i === 0 ? '#2563eb' : '#93c5fd', borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>

      {/* Ações rápidas */}
      <div style={{ ...s, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Ações rápidas</span>
        {[
          { href: '/os/nova',  label: '+ Nova OS',       color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
          { href: '/pdv',      label: '🛒 Abrir PDV',    color: '#065f46', bg: '#d1fae5', border: '#a7f3d0' },
          { href: '/crm',      label: '📣 Ver CRM',      color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
          { href: '/rotinas',  label: '✅ Tarefas',      color: '#5b21b6', bg: '#ede9fe', border: '#c4b5fd' },
          { href: '/estoque',  label: '📦 Estoque',      color: '#0f4c75', bg: '#e0f2fe', border: '#bae6fd' },
        ].map(a => (
          <a key={a.href} href={a.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            background: a.bg, border: `1px solid ${a.border}`,
            fontSize: 12.5, fontWeight: 500, color: a.color,
            textDecoration: 'none', transition: 'opacity 0.15s',
          }}>
            {a.label}
          </a>
        ))}
      </div>

    </div>
  )
}
