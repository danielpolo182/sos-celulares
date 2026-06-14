// src/app/api/whatsapp/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyStatusChange } from '@/lib/whatsapp/notify'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { osId, newStatus } = await request.json()
  if (!osId || !newStatus) return NextResponse.json({ error: 'missing params' }, { status: 400 })

  // Fire and forget — erros não afetam o fluxo da OS
  notifyStatusChange(osId, newStatus).catch(err =>
    console.error('[notify route]', err)
  )

  return NextResponse.json({ ok: true })
}
