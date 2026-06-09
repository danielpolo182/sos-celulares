'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [pendencias, setPendencias] = useState({ os: 0, wa: 0 })
  const [usuario, setUsuario] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('perfis').select('nome').eq('id', user.id).single()
        if (p) setUsuario(p.nome)
      }
      const [{ count: osCount }, { data: waRes }] = await Promise.all([
        supabase.from('ordens_servico').select('id', { count: 'exact', head: true }).in('status', ['aberta','em_andamento']).is('deleted_at', null),
        supabase.from('vw_wa_resumo_dia').select('pendentes'),
      ])
      const waPend = (waRes ?? []).reduce((s: number, r: any) => s + (r.pendentes ?? 0), 0)
      setPendencias({ os: osCount ?? 0, wa: waPend })
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [supabase])

  if (pathname?.startsWith('/auth')) return null

  const PrimaryBtn = ({ label, icon, href }: { label: string; icon: string; href: string }) => (
    <button onClick={() => router.push(href)} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 16px', borderRadius: 7,
      border: 'none', background: '#6366f1',
      color: '#fff', fontSize: 13, fontWeight: 500,
      cursor: 'pointer', fontFamily: "'Inter', sans-serif",
      letterSpacing: '-0.01em', whiteSpace: 'nowrap',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#6366f1' }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  )

  const SecondaryBtn = ({ label, icon, href }: { label: string; icon: string; href: string }) => (
    <button onClick={() => router.push(href)} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 14px', borderRadius: 7,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.06)',
      color: '#cbd5e1', fontSize: 13, fontWeight: 400,
      cursor: 'pointer', fontFamily: "'Inter', sans-serif",
      letterSpacing: '-0.01em', whiteSpace: 'nowrap',
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#f1f5f9' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#cbd5e1' }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  )

  return (
    <div style={{
      height: 52, background: '#0f172a',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center',
      paddingLeft: 240, paddingRight: 20, gap: 8,
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <PrimaryBtn label="Nova OS" icon="🔧" href="/os/nova" />
        <SecondaryBtn label="Nova venda" icon="💳" href="/pdv" />
        <SecondaryBtn label="Rotinas" icon="✅" href="/rotinas" />

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 6px' }} />

        {pendencias.os > 0 && (
          <button onClick={() => router.push('/os')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 20, border: 'none', background: 'rgba(251,191,36,0.12)',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.12)' }}>
            <span style={{ background: '#fbbf24', color: '#0f172a', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>{pendencias.os}</span>
            <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 500 }}>OS pendentes</span>
          </button>
        )}

        {pendencias.wa > 0 && (
          <button onClick={() => router.push('/crm')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 20, border: 'none', background: 'rgba(16,185,129,0.1)',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.1)' }}>
            <span style={{ background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>{pendencias.wa}</span>
            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>WA pendentes</span>
          </button>
        )}
      </div>

      {/* Usuário */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>
          {usuario.charAt(0).toUpperCase() || 'U'}
        </div>
        <span style={{ fontSize: 12.5, color: '#64748b', fontWeight: 400 }}>{usuario || 'Usuário'}</span>
      </div>
    </div>
  )
}
