import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { focusRequest, extrairResultadoFocus, type NfeConfig } from '@/lib/nfe'

export const dynamic = 'force-dynamic'

// GET /api/nfe/status?ref=... — consulta a nota na Focus e atualiza o registro local
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    const referencia = request.nextUrl.searchParams.get('ref')
    if (!referencia) return NextResponse.json({ error: 'Parâmetro ref obrigatório' }, { status: 400 })

    const { data: cfg } = await supabase.from('nfe_config').select('*').single()
    if (!cfg?.token) return NextResponse.json({ error: 'Emissão de NF não configurada' }, { status: 400 })
    const nfeCfg = cfg as NfeConfig

    const { data: nota } = await supabase.from('notas_fiscais').select('id').eq('referencia', referencia).maybeSingle()
    if (!nota) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })

    const { data } = await focusRequest(nfeCfg, 'GET', `/v2/nfce/${referencia}`)
    const resultado = extrairResultadoFocus(nfeCfg, data)

    await supabase.from('notas_fiscais').update({
      status: resultado.status,
      numero: resultado.numero, serie: resultado.serie, chave: resultado.chave,
      url_danfe: resultado.url_danfe, url_xml: resultado.url_xml,
      mensagem_erro: resultado.autorizada ? null : resultado.mensagem_erro,
      updated_at: new Date().toISOString(),
    }).eq('id', nota.id)

    return NextResponse.json({
      referencia,
      status: resultado.status,
      numero: resultado.numero,
      chave: resultado.chave,
      url_danfe: resultado.url_danfe,
      url_xml: resultado.url_xml,
      mensagem: resultado.mensagem_erro,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
