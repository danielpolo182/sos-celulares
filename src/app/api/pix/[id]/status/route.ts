import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values: Array<{ name: string; value: string; options?: Record<string, unknown> }>) =>
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('pix_cobrancas')
    .select('status, pago_em, expira_em, tipo_referencia, referencia_id, mp_payment_id, filial_id')
    .eq('id', id)
    .single()

  if (!data) return NextResponse.json({ error: 'cobrança não encontrada' }, { status: 404 })

  let status = data.status

  // Fallback: se ainda pendente, consulta MP diretamente para não depender só do webhook
  if (status === 'pendente' && data.mp_payment_id) {
    try {
      const svc = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: cfg } = await svc
        .from('pix_config')
        .select('mp_access_token')
        .eq('filial_id', data.filial_id)
        .single()

      if (cfg?.mp_access_token) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.mp_payment_id}`, {
          headers: { Authorization: `Bearer ${cfg.mp_access_token}` },
        })
        if (mpRes.ok) {
          const mp = await mpRes.json() as { status: string }
          if (mp.status === 'approved') {
            // Atualiza no banco e marca referência como paga
            await svc.from('pix_cobrancas').update({ status: 'aprovado', pago_em: new Date().toISOString() }).eq('id', id)
            if (data.tipo_referencia === 'os') {
              await svc.from('ordens_servico').update({ pago: true, forma_pagamento: 'PIX' }).eq('id', data.referencia_id)
            } else if (data.tipo_referencia === 'pdv') {
              await svc.from('vendas').update({ pago: true, forma_pagamento: 'pix' }).eq('id', data.referencia_id)
            }
            status = 'aprovado'
          }
        }
      }
    } catch (e) {
      console.error('[pix/status] fallback MP check error:', e)
    }
  }

  return NextResponse.json({
    status,
    pagoEm: data.pago_em,
    expiraEm: data.expira_em,
    tipoReferencia: data.tipo_referencia,
    referenciaId: data.referencia_id,
  })
}
