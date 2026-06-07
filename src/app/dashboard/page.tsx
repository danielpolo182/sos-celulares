import { createClient } from '@/lib/supabase/server'

const metrics = [
  { label: 'OS Abertas hoje', value: '0', icon: '🔧', color: '#6366f1', bg: '#eef2ff' },
  { label: 'OS Finalizadas', value: '0', icon: '✅', color: '#10b981', bg: '#ecfdf5' },
  { label: 'Vendas hoje', value: 'R$ 0', icon: '💳', color: '#f59e0b', bg: '#fffbeb' },
  { label: 'Clientes ativos', value: '0', icon: '👥', color: '#3b82f6', bg: '#eff6ff' },
]

const statusColors: Record<string, { bg: string; color: string; label: string }> = {
  aberta:      { bg: '#eff6ff', color: '#1d4ed8', label: 'Aberta' },
  em_andamento:{ bg: '#fef3c7', color: '#92400e', label: 'Em andamento' },
  aguardando:  { bg: '#faf5ff', color: '#6b21a8', label: 'Aguardando peça' },
  pronta:      { bg: '#ecfdf5', color: '#065f46', label: 'Pronta' },
  entregue:    { bg: '#f0fdf4', color: '#14532d', label: 'Entregue' },
  cancelada:   { bg: '#fef2f2', color: '#991b1b', label: 'Cancelada' },
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const userName = user?.email?.split('@')[0] ?? 'usuário'
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ padding: '32px 36px', fontFamily: 'var(--font-sans)' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 24, fontWeight: 600, color: '#0f172a',
          letterSpacing: '-0.02em', marginBottom: 4,
        }}>
          {greeting}, {userName} 👋
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', textTransform: 'capitalize' }}>
          {dateStr}
        </p>
      </div>

      {/* Metrics grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 32,
      }}>
        {metrics.map(m => (
          <div key={m.label} style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '20px 22px',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: m.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, marginBottom: 14,
            }}>
              {m.icon}
            </div>
            <div style={{
              fontSize: 26, fontWeight: 600, color: '#0f172a',
              letterSpacing: '-0.02em', marginBottom: 4,
            }}>
              {m.value}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* OS recentes */}
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '18px 22px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
              Ordens de Serviço recentes
            </h2>
            <a href="/os" style={{
              fontSize: 13, color: '#6366f1', textDecoration: 'none', fontWeight: 500,
            }}>
              Ver todas →
            </a>
          </div>

          {/* Empty state */}
          <div style={{
            padding: '60px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Nenhuma OS ainda
            </p>
            <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
              As ordens de serviço criadas aparecerão aqui
            </p>
            <a href="/os/nova" style={{
              display: 'inline-block',
              padding: '9px 18px',
              background: '#6366f1',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
            }}>
              + Nova OS
            </a>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Ações rápidas */}
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14 }}>
              Ações rápidas
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { href: '/os/nova', icon: '🔧', label: 'Nova OS', color: '#6366f1' },
                { href: '/clientes/novo', icon: '👤', label: 'Novo cliente', color: '#10b981' },
                { href: '/pdv', icon: '💳', label: 'Iniciar venda', color: '#f59e0b' },
                { href: '/estoque', icon: '📦', label: 'Ver estoque', color: '#3b82f6' },
              ].map(a => (
                <a key={a.href} href={a.href} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: 13, fontWeight: 500,
                  color: '#374151',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  {a.label}
                  <span style={{ marginLeft: 'auto', color: '#d1d5db', fontSize: 14 }}>→</span>
                </a>
              ))}
            </div>
          </div>

          {/* Status do sistema */}
          <div style={{
            background: '#0f172a',
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', marginBottom: 14 }}>
              Status do sistema
            </h3>
            {[
              { label: 'Banco de dados', ok: true },
              { label: 'Autenticação', ok: true },
              { label: 'Sincronização', ok: true },
              { label: 'WhatsApp', ok: false, flag: true },
              { label: 'PIX', ok: false, flag: true },
            ].map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{s.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  padding: '2px 8px', borderRadius: 20,
                  background: s.flag ? 'rgba(100,116,139,0.15)' : 'rgba(16,185,129,0.15)',
                  color: s.flag ? '#64748b' : '#10b981',
                }}>
                  {s.flag ? 'Desativado' : 'Online'}
                </span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
