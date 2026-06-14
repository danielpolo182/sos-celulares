// src/app/api/pix/criar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { criarCobrancaPix } from '@/lib/pix/mp'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
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

  const body = await request.json() as {
    referenciaId: string
    tipoReferencia: 'os' | 'pdv'
    valor: number
    modalidade: 'presencial' | 'remoto'
    descricao?: string
  }

  const { referenciaId, tipoReferencia, valor, modalidade, descricao } = body
  if (!referenciaId || !tipoReferencia || !valor || !modalidade) {
    return NextResponse.json({ error: 'campos obrigatórios ausentes' }, { status: 400 })
  }

  const { data: config } = await supabase
    .from('pix_config')
    .select('mp_access_token, ativo')
    .single()

  if (!config?.mp_access_token || !config.ativo) {
    return NextResponse.json({ error: 'PIX não configurado para esta filial' }, { status: 400 })
  }

  const agora = new Date()
  const expiraEm = modalidade === 'presencial'
    ? new Date(agora.getTime() + 15 * 60 * 1000).toISOString()
    : new Date(agora.getTime() + 48 * 60 * 60 * 1000).toISOString()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://seu-dominio.vercel.app'

  let mpPayment
  try {
    mpPayment = await criarCobrancaPix({
      accessToken: config.mp_access_token,
      valor,
      descricao: descricao ?? `Cobrança ${tipoReferencia.toUpperCase()}`,
      expiraEm,
      notificationUrl: `${appUrl}/api/pix/webhook`,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  const qrData = mpPayment.point_of_interaction.transaction_data

  // Busca filial_id do usuário
  const { data: perfil } = await supabase
    .from('perfis')
    .select('filial_id')
    .eq('id', user.id)
    .single()

  const { data: cobranca, error: dbErr } = await supabase
    .from('pix_cobrancas')
    .insert({
      filial_id: perfil?.filial_id,
      referencia_id: referenciaId,
      tipo_referencia: tipoReferencia,
      mp_payment_id: mpPayment.id,
      valor,
      status: 'pendente',
      modalidade,
      qr_code_base64: qrData.qr_code_base64,
      pix_copia_cola: qrData.qr_code,
      expira_em: expiraEm,
    })
    .select('id')
    .single()

  if (dbErr || !cobranca) {
    return NextResponse.json({ error: 'erro ao salvar cobrança' }, { status: 500 })
  }

  return NextResponse.json({
    cobrancaId: cobranca.id,
    qrCodeBase64: qrData.qr_code_base64,
    pixCopiaCola: qrData.qr_code,
    expiraEm,
  })
  } catch (err) {
    console.error('[pix/criar] erro inesperado:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
