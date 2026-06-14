import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function makeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  let body: { action?: string; data?: { id?: string } }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Só processa pagamentos aprovados
  if (body.action !== 'payment.updated' || !body.data?.id) {
    return NextResponse.json({ ok: true })
  }

  const mpPaymentId = Number(body.data.id)
  const supabase = makeServiceClient()

  // Busca cobrança pelo mp_payment_id
  const { data: cobranca } = await supabase
    .from('pix_cobrancas')
    .select('id, filial_id, status, tipo_referencia, referencia_id')
    .eq('mp_payment_id', mpPaymentId)
    .single()

  if (!cobranca || cobranca.status === 'aprovado') {
    return NextResponse.json({ ok: true })
  }

  // Valida assinatura HMAC se webhook_secret estiver configurado
  const { data: config } = await supabase
    .from('pix_config')
    .select('mp_webhook_secret')
    .eq('filial_id', cobranca.filial_id)
    .single()

  if (config?.mp_webhook_secret) {
    // Mercado Pago envia: x-signature: ts=...,v1=...
    const sig = request.headers.get('x-signature') ?? ''
    const tsMatch = sig.match(/ts=(\d+)/)
    const v1Match = sig.match(/v1=([a-f0-9]+)/)
    if (tsMatch && v1Match) {
      const ts = tsMatch[1]
      const received = v1Match[1]
      const toSign = `id:${mpPaymentId};request-id:${request.headers.get('x-request-id') ?? ''};ts:${ts};`
      const expected = crypto
        .createHmac('sha256', config.mp_webhook_secret)
        .update(toSign)
        .digest('hex')
      if (!crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
      }
    }
  }

  // Consulta o Mercado Pago para confirmar status (não confiar só no webhook)
  const { data: pixCfg } = await supabase
    .from('pix_config')
    .select('mp_access_token')
    .eq('filial_id', cobranca.filial_id)
    .single()

  if (pixCfg?.mp_access_token) {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
      headers: { Authorization: `Bearer ${pixCfg.mp_access_token}` },
    })
    if (mpRes.ok) {
      const mp = await mpRes.json() as { status: string }
      if (mp.status !== 'approved') return NextResponse.json({ ok: true })
    }
  }

  // Atualiza cobrança
  await supabase
    .from('pix_cobrancas')
    .update({ status: 'aprovado', pago_em: new Date().toISOString() })
    .eq('id', cobranca.id)

  // Marca referência como paga
  if (cobranca.tipo_referencia === 'os') {
    await supabase
      .from('ordens_servico')
      .update({ pago: true, forma_pagamento: 'PIX' })
      .eq('id', cobranca.referencia_id)
  } else if (cobranca.tipo_referencia === 'pdv') {
    await supabase
      .from('vendas')
      .update({ pago: true, forma_pagamento: 'pix' })
      .eq('id', cobranca.referencia_id)
  }

  return NextResponse.json({ ok: true })
}
