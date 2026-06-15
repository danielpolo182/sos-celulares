import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
            values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
        },
      }
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: perfil } = await supabase
      .from('perfis').select('filial_id').eq('id', user.id).single()

    const filial_id = (perfil as { filial_id: string } | null)?.filial_id
    if (!filial_id) return NextResponse.json({ error: 'Filial não encontrada para este usuário' }, { status: 400 })

    const body = await request.json() as { nome: string; preco_venda: number }
    if (!body.nome?.trim() || !body.preco_venda) {
      return NextResponse.json({ error: 'Nome e preço são obrigatórios' }, { status: 400 })
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: produto, error } = await admin.from('produtos').insert({
      nome: body.nome.trim(),
      preco_venda: body.preco_venda,
      custo_unit: 0,
      ativo: true,
      unidade: 'un',
      movimenta_estoque: true,
      cadastro_rapido: true,
      filial_id,
    }).select('id, nome, preco_venda, custo_unit').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(produto)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
