'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [pendencias, setPendencias] = useState({ os: 0, wa: 0, rotinas: 0 })
  const [usuario, setUsuario] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('perfis').select('nome').eq('id', user.id).single()
        if (p) setUsuario(p.nome)
      }
      const hoje = new Date().toISOString().split('T')[0]
      const [{ count: osCount }, { data: waRes }] = await Promise.all([
        supabase.from('ordens_servico').select('id', { count: 'exact', head: true }).in('status', ['aberta','em_andamento']).is('deleted_at', null),
        supabase.from('vw_wa_resumo_dia').select('pendentes'),
      ])
      const waPend = (waRes ?? []).reduce((s: number, r: any) => s + (r.pendentes ?? 0), 0)
      setPendencias({ os: osCount ?? 0, wa: waPend, rotinas: 0 })
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [supabase])

  if (pathname?.startsWith('/auth')) return null

  const btn = (label: string, icon: string, href: string, badge?: number, primary?: boolean) => (
    <button onClick={() => router.push(href)} style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: primary ? '9px 18px' : '7px 14px',
      borderRadius: 8, border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)',
      background: primary ? '#6366f1' : 'rgba(255,255,255,0.08)',
      color: '#f8fafc', fontSize: primary ? 13 : 12, fontWeight: primary ? 600 : 500,
      cursor: 'pointer', position: 'relative', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ fontSize: primary ? 15 : 14 }}>{icon}</span>
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 20, minWidth: 18, textAlign: 'center' }}>{badge}</span>
      )}
    </button>
  )

  return (
    <div style={{ height: 52, background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', paddingLeft: 256, paddingRight: 20, gap: 8, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        {btn('Nova OS', '🔧', '/os/nova', undefined, true)}
        {btn('Nova venda', '💳', '/pdv')}
        {btn('Rotinas', '✅', '/rotinas', pendencias.rotinas)}
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
        {pendencias.os > 0 && (
          <span style={{ fontSize: 12, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ background: '#fbbf24', color: '#0f172a', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>{pendencias.os}</span>
            OS pendentes
          </span>
        )}
        {pendencias.wa > 0 && (
          <span style={{ fontSize: 12, color: '#86efac', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>{pendencias.wa}</span>
            WA pendentes
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
        <span>👤</span>
        <span style={{ color: '#94a3b8' }}>{usuario || 'Usuário'}</span>
      </div>
    </div>
  )
}
