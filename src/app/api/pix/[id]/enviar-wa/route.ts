import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendMessage } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'

export async function POST(
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

  const { data: cobranca } = await supabase
    .from('pix_cobrancas')
    .select('valor, pix_copia_cola, tipo_referencia, referencia_id, filial_id')
    .eq('id', id)
    .single()

  if (!cobranca) return NextResponse.json({ error: 'cobrança não encontrada' }, { status: 404 })

  // Busca telefone do cliente via OS ou PDV
  let telefone: string | null = null
  let nomeCliente = 'Cliente'

  if (cobranca.tipo_referencia === 'os') {
    const { data: os } = await supabase
      .from('ordens_servico')
      .select('clientes(nome, telefone)')
      .eq('id', cobranca.referencia_id)
      .single()
    const cliente = Array.isArray(os?.clientes) ? os.clientes[0] : os?.clientes
    telefone = cliente?.telefone ?? null
    nomeCliente = cliente?.nome ?? 'Cliente'
  } else if (cobranca.tipo_referencia === 'pdv') {
    const { data: venda } = await supabase
      .from('vendas')
      .select('clientes(nome, telefone)')
      .eq('id', cobranca.referencia_id)
      .single()
    const cliente = Array.isArray(venda?.clientes) ? venda.clientes[0] : venda?.clientes
    telefone = cliente?.telefone ?? null
    nomeCliente = cliente?.nome ?? 'Cliente'
  }

  if (!telefone) {
    return NextResponse.json({ error: 'cliente sem telefone cadastrado' }, { status: 400 })
  }

  const { data: waConfig } = await supabase
    .from('wa_config')
    .select('phone_number_id, access_token')
    .single()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    return NextResponse.json({ error: 'WhatsApp não configurado' }, { status: 400 })
  }

  const { data: filial } = await supabase
    .from('filiais')
    .select('nome')
    .eq('id', cobranca.filial_id)
    .single()

  const raw = telefone.replace(/\D/g, '')
  const to = raw.startsWith('55') ? raw : `55${raw}`
  const valor = `R$ ${Number(cobranca.valor).toFixed(2).replace('.', ',')}`

  const msg = `💳 *Cobrança PIX — ${filial?.nome ?? 'Loja'}*\n\nOlá, ${nomeCliente}! Segue o código PIX para pagamento.\n\nValor: *${valor}*\n\n\`\`\`${cobranca.pix_copia_cola}\`\`\`\n\n⏱ Válido por 48 horas.`

  await sendMessage(
    { phone_number_id: waConfig.phone_number_id, access_token: waConfig.access_token },
    to,
    msg
  )

  await supabase
    .from('pix_cobrancas')
    .update({ wa_enviado: true })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
