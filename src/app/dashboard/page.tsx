export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const inicioSemana = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: osHoje },
    { data: osMes },
    { data: osAbertas },
    { data: osProntas },
    { data: vendasHoje },
    { data: caixaHoje },
    { data: osPorTecnico },
    { data: clientesNovos },
    { data: pecasMaisUsadas },
    { data: osRecentes },
  ] = await Promise.all([
    supabase.from('ordens_servico').select('id,valor_final,valor_orcamento').is('deleted_at', null).gte('created_at', hoje),
    supabase.from('ordens_servico').select('id,valor_final,valor_orcamento,created_at,entregue_em').is('deleted_at', null).gte('created_at', inicioMes),
    supabase.from('ordens_servico').select('id').is('deleted_at', null).in('status', ['aberta', 'em_andamento']),
    supabase.from('ordens_servico').select('id').is('deleted_at', null).eq('status', 'pronta'),
    supabase.from('vendas').select('total').eq('status', 'finalizada').eq('tipo', 'pdv').gte('created_at', hoje),
    supabase.from('vw_caixa_hoje').select('saldo_atual,total_vendas,entradas').eq('data_ref', hoje).single(),
    supabase.from('ordens_servico').select('tecnico_id,perfis(nome)').is('deleted_at', null).not('tecnico_id', 'is', null).gte('created_at', inicioMes),
    supabase.from('clientes').select('id,created_at').is('deleted_at', null).gte('created_at', inicioMes),
    supabase.from('os_orcamento_itens').select('descricao,quantidade').gte('created_at', inicioMes).order('quantidade', { ascending: false }).limit(5),
    supabase.from('ordens_servico').select('id,numero,status,modelo,defeito_relatado,valor_orcamento,valor_final,created_at,clientes(nome)').is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
  ])

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const userName = user?.email?.split('@')[0] ?? 'usuário'
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Cálculos
  const receitaHoje = (osHoje ?? []).reduce((s: number, o: any) => s + (o.valor_final ?? o.valor_orcamento ?? 0), 0)
  const receitaMes = (osMes ?? []).reduce((s: number, o: any) => s + (o.valor_final ?? o.valor_orcamento ?? 0), 0)
  const vendaPDVHoje = (vendasHoje ?? []).reduce((s: number, v: any) => s + (v.total ?? 0), 0)
  const ticketMedio = (osMes ?? []).length > 0 ? receitaMes / (osMes ?? []).length : 0

  // OS por técnico
  const tecnicoMap: Record<string, { nome: string; total: number }> = {}
  ;(osPorTecnico ?? []).forEach((o: any) => {
    if (!o.tecnico_id) return
    const nome = o.perfis?.nome ?? 'Sem nome'
    if (!tecnicoMap[o.tecnico_id]) tecnicoMap[o.tecnico_id] = { nome, total: 0 }
    tecnicoMap[o.tecnico_id].total++
  })
  const tecnicoRanking = Object.values(tecnicoMap).sort((a, b) => b.total - a.total).slice(0, 5)

  // Tempo médio reparo (OS entregues do mês)
  const osEntregues = (osMes ?? []).filter((o: any) => o.entregue_em)
  const tempoMedioHoras = osEntregues.length > 0
    ? osEntregues.reduce((s: number, o: any) => s + (new Date(o.entregue_em).getTime() - new Date(o.created_at).getTime()) / (1000 * 60 * 60), 0) / osEntregues.length
    : 0

  const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
    aberta:       { label: 'Aberta',       bg: '#eff6ff', color: '#1d4ed8' },
    em_andamento: { label: 'Em andamento', bg: '#fef3c7', color: '#92400e' },
    pronta:       { label: 'Pronta',       bg: '#ecfdf5', color: '#065f46' },
    entregue:     { label: 'Entregue',     bg: '#f0fdf4', color: '#14532d' },
    cancelada:    { label: 'Cancelada',    bg: '#fef2f2', color: '#991b1b' },
  }

  const card = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px',
  }

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 4 }}>
          {greeting}, {userName} 👋
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{dateStr}</p>
      </div>

      {/* Métricas principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Receita hoje (OS)',    value: `R$ ${receitaHoje.toFixed(2).replace('.', ',')}`,     icon: '💰', color: '#10b981', bg: '#ecfdf5' },
          { label: 'Vendas PDV hoje',      value: `R$ ${vendaPDVHoje.toFixed(2).replace('.', ',')}`,   icon: '💳', color: '#6366f1', bg: '#eef2ff' },
          { label: 'Receita do mês',       value: `R$ ${receitaMes.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`, icon: '📈', color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Ticket médio OS',      value: `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`,    icon: '🎯', color: '#3b82f6', bg: '#eff6ff' },
        ].map(m => (
          <div key={m.label} style={card}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 12 }}>{m.icon}</div>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 4 }}>{m.value}</p>
            <p style={{ fontSize: 12, color: '#64748b' }}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* Segunda linha de métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'OS em aberto',         value: String(osAbertas?.length ?? 0),                                              icon: '🔧', color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'Prontas p/ retirar',   value: String(osProntas?.length ?? 0),                                              icon: '✅', color: '#065f46', bg: '#ecfdf5' },
          { label: 'Clientes novos/mês',   value: String(clientesNovos?.length ?? 0),                                          icon: '👥', color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Tempo médio reparo',   value: tempoMedioHoras > 0 ? `${Math.round(tempoMedioHoras)}h` : '—',               icon: '⏱', color: '#92400e', bg: '#fef3c7' },
        ].map(m => (
          <div key={m.label} style={card}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 12 }}>{m.icon}</div>
            <p style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 4 }}>{m.value}</p>
            <p style={{ fontSize: 12, color: '#64748b' }}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* Terceira linha */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* OS recentes */}
        <div style={{ ...card, gridColumn: '1 / span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>OS recentes</h3>
            <a href="/os" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>Ver todas →</a>
          </div>
          {(osRecentes ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>Nenhuma OS ainda</p>
          ) : (osRecentes ?? []).map((os: any) => {
            const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
            return (
              <div key={os.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>#{os.numero}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{os.clientes?.nome ?? '—'}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>{os.modelo ?? os.defeito_relatado.slice(0, 30)}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{new Date(os.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Colunas direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Caixa hoje */}
          <div style={{ ...card }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>💰 Caixa hoje</h3>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>R$ {Number((caixaHoje as any)?.saldo_atual ?? 0).toFixed(2).replace('.', ',')}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Saldo atual · {(caixaHoje as any)?.total_vendas ?? 0} vendas</p>
          </div>

          {/* OS por técnico */}
          <div style={{ ...card }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>👨‍🔧 OS por técnico (mês)</h3>
            {tecnicoRanking.length === 0 ? (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>Nenhuma OS com técnico</p>
            ) : tecnicoRanking.map((t, i) => {
              const max = tecnicoRanking[0].total
              return (
                <div key={t.nome} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: '#374151', fontWeight: 500 }}>{t.nome}</span>
                    <span style={{ color: '#64748b' }}>{t.total} OS</span>
                  </div>
                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(t.total / max) * 100}%`, background: i === 0 ? '#6366f1' : '#a5b4fc', borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Ações rápidas */}
          <div style={card}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>⚡ Ações rápidas</h3>
            {[
              { href: '/os/nova', label: '+ Nova OS', color: '#6366f1', bg: '#eef2ff' },
              { href: '/pdv', label: '🛒 Abrir PDV', color: '#059669', bg: '#ecfdf5' },
              { href: '/crm', label: '📣 Ver CRM', color: '#d97706', bg: '#fffbeb' },
              { href: '/rotinas', label: '✅ Minhas tarefas', color: '#7c3aed', bg: '#f5f3ff' },
            ].map(a => (
              <a key={a.href} href={a.href} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', background: a.bg, borderRadius: 8, marginBottom: 6,
                textDecoration: 'none', fontSize: 13, fontWeight: 500, color: a.color,
              }}>
                {a.label} <span>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Status do sistema */}
      <div style={{ ...card }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>Status do sistema</h3>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Banco de dados', ok: true },
            { label: 'Autenticação', ok: true },
            { label: 'Sincronização', ok: true },
            { label: 'WhatsApp', ok: false, flag: true },
            { label: 'PIX', ok: false, flag: true },
            { label: 'IA Diagnóstico', ok: false, flag: true },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.flag ? '#94a3b8' : '#10b981' }} />
              <span style={{ color: '#374151' }}>{s.label}</span>
              <span style={{ fontSize: 11, color: s.flag ? '#94a3b8' : '#10b981' }}>{s.flag ? 'Desativado' : 'Online'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
