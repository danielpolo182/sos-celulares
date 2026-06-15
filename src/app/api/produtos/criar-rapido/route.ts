import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    // Usa cliente com sessão do usuário — auth.uid() funciona, trigger preenche filial_id
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

    const body = await request.json() as Record<string, unknown>
    if (!body.nome) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })

    // Não passa filial_id — o trigger auto_filial_produtos preenche via get_filial_id()
    const { data: produto, error } = await supabase
      .from('produtos')
      .insert(body)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(produto)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
