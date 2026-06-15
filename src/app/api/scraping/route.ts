import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Marcas monitoradas — top 10 Brasil
const MARCAS = ['samsung','motorola','xiaomi','apple','realme','asus','nokia','tcl','positivo','infinix']

const MARCA_MAP: Record<string, string> = {
  samsung: 'Samsung', motorola: 'Motorola', xiaomi: 'Xiaomi',
  apple: 'Apple', realme: 'Realme', asus: 'Asus',
  nokia: 'Nokia', tcl: 'TCL', positivo: 'Positivo', infinix: 'Infinix',
}

type ScrapedDevice = {
  marca: string; modelo: string; slug: string
  tela?: string; resolucao?: string; processador?: string
  ram?: string; armazenamento?: string; camera_principal?: string
  camera_frontal?: string; bateria?: string; sistema?: string
  dimensoes?: string; peso?: string; lancamento?: string
}

// Busca lista de modelos de uma marca no TudoCelular
async function fetchModelosMarca(marcaSlug: string): Promise<{modelo: string; slug: string; url: string}[]> {
  try {
    const url = `https://www.tudocelular.com/${marcaSlug}/fichas-tecnicas.html`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SOS-Celulares-Bot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const html = await res.text()

    // Extrai links de fichas técnicas: /Samsung/fichas-tecnicas/Galaxy-A55-5G.html
    const regex = /href="\/[^"]+\/fichas-tecnicas\/([^"]+\.html)"/g
    const modelos: {modelo: string; slug: string; url: string}[] = []
    const seen = new Set<string>()
    let match
    while ((match = regex.exec(html)) !== null) {
      const slug = match[1].replace('.html', '')
      const modelo = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      if (!seen.has(slug)) {
        seen.add(slug)
        modelos.push({ modelo, slug, url: `https://www.tudocelular.com/${marcaSlug}/fichas-tecnicas/${match[1]}` })
      }
    }
    return modelos.slice(0, 50) // limite por rodada
  } catch { return [] }
}

// Busca specs de um modelo específico
async function fetchSpecs(url: string): Promise<Partial<ScrapedDevice>> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SOS-Celulares-Bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return {}
    const html = await res.text()

    function extractSpec(label: string): string {
      // Padrão TudoCelular: <td class="spec-title">Label</td><td>Valor</td>
      const regex = new RegExp(`>${label}[^<]*<\\/td>\\s*<td[^>]*>([^<]+)`, 'i')
      const m = html.match(regex)
      return m ? m[1].trim() : ''
    }

    return {
      tela:             extractSpec('Tela') || extractSpec('Display'),
      resolucao:        extractSpec('Resolução') || extractSpec('Resolucao'),
      processador:      extractSpec('Processador') || extractSpec('Chipset'),
      ram:              extractSpec('Memória RAM') || extractSpec('RAM'),
      armazenamento:    extractSpec('Armazenamento interno') || extractSpec('Armazenamento'),
      camera_principal: extractSpec('Câmera principal') || extractSpec('Camera traseira'),
      camera_frontal:   extractSpec('Câmera frontal') || extractSpec('Selfie'),
      bateria:          extractSpec('Bateria') || extractSpec('Capacidade'),
      sistema:          extractSpec('Sistema operacional') || extractSpec('Android'),
      dimensoes:        extractSpec('Dimensões') || extractSpec('Dimensoes'),
      peso:             extractSpec('Peso'),
      lancamento:       extractSpec('Lançamento') || extractSpec('Anunciado'),
    }
  } catch { return {} }
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

  const resultados: Record<string, { importados: number; erros: number }> = {}

  for (const marcaSlug of MARCAS) {
    const marcaNome = MARCA_MAP[marcaSlug]
    let importados = 0; let erros = 0

    // Criar job
    const { data: job } = await supabase.from('scraping_jobs').insert({
      marca: marcaNome, status: 'rodando', iniciado_em: new Date().toISOString(),
    }).select('id').single()

    try {
      const modelos = await fetchModelosMarca(marcaSlug)

      for (const { modelo, slug, url } of modelos) {
        // Verificar se já existe
        const { data: existe } = await supabase.from('dispositivos_modelos')
          .select('id').eq('marca', marcaNome).eq('modelo', modelo).maybeSingle()
        if (existe) continue

        // Buscar specs
        const specs = await fetchSpecs(url)

        const { error } = await supabase.from('dispositivos_modelos').insert({
          marca: marcaNome, modelo, slug,
          ...specs, fonte: 'scraping', verificado: false,
        })
        if (!error) importados++; else erros++

        // Rate limit — 1 req/segundo
        await new Promise(r => setTimeout(r, 1000))
      }

      if (job) await supabase.from('scraping_jobs').update({
        status: 'concluido', total: modelos.length, importados,
        concluido_em: new Date().toISOString(),
      }).eq('id', job.id)
    } catch (err: any) {
      if (job) await supabase.from('scraping_jobs').update({
        status: 'erro', erro_msg: err?.message ?? 'erro desconhecido',
        concluido_em: new Date().toISOString(),
      }).eq('id', job.id)
      erros++
    }

    resultados[marcaNome] = { importados, erros }
    // Pausa entre marcas
    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({ ok: true, resultados })
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

  // Se marca especificada, só processa ela; senão todas
  const slugsParaProcessar = marcaSlugAlvo && MARCAS.includes(marcaSlugAlvo)
    ? [marcaSlugAlvo]
    : MARCAS

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let novos = 0
  let jaExistiam = 0
  const erros: string[] = []

  for (const marcaSlug of slugsParaProcessar) {
    const marcaNome = MARCA_MAP[marcaSlug]
    try {
      const modelos = await fetchModelosMarca(marcaSlug)
      for (const { modelo, slug, url } of modelos) {
        const { data: existe } = await supabaseAdmin.from('dispositivos_modelos')
          .select('id').eq('marca', marcaNome).eq('modelo', modelo).maybeSingle()
        if (existe) { jaExistiam++; continue }

        const specs = await fetchSpecs(url)
        const { error } = await supabaseAdmin.from('dispositivos_modelos').insert({
          marca: marcaNome, modelo, slug,
          ...specs, fonte: 'scraping', verificado: false, ativo: true,
        })
        if (!error) novos++
        else erros.push(`${marcaNome} ${modelo}: ${error.message}`)

        await new Promise(r => setTimeout(r, 800))
      }
    } catch (err: unknown) {
      erros.push(`${marcaNome}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({ ok: true, novos, jaExistiam, erros })
}
