'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [pendencias, setPendencias] = useState({ os: 0, wa: 0 })

  useEffect(() => {
    async function load() {
      const [{ count }, { data: wa }] = await Promise.all([
        supabase.from('ordens_servico').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'em_andamento']).is('deleted_at', null),
        supabase.from('vw_wa_resumo_dia').select('pendentes'),
      ])
      setPendencias({
        os: count ?? 0,
        wa: (wa ?? []).reduce((s: number, r: any) => s + (r.pendentes ?? 0), 0),
      })
    }
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [supabase])

  if (pathname?.startsWith('/login')) return null

  const btn = (label: string, icon: string, href: string, primary = false) => (
    <button
      onClick={() => router.push(href)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: primary ? '7px 16px' : '6px 13px',
        borderRadius: 7, border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)',
        background: primary ? '#6366f1' : 'rgba(255,255,255,0.05)',
        color: primary ? '#fff' : '#9ca3af',
        fontSize: 12.5, fontWeight: primary ? 500 : 400,
        cursor: 'pointer', fontFamily: 'inherit',
        letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        if (primary) e.currentTarget.style.background = '#4f46e5'
        else { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#e5e7eb' }
      }}
      onMouseLeave={e => {
        if (primary) e.currentTarget.style.background = '#6366f1'
        else { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#9ca3af' }
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
      {label}
    </button>
  )

  return (
    <div style={{
      height: 48, background: '#111827',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', alignItems: 'center',
      paddingLeft: 252, paddingRight: 20, gap: 8,
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        {btn('Nova OS', 'ti-plus', '/os/nova', true)}
        {btn('Nova venda', 'ti-receipt', '/pdv')}
        {btn('Rotinas', 'ti-checklist', '/rotinas')}

        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

        {pendencias.os > 0 && (
          <button onClick={() => router.push('/os')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, border: 'none', background: 'rgba(251,191,36,0.08)', cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.14)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.08)' }}>
            <i className="ti ti-clock-hour-4" style={{ fontSize: 13, color: '#fbbf24' }} aria-hidden="true" />
            <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 500 }}>{pendencias.os} OS pendentes</span>
          </button>
        )}

        {pendencias.wa > 0 && (
          <button onClick={() => router.push('/crm')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, border: 'none', background: 'rgba(52,211,153,0.08)', cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.14)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.08)' }}>
            <i className="ti ti-brand-whatsapp" style={{ fontSize: 13, color: '#34d399' }} aria-hidden="true" />
            <span style={{ fontSize: 12, color: '#34d399', fontWeight: 500 }}>{pendencias.wa} WA pendentes</span>
          </button>
        )}
      </div>
    </div>
  )
}
