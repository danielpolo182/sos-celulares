import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { gerarModelosPorMarca, gerarModelos } from '@/data/modelos-dispositivos'

// Marcas monitoradas — top 10 Brasil
const MARCAS = ['samsung','motorola','xiaomi','apple','realme','asus','nokia','tcl','positivo','infinix']

const MARCA_MAP: Record<string, string> = {
  samsung: 'Samsung', motorola: 'Motorola', xiaomi: 'Xiaomi',
  apple: 'Apple', realme: 'Realme', asus: 'Asus',
  nokia: 'Nokia', tcl: 'TCL', positivo: 'Positivo', infinix: 'Infinix',
}

export async function GET(req: NextRequest) {
  // Verificar token de segurança (Vercel Cron)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const modelos = gerarModelos()
  let importados = 0; let erros = 0

  for (const { marca, modelo, slug } of modelos) {
    const { data: existe } = await supabase.from('dispositivos_modelos')
      .select('id').eq('marca', marca).eq('modelo', modelo).maybeSingle()
    if (existe) continue

    const { error } = await supabase.from('dispositivos_modelos').insert({
      marca, modelo, slug, fonte: 'dataset', verificado: false, ativo: true,
    })
    if (!error) importados++; else erros++
  }

  return NextResponse.json({ ok: true, total: modelos.length, importados, erros })
}

// Trigger manual por marca — autenticado por sessão, restrito a danielcwpolo@gmail.com
export async function POST(req: NextRequest) {
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
  if (!user || user.email !== 'danielcwpolo@gmail.com') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { marca?: string }
  const marcaSlugAlvo = body.marca?.toLowerCase()

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Busca modelos do dataset estático para a marca solicitada (ou todas)
  const modelos = marcaSlugAlvo && MARCAS.includes(marcaSlugAlvo)
    ? gerarModelosPorMarca(MARCA_MAP[marcaSlugAlvo] ?? marcaSlugAlvo)
    : gerarModelos()

  let novos = 0
  let jaExistiam = 0
  const erros: string[] = []

  for (const { marca, modelo, slug } of modelos) {
    const { data: existe } = await supabaseAdmin.from('dispositivos_modelos')
      .select('id').eq('marca', marca).eq('modelo', modelo).maybeSingle()
    if (existe) { jaExistiam++; continue }

    const { error } = await supabaseAdmin.from('dispositivos_modelos').insert({
      marca, modelo, slug, fonte: 'dataset', verificado: false, ativo: true,
    })
    if (!error) novos++
    else erros.push(`${marca} ${modelo}: ${error.message}`)
  }

  return NextResponse.json({ ok: true, novos, jaExistiam, erros })
}
