'use client'

import { useEffect } from 'react'
import InboxPanel from '@/components/whatsapp/InboxPanel'

export default function WhatsAppModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Fechar com Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Fechado, o modal continua montado (só escondido) para manter a conversa selecionada ao reabrir
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: open ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(3px)',
      }}
    >
      {/* Modal box */}
      <div style={{
        width: '90vw', maxWidth: 900, height: '85vh',
        background: '#0f172a', borderRadius: 16,
        boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}>

        {/* Header do modal */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', flexShrink: 0 }}>
          <i className="ti ti-brand-whatsapp" style={{ fontSize: 18, color: '#6ee7b7' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', flex: 1 }}>Inbox WhatsApp</span>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', cursor: 'pointer', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        <InboxPanel ativo={open} larguraLista={280} />
      </div>
    </div>
  )
}
