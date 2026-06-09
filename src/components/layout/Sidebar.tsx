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
  { href: '/fechamento',    icon: '🔐', label: 'Fechamento do dia' },
  {
    href: '/relatorios',
    icon: '📈',
    label: 'Relatórios',
    children: [
      { href: '/relatorios/os',           icon: '🔧', label: 'Ordens de Serviço' },
      { href: '/relatorios/vendas',        icon: '💳', label: 'Vendas' },
      { href: '/relatorios/clientes',      icon: '👥', label: 'Clientes' },
      { href: '/relatorios/produtos',      icon: '🏷',  label: 'Produtos' },
      { href: '/relatorios/estoque',       icon: '📦', label: 'Estoque' },
      { href: '/relatorios/financeiro',    icon: '💰', label: 'Financeiro' },
      { href: '/relatorios/fiscal',        icon: '🧾', label: 'Fiscal' },
      { href: '/relatorios/logs',          icon: '🔍', label: 'Logs do sistema' },
    ],
  },
  { href: '/usuarios',      icon: '👤', label: 'Usuários' },
  { href: '/configuracoes', icon: '⚙️', label: 'Configurações' },
]

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const hasChildren = item.children && item.children.length > 0
  const anyChildActive = hasChildren && item.children!.some(c => pathname.startsWith(c.href))
  const [open, setOpen] = useState(anyChildActive)

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: `8px ${depth > 0 ? 22 : 10}px`, borderRadius: 7, marginBottom: 2,
            border: 'none', cursor: 'pointer', textAlign: 'left',
            background: open ? 'rgba(99,102,241,0.08)' : 'transparent',
            color: open ? '#a5b4fc' : '#64748b',
            fontSize: 13, fontWeight: open ? 500 : 400,
          }}
        >
          <span style={{ fontSize: 14, opacity: open ? 1 : 0.7 }}>{item.icon}</span>
          <span style={{ flex: 1 }}>{item.label}</span>
          <span style={{ fontSize: 10, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>
        {open && (
          <div style={{ marginLeft: 8 }}>
            {item.children!.map(child => (
              <NavLink key={child.href} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: `8px ${depth > 0 ? 20 : 10}px`, borderRadius: 7, marginBottom: 2,
        textDecoration: 'none',
        background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
        color: isActive ? '#a5b4fc' : depth > 0 ? '#94a3b8' : '#64748b',
        fontSize: depth > 0 ? 12 : 13,
        fontWeight: isActive ? 500 : 400,
        borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: depth > 0 ? 13 : 14, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
      {item.label}
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
    <aside style={{ width: '240px', minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50 }}>
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📱</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', letterSpacing: '-0.02em' }}>SOS Celulares</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>Sistema de Gestão</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        {navItems.map(item => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, background: 'transparent', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(239,68,68,0.08)'; el.style.color = '#fca5a5' }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'transparent'; el.style.color = '#475569' }}>
          <span style={{ fontSize: 15 }}>↩</span> Sair do sistema
        </button>
      </div>
    </aside>
  )
}
