import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

type ImportBody = {
  criar: Record<string, unknown>[]
  atualizar: { id: string; dados: Record<string, unknown> }[]
}

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

    const body = await request.json() as ImportBody
    const criar = Array.isArray(body.criar) ? body.criar : []
    const atualizar = Array.isArray(body.atualizar) ? body.atualizar : []
    if (criar.length === 0 && atualizar.length === 0) {
      return NextResponse.json({ error: 'Nada para importar' }, { status: 400 })
    }
    if (criar.length + atualizar.length > 2000) {
      return NextResponse.json({ error: 'Máximo de 2000 produtos por importação' }, { status: 400 })
    }

    const erros: string[] = []
    let criados = 0
    let atualizados = 0

    // Inserções em lotes de 100
    for (let i = 0; i < criar.length; i += 100) {
      const lote = criar.slice(i, i + 100)
      const { data, error } = await supabase.from('produtos').insert(lote).select('id')
      if (error) erros.push(`Lote ${i / 100 + 1} (novos): ${error.message}`)
      else criados += data?.length ?? 0
    }

    // Atualizações uma a uma (cada produto pode ter campos diferentes)
    for (const item of atualizar) {
      const { error } = await supabase.from('produtos').update(item.dados).eq('id', item.id)
      if (error) erros.push(`Atualizar ${item.id}: ${error.message}`)
      else atualizados++
    }

    return NextResponse.json({ criados, atualizados, erros })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
