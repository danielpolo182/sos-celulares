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
  if (!user) return NextResponse.json({ categorias: [] })

  const { data: perfil } = await supabase.from('perfis').select('filial_id').eq('id', user.id).single()
  if (!perfil?.filial_id) return NextResponse.json({ categorias: [] })

  const q = request.nextUrl.searchParams.get('q') ?? ''

  let query = supabase.from('produtos')
    .select('categoria')
    .eq('filial_id', perfil.filial_id)
    .is('deleted_at', null)
    .not('categoria', 'is', null)
    .neq('categoria', '')

  if (q) query = (query as any).ilike('categoria', `%${q}%`)

  const { data } = await query.order('categoria').limit(30)

  const unique = [...new Set((data ?? []).map((r: any) => r.categoria as string).filter(Boolean))]
  return NextResponse.json({ categorias: unique })
}
