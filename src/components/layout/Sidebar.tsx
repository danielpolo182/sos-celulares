'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type NavItem = { href: string; icon: string; label: string; children?: NavItem[] }

const navItems: NavItem[] = [
  { href: '/dashboard',     icon: '⊞',  label: 'Dashboard' },
  { href: '/os',            icon: '🔧', label: 'Ordens de Serviço' },
  { href: '/garantias',     icon: '🛡',  label: 'Garantias' },
  { href: '/clientes',      icon: '👥', label: 'Clientes' },
  { href: '/crm',           icon: '📣', label: 'CRM & Acompanhamento' },
  { href: '/pdv',           icon: '💳', label: 'PDV / Vendas' },
  { href: '/produtos',      icon: '🏷',  label: 'Produtos' },
  { href: '/estoque',       icon: '📦', label: 'Estoque' },
  { href: '/fornecedores',  icon: '🏭', label: 'Fornecedores' },
  { href: '/contratos',     icon: '📄', label: 'Contratos' },
  { href: '/rotinas',       icon: '✅', label: 'Rotinas' },
  { href: '/fechamento',    icon: '🔐', label: 'Fechamento' },
  {
    href: '/relatorios',
    icon: '📈',
    label: 'Relatórios',
    children: [
      { href: '/relatorios/os',        icon: '🔧', label: 'Ordens de Serviço' },
      { href: '/relatorios/vendas',    icon: '💳', label: 'Vendas' },
      { href: '/relatorios/clientes',  icon: '👥', label: 'Clientes' },
      { href: '/relatorios/produtos',  icon: '🏷',  label: 'Produtos' },
      { href: '/relatorios/estoque',   icon: '📦', label: 'Estoque' },
      { href: '/relatorios/financeiro',icon: '💰', label: 'Financeiro' },
      { href: '/relatorios/fiscal',    icon: '🧾', label: 'Fiscal' },
      { href: '/relatorios/logs',      icon: '🔍', label: 'Logs' },
    ],
  },
  { href: '/usuarios',      icon: '👤', label: 'Usuários' },
  { href: '/configuracoes', icon: '⚙️', label: 'Configurações' },
]

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href + '/'))
  const hasChildren = !!item.children?.length
  const anyChildActive = hasChildren && item.children!.some(c => pathname?.startsWith(c.href))
  const [open, setOpen] = useState(anyChildActive)

  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: depth > 0 ? '6px 10px 6px 26px' : '7px 10px',
    borderRadius: 6, marginBottom: 1,
    fontSize: depth > 0 ? 12 : 12.5,
    fontWeight: isActive ? 500 : 400,
    letterSpacing: '-0.01em', lineHeight: 1.4,
    transition: 'background 0.12s, color 0.12s',
    background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
    color: isActive ? '#a5b4fc' : '#64748b',
    borderLeft: depth === 0 ? `2px solid ${isActive ? '#6366f1' : 'transparent'}` : 'none',
    textDecoration: 'none', border: 'none', cursor: 'pointer',
    width: '100%', textAlign: 'left',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  }

  if (hasChildren) {
    return (
      <div style={{ width: '100%' }}>
        <button onClick={() => setOpen(!open)} style={{ ...style, color: open ? '#c4b5fd' : '#64748b', background: open ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
          <span style={{ fontSize: 8, opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
        </button>
        {open && (
          <div>
            {item.children!.map(child => <NavLink key={child.href} item={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link href={item.href} style={style}>
      <span style={{ fontSize: depth > 0 ? 12 : 13, flexShrink: 0 }}>{item.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
    </Link>
  )
}

export default function Sidebar() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside style={{
      width: 240, minWidth: 240, maxWidth: 240,
      height: '100vh', background: '#0f172a',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      position: 'fixed', top: 0, left: 0, zIndex: 50,
      overflow: 'hidden', // previne scroll horizontal
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📱</div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>SOS Celulares</div>
            <div style={{ fontSize: 10.5, color: '#334155' }}>Sistema de Gestão</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {navItems.map(item => <NavLink key={item.href} item={item} />)}
      </nav>

      {/* Logout */}
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <button onClick={handleLogout} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 6, background: 'transparent',
          border: 'none', color: '#475569', fontSize: 12.5,
          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
          whiteSpace: 'nowrap',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569' }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>↩</span>
          <span>Sair do sistema</span>
        </button>
      </div>
    </aside>
  )
}
