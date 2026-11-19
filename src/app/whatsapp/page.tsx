'use client'

import InboxPanel from '@/components/whatsapp/InboxPanel'

export default function WhatsAppInboxPage() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <InboxPanel titulo />
    </div>
  )
}
