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
      { href: '/relatorios/os',          icon: '🔧', label: 'Ordens de Serviço' },
      { href: '/relatorios/vendas',       icon: '💳', label: 'Vendas' },
      { href: '/relatorios/clientes',     icon: '👥', label: 'Clientes' },
      { href: '/relatorios/produtos',     icon: '🏷',  label: 'Produtos' },
      { href: '/relatorios/estoque',      icon: '📦', label: 'Estoque' },
      { href: '/relatorios/financeiro',   icon: '💰', label: 'Financeiro' },
      { href: '/relatorios/fiscal',       icon: '🧾', label: 'Fiscal' },
      { href: '/relatorios/logs',         icon: '🔍', label: 'Logs' },
    ],
  },
  { href: '/usuarios',      icon: '👤', label: 'Usuários' },
  { href: '/configuracoes', icon: '⚙️', label: 'Configurações' },
]

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href + '/'))
  const hasChildren = item.children && item.children.length > 0
  const anyChildActive = hasChildren && item.children!.some(c => pathname?.startsWith(c.href))
  const [open, setOpen] = useState(anyChildActive)

  const baseStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: depth > 0 ? '7px 12px 7px 28px' : '8px 12px',
    borderRadius: 7, marginBottom: 1, border: 'none',
    cursor: 'pointer', textAlign: 'left', width: '100%',
    fontSize: depth > 0 ? 12.5 : 13,
    fontFamily: "'Inter', sans-serif",
    fontWeight: isActive ? 500 : 400,
    letterSpacing: '-0.01em',
    transition: 'background 0.12s, color 0.12s',
    background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
    color: isActive ? '#a5b4fc' : depth > 0 ? '#64748b' : '#94a3b8',
    borderLeft: depth === 0 ? `2px solid ${isActive ? '#6366f1' : 'transparent'}` : 'none',
    textDecoration: 'none',
  }

  if (hasChildren) {
    return (
      <div>
        <button onClick={() => setOpen(!open)} style={{ ...baseStyle, color: open ? '#c4b5fd' : '#94a3b8', background: open ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
          <span style={{ fontSize: 14, opacity: 0.8, flexShrink: 0 }}>{item.icon}</span>
          <span style={{ flex: 1, lineHeight: 1.3 }}>{item.label}</span>
          <span style={{ fontSize: 9, opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
        </button>
        {open && (
          <div style={{ marginLeft: 4 }}>
            {item.children!.map(child => <NavLink key={child.href} item={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link href={item.href} style={baseStyle}>
      <span style={{ fontSize: depth > 0 ? 13 : 14, opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>{item.icon}</span>
      <span style={{ lineHeight: 1.3 }}>{item.label}</span>
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
      width: 240, minHeight: '100vh', background: '#0f172a',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📱</div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', lineHeight: 1.2 }}>SOS Celulares</div>
            <div style={{ fontSize: 11, color: '#334155', marginTop: 1 }}>Sistema de Gestão</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {navItems.map(item => <NavLink key={item.href} item={item} />)}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 8px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <button onClick={handleLogout} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 12px', borderRadius: 7, background: 'transparent',
          border: 'none', color: '#475569', fontSize: 13,
          cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(239,68,68,0.08)'; el.style.color = '#fca5a5' }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'transparent'; el.style.color = '#475569' }}>
          <span style={{ fontSize: 14 }}>↩</span>
          <span>Sair do sistema</span>
        </button>
      </div>
    </aside>
  )
}
