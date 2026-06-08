'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { href: '/os', icon: '🔧', label: 'Ordens de Serviço' },
  { href: '/garantias', icon: '🛡', label: 'Garantias' },
  { href: '/clientes', icon: '👥', label: 'Clientes' },
  { href: '/crm', icon: '📣', label: 'CRM & Acompanhamento' },
  { href: '/pdv', icon: '💳', label: 'PDV / Vendas' },
  { href: '/estoque', icon: '📦', label: 'Estoque' },
  { href: '/fornecedores', icon: '🏭', label: 'Fornecedores' },
  { href: '/rotinas', icon: '✅', label: 'Rotinas' },
  { href: '/pos-venda', icon: '⭐', label: 'Pós-venda' },
  { href: '/configuracoes', icon: '⚙️', label: 'Configurações' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside style={{
      width: '240px',
      minHeight: '100vh',
      background: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: '#6366f1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>📱</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              SOS Celulares
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
              Sistema de Gestão
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase' }}>
          Menu principal
        </div>
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 7,
                marginBottom: 2,
                textDecoration: 'none',
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: active ? '#a5b4fc' : '#64748b',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                transition: 'all 0.15s',
                borderLeft: active ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 15, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 10px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 10px',
            borderRadius: 7,
            background: 'transparent',
            border: 'none',
            color: '#475569',
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.background = 'rgba(239,68,68,0.08)'
            el.style.color = '#fca5a5'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.background = 'transparent'
            el.style.color = '#475569'
          }}
        >
          <span style={{ fontSize: 15 }}>↩</span>
          Sair do sistema
        </button>
      </div>
    </aside>
  )
}
