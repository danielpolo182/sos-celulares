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

    // Get user's filial_id from perfis
    const { data: perfil, error: perfilError } = await supabase
      .from('perfis')
      .select('filial_id')
      .eq('user_id', user.id)
      .single()

    if (perfilError || !perfil) {
      return NextResponse.json(
        { error: 'não foi possível obter filial do usuário' },
        { status: 500 }
      )
    }

    const body = await request.json() as {
      fornecedor_id: string
      observacoes?: string
      periodo_dias: number
      itens: Array<{
        produto_id: string
        qtd_sugerida: number
        qtd_pedida: number
        preco_custo_ref: number | null
      }>
    }

    const { fornecedor_id, observacoes, periodo_dias, itens } = body

    // Validate required fields
    if (!fornecedor_id || !periodo_dias || !itens || itens.length === 0) {
      return NextResponse.json(
        { error: 'fornecedor_id, periodo_dias e itens são obrigatórios' },
        { status: 400 }
      )
    }

    // Create pedido_compra
    const { data: pedidoData, error: pedidoError } = await supabase
      .from('pedidos_compra')
      .insert({
        filial_id: perfil.filial_id,
        fornecedor_id,
        periodo_dias,
        observacoes: observacoes || null,
        status: 'rascunho',
      })
      .select('id')
      .single()

    if (pedidoError || !pedidoData) {
      return NextResponse.json(
        { error: `erro ao criar pedido: ${pedidoError?.message}` },
        { status: 500 }
      )
    }

    // Create pedido_itens for each item
    const pedidoItens = itens.map((item) => ({
      pedido_id: pedidoData.id,
      produto_id: item.produto_id,
      qtd_sugerida: item.qtd_sugerida,
      qtd_pedida: item.qtd_pedida,
      preco_custo_ref: item.preco_custo_ref,
    }))

    const { error: itensError } = await supabase
      .from('pedido_itens')
      .insert(pedidoItens)

    if (itensError) {
      return NextResponse.json(
        { error: `erro ao adicionar itens ao pedido: ${itensError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ pedido_id: pedidoData.id })
  } catch (err) {
    console.error('[compras/pedidos POST] erro inesperado:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
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

    // Get user's filial_id from perfis
    const { data: perfil, error: perfilError } = await supabase
      .from('perfis')
      .select('filial_id')
      .eq('user_id', user.id)
      .single()

    if (perfilError || !perfil) {
      return NextResponse.json(
        { error: 'não foi possível obter filial do usuário' },
        { status: 500 }
      )
    }

    // Get pedidos with fornecedor info
    const { data: pedidos, error: pedidosError } = await supabase
      .from('pedidos_compra')
      .select(`
        id,
        created_at,
        status,
        periodo_dias,
        observacoes,
        fornecedor_id,
        fornecedores(nome)
      `)
      .eq('filial_id', perfil.filial_id)
      .order('created_at', { ascending: false })

    if (pedidosError) {
      return NextResponse.json(
        { error: `erro ao buscar pedidos: ${pedidosError.message}` },
        { status: 500 }
      )
    }

    // Transform response to include fornecedor_nome
    const pedidosFormatted = (pedidos || []).map((pedido: any) => ({
      id: pedido.id,
      created_at: pedido.created_at,
      status: pedido.status,
      periodo_dias: pedido.periodo_dias,
      observacoes: pedido.observacoes,
      fornecedor_id: pedido.fornecedor_id,
      fornecedor_nome: pedido.fornecedores?.nome || null,
    }))

    return NextResponse.json({ pedidos: pedidosFormatted })
  } catch (err) {
    console.error('[compras/pedidos GET] erro inesperado:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
