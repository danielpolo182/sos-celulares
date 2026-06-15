'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import WhatsAppModal from '@/components/WhatsAppModal'

type NavItem = {
  href: string
  icon: string
  label: string
  modulo?: string
  children?: NavItem[]
}

const HREF_MODULO: Record<string, string> = {
  '/dashboard':    'dashboard',
  '/os':           'os',
  '/garantias':    'os',
  '/clientes':     'clientes',
  '/crm':          'crm',
  '/pdv':          'pdv',
  '/estoque':      'estoque',
  '/fornecedores': 'estoque',
  '/compras':      'compras',
  '/contratos':    'contratos',
  '/rotinas':      'rotinas',
  '/fechamento':   'fechamento',
  '/aparelhos':    'aparelhos',
  '/relatorios':   'relatorios',
  '/whatsapp':     'whatsapp',
  '/usuarios':     'configuracoes',
  '/configuracoes':'configuracoes',
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
      { href: '/whatsapp',    icon: 'ti-brand-whatsapp',   label: 'Inbox WhatsApp' },
    ],
  },
  {
    label: 'Operações',
    href: '',
    icon: '',
    children: [
      { href: '/pdv',          icon: 'ti-receipt',          label: 'PDV / Vendas' },
      { href: '/estoque',      icon: 'ti-package',          label: 'Produtos & Estoque' },
      { href: '/compras',      icon: 'ti-shopping-cart',    label: 'Lista de compras' },
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
      { href: '/relatorios',   icon: 'ti-chart-bar',        label: 'Relatórios' },
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

  const iconColor = isActive ? '#93c5fd' : '#64748b'
  const labelColor = isActive ? '#f1f5f9' : '#94a3b8'
  const labelWeight = isActive ? 600 : 400

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center',
    gap: 9, padding: depth > 0 ? '6px 10px 6px 28px' : '7px 10px',
    borderRadius: 8, marginBottom: 1,
    background: isActive ? 'rgba(37,99,235,0.2)' : 'transparent',
    cursor: 'pointer', border: 'none', width: '100%',
    textAlign: 'left', textDecoration: 'none',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    fontSize: 12.5, fontWeight: labelWeight,
    color: labelColor, letterSpacing: '-0.01em',
    transition: 'background 0.12s, color 0.12s',
    whiteSpace: 'nowrap', overflow: 'hidden',
  }

  if (hasChildren && depth === 0) {
    const groupActive = open || anyChildActive
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          style={{
            ...itemStyle,
            color: groupActive ? '#e2e8f0' : '#64748b',
            background: groupActive ? 'rgba(37,99,235,0.12)' : 'transparent',
          }}
        >
          <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: groupActive ? '#93c5fd' : '#64748b', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 11, color: '#475569', flexShrink: 0 }} aria-hidden="true" />
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
  const [waModalAberto, setWaModalAberto] = useState(false)
  const [modulosPermitidos, setModulosPermitidos] = useState<Set<string> | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('perfis').select('nome,papel').eq('id', user.id).single()
      if (p) {
        setUsuario({ nome: p.nome, papel: p.papel })
        if (['administrador', 'gerente', 'admin'].includes(p.papel)) {
          setModulosPermitidos(null)
        } else {
          try {
            const { data: perms } = await supabase
              .from('permissoes_cargo')
              .select('modulo,permitido')
              .eq('cargo', p.papel)
            if (perms && perms.length > 0) {
              const negados = new Set(perms.filter((r: any) => !r.permitido).map((r: any) => r.modulo as string))
              setModulosPermitidos(negados.size > 0 ? negados : null)
            }
          } catch {
            setModulosPermitidos(null)
          }
        }
      }
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

  function itemVisivel(item: NavItem): boolean {
    if (!modulosPermitidos) return true
    const modulo = HREF_MODULO[item.href]
    if (!modulo) return true
    return !modulosPermitidos.has(modulo)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = usuario.nome ? usuario.nome.charAt(0).toUpperCase() : 'U'

  return (
    <>
      <WhatsAppModal open={waModalAberto} onClose={() => setWaModalAberto(false)} />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" />

      <aside style={{
        width: 240, minWidth: 240, maxWidth: 240,
        height: '100vh', background: '#1e293b',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(0,0,0,0.15)',
        position: 'fixed', top: 0, left: 0, zIndex: 50,
        overflow: 'hidden',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}>

        {/* Logo */}
        <div style={{ padding: '16px 14px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 24,
            letterSpacing: '0.03em',
            lineHeight: 1,
            color: '#f1f5f9',
            display: 'inline-flex',
            alignItems: 'center',
          }}>
            Octa
            <span style={{
              color: '#ffffff',
              background: '#2563eb',
              padding: '0.04em 0.18em 0.06em',
              borderRadius: '0.12em',
              marginLeft: '0.1em',
              display: 'inline-block',
              letterSpacing: '0.01em',
            }}>OS</span>
          </div>
        </div>

        {/* Alertas rápidos */}
        {(pendOS > 0 || pendWA > 0) && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pendOS > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#fcd34d', background: 'rgba(251,191,36,0.12)', padding: '3px 8px', borderRadius: 20 }}>
                <i className="ti ti-clock-hour-4" style={{ fontSize: 12 }} aria-hidden="true" />
                {pendOS} OS
              </div>
            )}
            {pendWA > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6ee7b7', background: 'rgba(52,211,153,0.12)', padding: '3px 8px', borderRadius: 20 }}>
                <i className="ti ti-brand-whatsapp" style={{ fontSize: 12 }} aria-hidden="true" />
                {pendWA} WA
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '6px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV.map((section, si) => {
            const visibleChildren = section.children!.filter(itemVisivel)
            if (visibleChildren.length === 0) return null
            return (
              <div key={si} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 3px' }}>
                  {section.label}
                </div>
                {visibleChildren.map(item =>
                  item.href === '/whatsapp' ? (
                    <button
                      key={item.href}
                      onClick={() => setWaModalAberto(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 6px 28px', borderRadius: 8, marginBottom: 1, background: 'transparent', cursor: 'pointer', border: 'none', width: '100%', textAlign: 'left', fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 12.5, fontWeight: 400, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', transition: 'background 0.12s, color 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
                    >
                      <i className="ti ti-brand-whatsapp" style={{ fontSize: 13, color: '#6ee7b7', flexShrink: 0 }} aria-hidden="true" />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>Inbox WhatsApp</span>
                      {pendWA > 0 && <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>{pendWA}</span>}
                    </button>
                  ) : (
                    <NavItem key={item.href} item={item} />
                  )
                )}
                {si < NAV.length - 1 && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 10px 2px' }} />
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer — usuário */}
        <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(37,99,235,0.25)', border: '1px solid rgba(37,99,235,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#93c5fd', flexShrink: 0,
            }}>
              {initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {usuario.nome || 'Usuário'}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'capitalize' }}>{usuario.papel || 'admin'}</div>
            </div>
            <button
              onClick={logout}
              title="Sair"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#475569', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#475569' }}
            >
              <i className="ti ti-logout" style={{ fontSize: 15 }} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
