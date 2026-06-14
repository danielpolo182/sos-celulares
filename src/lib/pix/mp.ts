// src/lib/pix/mp.ts
const MP_API = 'https://api.mercadopago.com'

export type MpPixResponse = {
  id: number
  status: string
  point_of_interaction: {
    transaction_data: {
      qr_code: string
      qr_code_base64: string
    }
  }
  date_of_expiration: string
}

export async function criarCobrancaPix(opts: {
  accessToken: string
  valor: number
  descricao: string
  expiraEm: string          // ISO 8601
  notificationUrl: string
  pagadorEmail?: string
}): Promise<MpPixResponse> {
  const res = await fetch(`${MP_API}/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.accessToken}`,
      'X-Idempotency-Key': `${Date.now()}-${Math.random()}`,
    },
    body: JSON.stringify({
      transaction_amount: opts.valor,
      description: opts.descricao,
      payment_method_id: 'pix',
      date_of_expiration: opts.expiraEm,
      notification_url: opts.notificationUrl,
      payer: { email: opts.pagadorEmail ?? 'cliente@loja.com' },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Mercado Pago error ${res.status}: ${err}`)
  }

  return res.json() as Promise<MpPixResponse>
}

export async function buscarPagamentoMp(accessToken: string, mpPaymentId: number): Promise<{ status: string }> {
  const res = await fetch(`${MP_API}/v1/payments/${mpPaymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`MP status error ${res.status}`)
  return res.json() as Promise<{ status: string }>
}
