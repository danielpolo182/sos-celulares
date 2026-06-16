import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('perfis').select('papel').eq('id', user.id).single()
  if (!['admin', 'administrador', 'gerente'].includes(perfil?.papel ?? ''))
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 })

  const body = await request.json() as { nome?: string; tipo?: string; opcoes?: string[]; obrigatorio?: boolean; ordem?: number }
  const { nome, tipo, opcoes, obrigatorio, ordem } = body

  const { data, error } = await supabase.from('campos_personalizados')
    .update({ nome, tipo, opcoes, obrigatorio, ordem })
    .eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campo: data })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('perfis').select('papel').eq('id', user.id).single()
  if (!['admin', 'administrador', 'gerente'].includes(perfil?.papel ?? ''))
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 })

  const { error } = await supabase.from('campos_personalizados').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
