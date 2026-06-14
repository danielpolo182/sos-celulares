// src/app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET: Meta verifica o webhook com um challenge
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('wa_config')
    .select('filial_id')
    .eq('verify_token', token)
    .single()

  if (!data) {
    return NextResponse.json({ error: 'invalid token' }, { status: 403 })
  }

  return new NextResponse(challenge, { status: 200 })
}

// POST: placeholder — implementado no Plano B
export async function POST(_request: NextRequest) {
  return NextResponse.json({ ok: true })
}
