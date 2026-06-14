import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
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
    .select('status, pago_em, expira_em, tipo_referencia, referencia_id')
    .eq('id', id)
    .single()

  if (!data) return NextResponse.json({ error: 'cobrança não encontrada' }, { status: 404 })

  return NextResponse.json({
    status: data.status,
    pagoEm: data.pago_em,
    expiraEm: data.expira_em,
    tipoReferencia: data.tipo_referencia,
    referenciaId: data.referencia_id,
  })
}
