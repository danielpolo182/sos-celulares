import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: pedido_id } = await params

    const body = await request.json() as {
      itens: Array<{ pedido_item_id: string; qtd_recebida: number; preco_pago: number }>
    }

    const itensFiltrados = (body.itens ?? []).filter(i => i.qtd_recebida > 0)

    if (itensFiltrados.length > 0) {
      const recebimentos = itensFiltrados.map(i => ({
        pedido_id,
        pedido_item_id: i.pedido_item_id,
        qtd_recebida: i.qtd_recebida,
        preco_pago: i.preco_pago,
        operador_id: user.id,
      }))

      const { error: errInsert } = await supabase
        .from('pedido_recebimentos')
        .insert(recebimentos)

      if (errInsert) {
        return NextResponse.json(
          { error: `erro ao inserir recebimentos: ${errInsert.message}` },
          { status: 500 }
        )
      }
    }

    // Check for pending items
    const { data: pedidoItens, error: errItens } = await supabase
      .from('pedido_itens')
      .select('id, qtd_pedida, preco_custo_ref')
      .eq('pedido_id', pedido_id)

    if (errItens) {
      return NextResponse.json(
        { error: `erro ao buscar itens do pedido: ${errItens.message}` },
        { status: 500 }
      )
    }

    const { data: recebimentosSomados, error: errRec } = await supabase
      .from('pedido_recebimentos')
      .select('pedido_item_id, qtd_recebida')
      .eq('pedido_id', pedido_id)

    if (errRec) {
      return NextResponse.json(
        { error: `erro ao buscar recebimentos: ${errRec.message}` },
        { status: 500 }
      )
    }

    const totalRecebidoPorItem: Record<string, number> = {}
    for (const r of recebimentosSomados ?? []) {
      totalRecebidoPorItem[r.pedido_item_id] = (totalRecebidoPorItem[r.pedido_item_id] ?? 0) + r.qtd_recebida
    }

    const itensPendentes = (pedidoItens ?? []).filter(item => {
      const totalRecebido = totalRecebidoPorItem[item.id] ?? 0
      return item.qtd_pedida - totalRecebido > 0
    })

    if (itensPendentes.length > 0) {
      // Get original pedido info
      const { data: pedido, error: errPedido } = await supabase
        .from('pedidos_compra')
        .select('filial_id, fornecedor_id, periodo_dias')
        .eq('id', pedido_id)
        .single()

      if (errPedido || !pedido) {
        return NextResponse.json(
          { error: `erro ao buscar pedido: ${errPedido?.message ?? 'não encontrado'}` },
          { status: 500 }
        )
      }

      // Create new pedido
      const { data: novoPedido, error: errNovoPedido } = await supabase
        .from('pedidos_compra')
        .insert({
          filial_id: pedido.filial_id,
          fornecedor_id: pedido.fornecedor_id,
          periodo_dias: pedido.periodo_dias,
          status: 'rascunho',
          pedido_origem_id: pedido_id,
        })
        .select('id')
        .single()

      if (errNovoPedido || !novoPedido) {
        return NextResponse.json(
          { error: `erro ao criar novo pedido: ${errNovoPedido?.message ?? 'falha'}` },
          { status: 500 }
        )
      }

      const novosItens = itensPendentes.map(item => {
        const totalRecebido = totalRecebidoPorItem[item.id] ?? 0
        const saldo = item.qtd_pedida - totalRecebido
        return {
          pedido_id: novoPedido.id,
          qtd_sugerida: saldo,
          qtd_pedida: saldo,
          preco_custo_ref: item.preco_custo_ref,
        }
      })

      const { error: errNovosItens } = await supabase
        .from('pedido_itens')
        .insert(novosItens)

      if (errNovosItens) {
        return NextResponse.json(
          { error: `erro ao inserir itens do novo pedido: ${errNovosItens.message}` },
          { status: 500 }
        )
      }

      // Update current pedido to 'parcial'
      const { error: errUpdate } = await supabase
        .from('pedidos_compra')
        .update({ status: 'parcial' })
        .eq('id', pedido_id)

      if (errUpdate) {
        return NextResponse.json(
          { error: `erro ao atualizar status do pedido: ${errUpdate.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({ ok: true, novo_pedido_id: novoPedido.id })
    } else {
      // All items received — mark as concluido
      const { error: errUpdate } = await supabase
        .from('pedidos_compra')
        .update({ status: 'concluido' })
        .eq('id', pedido_id)

      if (errUpdate) {
        return NextResponse.json(
          { error: `erro ao atualizar status do pedido: ${errUpdate.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({ ok: true })
    }
  } catch (err) {
    console.error('[compras/pedidos/receber] erro inesperado:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
