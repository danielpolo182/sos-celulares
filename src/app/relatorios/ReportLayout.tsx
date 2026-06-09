'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const RELATORIOS = [
  { href: '/relatorios/os',         icon: 'ti-tool',         label: 'Ordens de Serviço' },
  { href: '/relatorios/vendas',     icon: 'ti-receipt',      label: 'Vendas' },
  { href: '/relatorios/clientes',   icon: 'ti-users',        label: 'Clientes' },
  { href: '/relatorios/produtos',   icon: 'ti-tag',          label: 'Produtos' },
  { href: '/relatorios/estoque',    icon: 'ti-package',      label: 'Estoque' },
  { href: '/relatorios/financeiro', icon: 'ti-cash',         label: 'Financeiro' },
  { href: '/relatorios/fiscal',     icon: 'ti-file-invoice', label: 'Fiscal' },
  { href: '/relatorios/logs',       icon: 'ti-terminal-2',   label: 'Logs do sistema' },
]

const PERIODOS = [
  { v: 'hoje',    l: 'Hoje' },
  { v: '7d',      l: 'Últimos 7 dias' },
  { v: '30d',     l: 'Últimos 30 dias' },
  { v: '90d',     l: 'Últimos 90 dias' },
  { v: 'mes',     l: 'Este mês' },
  { v: 'mes_ant', l: 'Mês anterior' },
  { v: 'ano',     l: 'Este ano' },
  { v: 'livre',   l: 'Período livre' },
]

export function periodoToDates(periodo: string, dataInicio: string, dataFim: string): { inicio: string; fim: string } {
  const now = new Date()
  const hoje = now.toISOString().split('T')[0]
  const fim = hoje
  switch (periodo) {
    case 'hoje':    return { inicio: hoje, fim: hoje }
    case '7d':      { const d = new Date(now); d.setDate(d.getDate()-7);  return { inicio: d.toISOString().split('T')[0], fim } }
    case '30d':     { const d = new Date(now); d.setDate(d.getDate()-30); return { inicio: d.toISOString().split('T')[0], fim } }
    case '90d':     { const d = new Date(now); d.setDate(d.getDate()-90); return { inicio: d.toISOString().split('T')[0], fim } }
    case 'mes':     return { inicio: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], fim }
    case 'mes_ant': { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); const f = new Date(now.getFullYear(), now.getMonth(), 0); return { inicio: d.toISOString().split('T')[0], fim: f.toISOString().split('T')[0] } }
    case 'ano':     return { inicio: `${now.getFullYear()}-01-01`, fim }
    case 'livre':   return { inicio: dataInicio, fim: dataFim }
    default:        return { inicio: hoje, fim: hoje }
  }
}

export function ReportLayout({ children, title, subtitle, periodo, setPeriodo, dataInicio, setDataInicio, dataFim, setDataFim, onExport }: {
  children: React.ReactNode
  title: string
  subtitle?: string
  periodo: string
  setPeriodo: (v: string) => void
  dataInicio: string
  setDataInicio: (v: string) => void
  dataFim: string
  setDataFim: (v: string) => void
  onExport?: () => void
}) {
  const pathname = usePathname()

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Segunda sidebar — Relatórios */}
      <div style={{
        width: 200, minWidth: 200, flexShrink: 0,
        background: '#111827',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <i className="ti ti-chart-bar" style={{ fontSize: 14, color: '#818cf8' }} aria-hidden="true" />
            <span style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af', letterSpacing: '-0.01em' }}>Relatórios</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px' }}>
          {RELATORIOS.map(r => {
            const active = pathname === r.href
            return (
              <Link key={r.href} href={r.href} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 7, marginBottom: 1,
                textDecoration: 'none', fontSize: 12.5,
                fontWeight: active ? 500 : 400,
                color: active ? '#c7d2fe' : '#6b7280',
                background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                letterSpacing: '-0.01em',
                transition: 'background 0.12s, color 0.12s',
              }}>
                <i className={`ti ${r.icon}`} style={{ fontSize: 14, color: active ? '#818cf8' : '#4b5563', flexShrink: 0 }} aria-hidden="true" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Área de conteúdo */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Barra de filtros */}
        <div style={{
          padding: '14px 24px 12px',
          borderBottom: '1px solid #f1f5f9',
          background: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>{title}</h1>
              {subtitle && <p style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>{subtitle}</p>}
            </div>
            {onExport && (
              <button onClick={onExport} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 7,
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: 12.5, color: '#64748b', cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#374151' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748b' }}>
                <i className="ti ti-download" style={{ fontSize: 13 }} aria-hidden="true" />
                Exportar CSV
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
              style={{
                padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
                fontSize: 12.5, color: '#374151', background: '#fff', outline: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>

            {periodo === 'livre' && (
              <>
                <input
                  type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12.5, color: '#374151', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>até</span>
                <input
                  type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12.5, color: '#374151', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
                />
              </>
            )}
          </div>
        </div>

        {/* Dados */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px 24px', background: '#f8fafc' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default PERIODOS
