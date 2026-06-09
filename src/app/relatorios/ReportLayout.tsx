'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const RELATORIOS = [
  { href: '/relatorios/os',        icon: '🔧', label: 'Ordens de Serviço' },
  { href: '/relatorios/vendas',    icon: '💳', label: 'Vendas' },
  { href: '/relatorios/clientes',  icon: '👥', label: 'Clientes' },
  { href: '/relatorios/produtos',  icon: '🏷',  label: 'Produtos' },
  { href: '/relatorios/estoque',   icon: '📦', label: 'Estoque' },
  { href: '/relatorios/financeiro',icon: '💰', label: 'Financeiro' },
  { href: '/relatorios/fiscal',    icon: '🧾', label: 'Fiscal' },
  { href: '/relatorios/logs',      icon: '🔍', label: 'Logs do sistema' },
]

const PERIODOS = [
  { v: 'hoje', l: 'Hoje' },
  { v: '7d',   l: 'Últimos 7 dias' },
  { v: '30d',  l: 'Últimos 30 dias' },
  { v: '90d',  l: 'Últimos 90 dias' },
  { v: 'mes',  l: 'Este mês' },
  { v: 'mes_ant', l: 'Mês anterior' },
  { v: 'ano',  l: 'Este ano' },
  { v: 'livre', l: 'Período livre' },
]

export function periodoToDates(periodo: string, dataInicio: string, dataFim: string): { inicio: string; fim: string } {
  const now = new Date()
  const hoje = now.toISOString().split('T')[0]
  const fim = hoje
  switch (periodo) {
    case 'hoje':   return { inicio: hoje, fim: hoje }
    case '7d':     { const d = new Date(now); d.setDate(d.getDate()-7); return { inicio: d.toISOString().split('T')[0], fim } }
    case '30d':    { const d = new Date(now); d.setDate(d.getDate()-30); return { inicio: d.toISOString().split('T')[0], fim } }
    case '90d':    { const d = new Date(now); d.setDate(d.getDate()-90); return { inicio: d.toISOString().split('T')[0], fim } }
    case 'mes':    return { inicio: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], fim }
    case 'mes_ant':{ const d = new Date(now.getFullYear(), now.getMonth()-1, 1); const f = new Date(now.getFullYear(), now.getMonth(), 0); return { inicio: d.toISOString().split('T')[0], fim: f.toISOString().split('T')[0] } }
    case 'ano':    return { inicio: `${now.getFullYear()}-01-01`, fim }
    case 'livre':  return { inicio: dataInicio, fim: dataFim }
    default:       return { inicio: hoje, fim: hoje }
  }
}

export function ReportLayout({ children, title, subtitle, periodo, setPeriodo, dataInicio, setDataInicio, dataFim, setDataFim, onExport }: {
  children: React.ReactNode; title: string; subtitle?: string
  periodo: string; setPeriodo: (v: string) => void
  dataInicio: string; setDataInicio: (v: string) => void
  dataFim: string; setDataFim: (v: string) => void
  onExport?: () => void
}) {
  const pathname = usePathname()
  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      {/* Sidebar de relatórios */}
      <div style={{ width: 200, borderRight: '1px solid #e2e8f0', background: '#f8fafc', padding: '16px 10px', flexShrink: 0, overflowY: 'auto' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 8px', marginBottom: 8 }}>Relatórios</p>
        {RELATORIOS.map(r => (
          <Link key={r.href} href={r.href} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 2, textDecoration: 'none', fontSize: 13,
            background: pathname === r.href ? '#e0e7ff' : 'transparent',
            color: pathname === r.href ? '#3730a3' : '#374151',
            fontWeight: pathname === r.href ? 500 : 400,
          }}>
            <span style={{ fontSize: 14 }}>{r.icon}</span>{r.label}
          </Link>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header + Filtros */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{title}</h1>
              {subtitle && <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{subtitle}</p>}
            </div>
            {onExport && (
              <button onClick={onExport} style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                ⬇ Exportar CSV
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={inp}>
              {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
            {periodo === 'livre' && (
              <>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={inp} />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>até</span>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={inp} />
              </>
            )}
          </div>
        </div>
        {/* Dados */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f8fafc' }}>{children}</div>
      </div>
    </div>
  )
}

export default PERIODOS
