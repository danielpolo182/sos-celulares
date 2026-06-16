import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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

  const { data: perfil } = await supabase.from('perfis').select('filial_id').eq('id', user.id).single()
  if (!perfil?.filial_id) return NextResponse.json({ campos: [] })

  const entidade = request.nextUrl.searchParams.get('entidade')
  let q = supabase.from('campos_personalizados').select('*').eq('filial_id', perfil.filial_id).order('ordem').order('created_at')
  if (entidade) q = (q as any).eq('entidade', entidade)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campos: data ?? [] })
}

export async function POST(request: NextRequest) {
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

  const { data: perfil } = await supabase.from('perfis').select('filial_id, papel').eq('id', user.id).single()
  if (!perfil?.filial_id) return NextResponse.json({ error: 'filial não encontrada' }, { status: 400 })
  if (!['admin', 'administrador', 'gerente'].includes(perfil.papel ?? ''))
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 })

  const body = await request.json() as { entidade: string; nome: string; tipo: string; opcoes?: string[]; obrigatorio?: boolean; ordem?: number }
  const { entidade, nome, tipo, opcoes, obrigatorio, ordem } = body

  if (!entidade || !nome || !tipo) return NextResponse.json({ error: 'entidade, nome e tipo são obrigatórios' }, { status: 400 })

  const { data, error } = await supabase.from('campos_personalizados').insert({
    filial_id: perfil.filial_id, entidade, nome, tipo,
    opcoes: opcoes ?? [], obrigatorio: obrigatorio ?? false, ordem: ordem ?? 0,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campo: data })
}
