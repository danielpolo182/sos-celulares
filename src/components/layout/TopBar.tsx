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
        borderRadius: 7,
        border: primary ? 'none' : '1px solid #e2e8f0',
        background: primary ? '#2563eb' : '#ffffff',
        color: primary ? '#ffffff' : '#475569',
        fontSize: 12.5, fontWeight: primary ? 600 : 400,
        cursor: 'pointer', fontFamily: 'inherit',
        letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        transition: 'all 0.15s',
        boxShadow: primary ? '0 1px 3px rgba(37,99,235,0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => {
        if (primary) {
          e.currentTarget.style.background = '#1d4ed8'
          e.currentTarget.style.boxShadow = '0 2px 6px rgba(37,99,235,0.4)'
        } else {
          e.currentTarget.style.background = '#f8fafc'
          e.currentTarget.style.color = '#0f172a'
        }
      }}
      onMouseLeave={e => {
        if (primary) {
          e.currentTarget.style.background = '#2563eb'
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(37,99,235,0.3)'
        } else {
          e.currentTarget.style.background = '#ffffff'
          e.currentTarget.style.color = '#475569'
        }
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
      {label}
    </button>
  )

  return (
    <div style={{
      height: 48,
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex', alignItems: 'center',
      paddingLeft: 252, paddingRight: 20, gap: 8,
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
      fontFamily: "'DM Sans', -apple-system, sans-serif",
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        {btn('Nova OS', 'ti-plus', '/os/nova', true)}
        {btn('Nova venda', 'ti-receipt', '/pdv')}
        {btn('Rotinas', 'ti-checklist', '/rotinas')}

        <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />

        {pendencias.os > 0 && (
          <button
            onClick={() => router.push('/os')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, border: '1px solid #fef3c7', background: '#fffbeb', cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef3c7' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fffbeb' }}
          >
            <i className="ti ti-clock-hour-4" style={{ fontSize: 13, color: '#d97706' }} aria-hidden="true" />
            <span style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>{pendencias.os} OS pendentes</span>
          </button>
        )}

        {pendencias.wa > 0 && (
          <button
            onClick={() => router.push('/crm')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, border: '1px solid #d1fae5', background: '#f0fdf4', cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#d1fae5' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4' }}
          >
            <i className="ti ti-brand-whatsapp" style={{ fontSize: 13, color: '#16a34a' }} aria-hidden="true" />
            <span style={{ fontSize: 12, color: '#166534', fontWeight: 500 }}>{pendencias.wa} WA pendentes</span>
          </button>
        )}
      </div>
    </div>
  )
}
