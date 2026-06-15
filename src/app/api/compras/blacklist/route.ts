import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
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
            values.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })

    const body = await request.json() as {
      produto_id: string
      filial_id: string
      acao: 'add' | 'remove'
    }

    const { produto_id, filial_id, acao } = body

    if (!produto_id || !filial_id || !acao) {
      return NextResponse.json(
        { error: 'produto_id, filial_id e acao são obrigatórios' },
        { status: 400 }
      )
    }

    if (!['add', 'remove'].includes(acao)) {
      return NextResponse.json(
        { error: "acao deve ser 'add' ou 'remove'" },
        { status: 400 }
      )
    }

    if (acao === 'add') {
      const { error } = await supabase
        .from('compras_blacklist')
        .upsert(
          { produto_id, filial_id },
          { onConflict: 'produto_id,filial_id' }
        )

      if (error) {
        return NextResponse.json(
          { error: `erro ao adicionar à blacklist: ${error.message}` },
          { status: 500 }
        )
      }
    } else if (acao === 'remove') {
      const { error } = await supabase
        .from('compras_blacklist')
        .delete()
        .eq('produto_id', produto_id)
        .eq('filial_id', filial_id)

      if (error) {
        return NextResponse.json(
          { error: `erro ao remover da blacklist: ${error.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[compras/blacklist] erro inesperado:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
