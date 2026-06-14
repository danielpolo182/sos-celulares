// src/app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { processBot } from '@/lib/whatsapp/bot'
import { escalateToHuman } from '@/lib/whatsapp/escalate'
import { sendMessage } from '@/lib/whatsapp/send'

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

// POST: recebe mensagens do WhatsApp
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Valida assinatura HMAC-SHA256 se META_APP_SECRET estiver configurado
  const appSecret = process.env.META_APP_SECRET
  if (appSecret) {
    const signature = request.headers.get('x-hub-signature-256')
    if (!signature) {
      return NextResponse.json({ error: 'missing signature' }, { status: 401 })
    }
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const entry = (body as { entry?: unknown[] })?.entry?.[0] as {
    changes?: { value?: {
      phone_number_id?: string
      messages?: { from: string; text?: { body?: string }; id?: string }[]
    } }[]
  } | undefined

  const value = entry?.changes?.[0]?.value
  const msg = value?.messages?.[0]
  if (!msg?.text?.body) {
    // Ack para outros tipos de evento (status, leitura, etc.)
    return NextResponse.json({ ok: true })
  }

  const phoneNumberId = value?.phone_number_id
  const fromPhone = msg.from
  const msgText = msg.text.body

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Busca config da filial pelo phone_number_id
  const { data: config } = await supabase
    .from('wa_config')
    .select('filial_id, phone_number_id, access_token, bot_ativo')
    .eq('phone_number_id', phoneNumberId)
    .single()

  if (!config) {
    return NextResponse.json({ error: 'config not found' }, { status: 404 })
  }

  const waConfig = { phone_number_id: config.phone_number_id, access_token: config.access_token }

  // Busca ou cria conversa
  let conversaId: string
  const { data: existente } = await supabase
    .from('wa_conversas')
    .select('id, status')
    .eq('telefone', fromPhone)
    .eq('filial_id', config.filial_id)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existente) {
    conversaId = existente.id
    await supabase
      .from('wa_conversas')
      .update({ atualizado_em: new Date().toISOString() })
      .eq('id', conversaId)
  } else {
    const { data: nova } = await supabase
      .from('wa_conversas')
      .insert({ telefone: fromPhone, filial_id: config.filial_id, status: 'bot' })
      .select('id')
      .single()
    conversaId = nova!.id
  }

  // Salva mensagem de entrada
  await supabase.from('wa_mensagens').insert({
    conversa_id: conversaId,
    direcao: 'entrada',
    conteudo: msgText,
    wa_message_id: msg.id,
  })

  // Se conversa está com humano, não responde automaticamente
  if (existente?.status === 'humano') {
    return NextResponse.json({ ok: true })
  }

  // Bot desativado — resposta automática simples
  if (!config.bot_ativo) {
    return NextResponse.json({ ok: true })
  }

  // Processa com bot Claude Haiku
  const { resposta, escalou } = await processBot(
    msgText,
    fromPhone,
    conversaId,
    supabase,
    config.filial_id
  )

  if (escalou) {
    await escalateToHuman(conversaId, { ...waConfig, filial_id: config.filial_id }, supabase)
  } else {
    await sendMessage(waConfig, fromPhone, resposta)
    await supabase.from('wa_mensagens').insert({
      conversa_id: conversaId,
      direcao: 'saida',
      conteudo: resposta,
    })
  }

  return NextResponse.json({ ok: true })
}
