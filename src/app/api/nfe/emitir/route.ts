import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { montarPayloadNfce, focusRequest, extrairResultadoFocus, normalizarFormaPagamento, type NfeConfig, type ItemVenda, type Pagamento } from '@/lib/nfe'

export const dynamic = 'force-dynamic'

type ProdutoFiscal = {
  id: string; codigo_interno: string | null; ncm: string | null; cest: string | null
  csosn: string | null; cfop: string | null; origem: string | null; gtin: string | null; unidade: string | null
}

export async function POST(request: NextRequest) {
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

    const body = await request.json() as { venda_id?: string; os_id?: string }
    if (!body.venda_id && !body.os_id) return NextResponse.json({ error: 'Informe venda_id ou os_id' }, { status: 400 })

    // Config da filial
    const { data: cfg } = await supabase.from('nfe_config').select('*').single()
    if (!cfg || !cfg.ativo || !cfg.token) {
      return NextResponse.json({ error: 'Emissão de NF não configurada. Acesse Configurações → Nota Fiscal.' }, { status: 400 })
    }
    const nfeCfg = cfg as NfeConfig

    // Já existe nota autorizada ou em processamento para esta venda/OS?
    const campoRef = body.venda_id ? 'venda_id' : 'os_id'
    const idRef = body.venda_id ?? body.os_id!
    const { data: existente } = await supabase.from('notas_fiscais')
      .select('id, status, referencia, url_danfe, numero')
      .eq(campoRef, idRef).in('status', ['autorizada', 'processando'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (existente) {
      return NextResponse.json({
        error: existente.status === 'autorizada'
          ? `Já existe NFC-e autorizada (nº ${existente.numero}) para esta ${body.venda_id ? 'venda' : 'OS'}.`
          : 'Já existe uma nota em processamento. Consulte o status antes de emitir novamente.',
        nota: existente,
      }, { status: 409 })
    }

    // Carregar itens e pagamentos
    let itensBrutos: { descricao: string; quantidade: number; preco_unit: number; produto_id: string | null }[] = []
    let pagamentos: Pagamento[] = []
    let desconto = 0
    let total = 0

    if (body.venda_id) {
      const { data: venda, error } = await supabase.from('vendas')
        .select('id, total, desconto, forma_pagamento, pagamentos, status, venda_itens(descricao, quantidade, preco_unit, produto_id)')
        .eq('id', body.venda_id).single()
      if (error || !venda) return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 })
      if (venda.status !== 'finalizada') return NextResponse.json({ error: 'Só é possível emitir nota de venda finalizada.' }, { status: 400 })
      itensBrutos = (venda.venda_itens ?? []) as typeof itensBrutos
      desconto = Number(venda.desconto) || 0
      total = Number(venda.total) || 0
      const pgs = venda.pagamentos as { forma: string; valor: number }[] | null
      pagamentos = Array.isArray(pgs) && pgs.length > 0
        ? pgs.map(p => ({ forma: p.forma, valor: Number(p.valor) || 0 }))
        : [{ forma: normalizarFormaPagamento(venda.forma_pagamento), valor: total }]
    } else {
      const { data: os, error } = await supabase.from('ordens_servico')
        .select('id, numero, valor_final, valor_orcamento, desconto, forma_pagamento, os_itens(descricao, quantidade, preco_unit, produto_id)')
        .eq('id', body.os_id!).single()
      if (error || !os) return NextResponse.json({ error: 'OS não encontrada' }, { status: 404 })
      itensBrutos = (os.os_itens ?? []) as typeof itensBrutos
      const somaItens = itensBrutos.reduce((acc, i) => acc + i.quantidade * Number(i.preco_unit), 0)
      const valorCobrado = (Number(os.valor_final) || Number(os.valor_orcamento) || somaItens) - (Number(os.desconto) || 0)
      if (somaItens < valorCobrado - 0.01) {
        return NextResponse.json({
          error: `O valor cobrado da OS (R$ ${valorCobrado.toFixed(2)}) é maior que a soma dos itens de produto (R$ ${somaItens.toFixed(2)}). Para emitir a nota como venda de mercadoria, o valor precisa estar nos itens — ajuste o preço da peça na OS (mão de obra inclusa no produto).`,
        }, { status: 400 })
      }
      desconto = Math.max(0, somaItens - valorCobrado)
      total = valorCobrado
      pagamentos = [{ forma: normalizarFormaPagamento(os.forma_pagamento), valor: valorCobrado }]
    }

    if (itensBrutos.length === 0) return NextResponse.json({ error: 'Nenhum item de produto para emitir.' }, { status: 400 })

    // Dados fiscais dos produtos
    const ids = [...new Set(itensBrutos.map(i => i.produto_id).filter(Boolean))] as string[]
    const { data: prods } = ids.length > 0
      ? await supabase.from('produtos').select('id, codigo_interno, ncm, cest, csosn, cfop, origem, gtin, unidade').in('id', ids)
      : { data: [] }
    const porId = new Map<string, ProdutoFiscal>(((prods ?? []) as ProdutoFiscal[]).map(p => [p.id, p]))

    const itens: ItemVenda[] = itensBrutos.map(i => ({
      descricao: i.descricao,
      quantidade: i.quantidade,
      preco_unit: Number(i.preco_unit),
      produto: i.produto_id ? porId.get(i.produto_id) ?? null : null,
    }))

    const montado = montarPayloadNfce(nfeCfg, itens, pagamentos, desconto, total)
    if (!montado.ok) return NextResponse.json({ error: montado.erro }, { status: 400 })

    // Registrar a nota e emitir
    const referencia = `${campoRef === 'venda_id' ? 'venda' : 'os'}-${idRef.slice(0, 8)}-${Date.now().toString(36)}`
    const { data: nota, error: notaErr } = await supabase.from('notas_fiscais').insert({
      referencia, tipo: 'nfce',
      venda_id: body.venda_id ?? null, os_id: body.os_id ?? null,
      status: 'processando', valor_total: total, criado_por: user.id,
    }).select('id').single()
    if (notaErr) return NextResponse.json({ error: `Erro ao registrar nota: ${notaErr.message}` }, { status: 500 })

    const { status: httpStatus, data } = await focusRequest(nfeCfg, 'POST', `/v2/nfce?ref=${referencia}`, montado.payload)
    const resultado = extrairResultadoFocus(nfeCfg, data)

    if (httpStatus >= 400 && !resultado.processando) {
      const msg = resultado.mensagem_erro ?? (data.erros ? JSON.stringify(data.erros) : `HTTP ${httpStatus}`)
      await supabase.from('notas_fiscais').update({ status: 'erro', mensagem_erro: msg, updated_at: new Date().toISOString() }).eq('id', nota.id)
      return NextResponse.json({ error: `Rejeitada: ${msg}`, referencia }, { status: 422 })
    }

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
