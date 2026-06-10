'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type NavItem = {
  href: string
  icon: string
  label: string
  children?: NavItem[]
}

const NAV: NavItem[] = [
  {
    label: 'Principal',
    href: '',
    icon: '',
    children: [
      { href: '/dashboard',    icon: 'ti-layout-dashboard', label: 'Dashboard' },
      { href: '/os',           icon: 'ti-tool',             label: 'Ordens de Serviço' },
      { href: '/garantias',    icon: 'ti-shield-check',     label: 'Garantias' },
      { href: '/clientes',     icon: 'ti-users',            label: 'Clientes' },
      { href: '/crm',          icon: 'ti-speakerphone',     label: 'CRM & Acomp.' },
    ],
  },
  {
    label: 'Operações',
    href: '',
    icon: '',
    children: [
      { href: '/pdv',          icon: 'ti-receipt',          label: 'PDV / Vendas' },
      { href: '/produtos',     icon: 'ti-tag',              label: 'Produtos' },
      { href: '/estoque',      icon: 'ti-package',          label: 'Estoque' },
      { href: '/fornecedores', icon: 'ti-building-store',   label: 'Fornecedores' },
      { href: '/contratos',    icon: 'ti-file-description', label: 'Contratos' },
    ],
  },
  {
    label: 'Gestão',
    href: '',
    icon: '',
    children: [
      { href: '/rotinas',      icon: 'ti-checklist',        label: 'Rotinas' },
      { href: '/fechamento',   icon: 'ti-lock',             label: 'Fechamento' },
      { href: '/aparelhos',    icon: 'ti-device-mobile-up', label: 'Compra & Venda' },
      { href: '/relatorios',    icon: 'ti-chart-bar',    label: 'Relatórios' },
    ],
  },
  {
    label: 'Sistema',
    href: '',
    icon: '',
    children: [
      { href: '/usuarios',      icon: 'ti-user-circle',  label: 'Usuários' },
      { href: '/configuracoes', icon: 'ti-settings',     label: 'Configurações' },
    ],
  },
]

function NavItem({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href.length > 1 && pathname?.startsWith(item.href + '/'))
  const hasChildren = !!item.children?.length
  const anyChildActive = hasChildren && item.children!.some(c =>
    pathname === c.href || (c.href.length > 1 && pathname?.startsWith(c.href))
  )
  const [open, setOpen] = useState(anyChildActive)

  // Ícones de estado
  const iconColor = isActive
    ? '#818cf8'
    : depth > 0
    ? '#4b5563'
    : '#4b5563'

  const labelColor = isActive ? '#c7d2fe' : '#6b7280'
  const labelWeight = isActive ? 500 : 400

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center',
    gap: 9, padding: depth > 0 ? '6px 10px 6px 28px' : '7px 10px',
    borderRadius: 8, marginBottom: 1,
    background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
    cursor: 'pointer', border: 'none', width: '100%',
    textAlign: 'left', textDecoration: 'none',
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: 12.5, fontWeight: labelWeight,
    color: labelColor, letterSpacing: '-0.01em',
    transition: 'background 0.12s, color 0.12s',
    whiteSpace: 'nowrap', overflow: 'hidden',
  }

  if (hasChildren && depth === 0) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          style={{ ...itemStyle, color: open || anyChildActive ? '#c7d2fe' : '#6b7280', background: open || anyChildActive ? 'rgba(99,102,241,0.08)' : 'transparent' }}
        >
          <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: open || anyChildActive ? '#818cf8' : '#4b5563', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 11, color: '#374151', flexShrink: 0, transition: 'transform 0.2s' }} aria-hidden="true" />
        </button>
        {open && (
          <div style={{ marginBottom: 2 }}>
            {item.children!.map(child => <NavItem key={child.href} item={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link href={item.href} style={itemStyle}>
      <i
        className={`ti ${item.icon}`}
        style={{ fontSize: depth > 0 ? 13 : 15, color: iconColor, flexShrink: 0 }}
        aria-hidden="true"
      />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
    </Link>
  )
}

export default function Sidebar() {
  const router = useRouter()
  const supabase = createClient()
  const [usuario, setUsuario] = useState({ nome: '', papel: '' })
  const [pendOS, setPendOS] = useState(0)
  const [pendWA, setPendWA] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('perfis').select('nome,papel').eq('id', user.id).single()
      if (p) setUsuario({ nome: p.nome, papel: p.papel })
      const [{ count }, { data: wa }] = await Promise.all([
        supabase.from('ordens_servico').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'em_andamento']).is('deleted_at', null),
        supabase.from('vw_wa_resumo_dia').select('pendentes'),
      ])
      setPendOS(count ?? 0)
      setPendWA((wa ?? []).reduce((s: number, r: any) => s + (r.pendentes ?? 0), 0))
    }
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [supabase])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = usuario.nome ? usuario.nome.charAt(0).toUpperCase() : 'U'

  return (
    <>
      {/* Carregar Tabler Icons */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />

      <aside style={{
        width: 240, minWidth: 240, maxWidth: 240,
        height: '100vh', background: '#111827',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        position: 'fixed', top: 0, left: 0, zIndex: 50,
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>

        {/* Logo */}
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-device-mobile" style={{ color: '#fff', fontSize: 15 }} aria-hidden="true" />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>SOS Celulares</div>
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 1 }}>gestão · assistência</div>
            </div>
          </div>
        </div>

        {/* Alertas rápidos */}
        {(pendOS > 0 || pendWA > 0) && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pendOS > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', padding: '3px 8px', borderRadius: 20 }}>
                <i className="ti ti-clock-hour-4" style={{ fontSize: 12 }} aria-hidden="true" />
                {pendOS} OS
              </div>
            )}
            {pendWA > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#34d399', background: 'rgba(52,211,153,0.08)', padding: '3px 8px', borderRadius: 20 }}>
                <i className="ti ti-brand-whatsapp" style={{ fontSize: 12 }} aria-hidden="true" />
                {pendWA} WA
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '6px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV.map((section, si) => (
            <div key={si} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 9.5, fontWeight: 500, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 3px' }}>
                {section.label}
              </div>
              {section.children!.map(item => <NavItem key={item.href} item={item} />)}
              {si < NAV.length - 1 && (
                <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '6px 10px 2px' }} />
              )}
            </div>
          ))}
        </nav>

        {/* Footer — usuário */}
        <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#818cf8', flexShrink: 0 }}>
              {initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {usuario.nome || 'Usuário'}
              </div>
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'capitalize' }}>{usuario.papel || 'admin'}</div>
            </div>
            <button
              onClick={logout}
              title="Sair"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#4b5563', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#4b5563' }}
            >
              <i className="ti ti-logout" style={{ fontSize: 15 }} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}