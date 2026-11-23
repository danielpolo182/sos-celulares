// src/app/api/os/entregar/route.ts
// Entrega do aparelho ao cliente: registra o pagamento, marca a OS como
// entregue com a data, lança o valor no caixa do dia, baixa o estoque das peças
// e dispara o aviso de retirada e garantia.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notificarEventoOS } from '@/lib/whatsapp/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const FORMAS = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartão débito',
  credito: 'Cartão crédito',
} as const
type Forma = keyof typeof FORMAS

const dinheiro = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN }
const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const corpo = await req.json().catch(() => null) as Record<string, unknown> | null
  const osId = texto(corpo?.osId, 60)
  if (!osId) return NextResponse.json({ error: 'Ordem de serviço não informada.' }, { status: 400 })

  // A sessão só enxerga as ordens da própria loja
  const { data: os, error } = await supabase
    .from('ordens_servico')
    .select('id, numero, status, pago, forma_pagamento, valor_final, valor_orcamento, desconto, campos_extras')
    .eq('id', osId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Não consegui consultar a ordem de serviço.' }, { status: 500 })
  if (!os) return NextResponse.json({ error: 'Ordem de serviço não encontrada.' }, { status: 404 })
  if (os.status === 'entregue' || os.status === 'cancelada') {
    return NextResponse.json({ error: `A OS nº ${os.numero} já está como ${os.status}.` }, { status: 409 })
  }

  const valor = dinheiro(corpo?.valor)
  // O PIX gerado nesta entrega marca a OS como paga assim que cai, antes de chegar aqui:
  // nesse caso ainda é o pagamento de agora, que precisa entrar no caixa
  const pixDeAgora = corpo?.forma === 'pix' && valor > 0
  const jaPaga = os.pago === true && !pixDeAgora
  if (!jaPaga && Number.isNaN(valor)) return NextResponse.json({ error: 'Informe o valor a cobrar.' }, { status: 400 })
  const semCobranca = jaPaga || valor === 0

  const forma = corpo?.forma as Forma
  if (!semCobranca && !(forma in FORMAS)) return NextResponse.json({ error: 'Escolha a forma de pagamento.' }, { status: 400 })

  const parcelas = forma === 'credito' ? Math.min(24, Math.max(1, Math.floor(Number(corpo?.parcelas) || 1))) : 1
  let valorRecebido: number | null = null
  let troco = 0
  if (!semCobranca && forma === 'dinheiro') {
    valorRecebido = dinheiro(corpo?.valorRecebido)
    if (Number.isNaN(valorRecebido) || valorRecebido < valor) {
      return NextResponse.json({ error: 'O valor recebido em dinheiro é menor que o valor a cobrar.' }, { status: 400 })
    }
    troco = Math.round((valorRecebido - valor) * 100) / 100
  }

  // PIX só fecha com a cobrança aprovada, a não ser que o atendente confirme que viu o dinheiro cair
  if (!semCobranca && forma === 'pix' && corpo?.pixConferidoNaMao !== true) {
    const { data: aprovada } = await supabase
      .from('pix_cobrancas').select('id').eq('referencia_id', os.id).eq('status', 'aprovado').limit(1).maybeSingle()
    if (!aprovada) return NextResponse.json({ error: 'O PIX ainda não foi confirmado. Aguarde a confirmação ou confirme manualmente.' }, { status: 409 })
  }

  const terceiro = corpo?.retirada && typeof corpo.retirada === 'object' ? corpo.retirada as Record<string, unknown> : null
  const retirada = terceiro ? { nome: texto(terceiro.nome, 120), documento: texto(terceiro.documento, 40) } : null
  if (retirada && (!retirada.nome || !retirada.documento)) {
    return NextResponse.json({ error: 'Informe o nome e o documento de quem está retirando.' }, { status: 400 })
  }

  const agora = new Date().toISOString()
  const extras = (os.campos_extras && typeof os.campos_extras === 'object' ? os.campos_extras : {}) as Record<string, unknown>
  const valorCombinado = Math.max(0, Number(os.valor_final ?? os.valor_orcamento ?? 0) - Number(os.desconto ?? 0))
  const atualizacao: Record<string, unknown> = {
    status: 'entregue',
    entregue_em: agora,
    updated_at: agora,
    pago: true,
    campos_extras: {
      ...extras,
      entrega: {
        em: agora, por_usuario: user.id,
        ...(semCobranca ? { cobranca: jaPaga ? 'já estava paga' : 'sem cobrança' } : { forma, parcelas, valor, valor_recebido: valorRecebido, troco }),
        ...(retirada ? { retirada } : {}),
      },
    },
  }
  if (!semCobranca) {
    atualizacao.forma_pagamento = FORMAS[forma]
    // Valor cobrado diferente do que estava na OS: a OS passa a registrar o que foi de fato cobrado
    if (Math.abs(valor - valorCombinado) >= 0.01) { atualizacao.valor_final = valor; atualizacao.desconto = 0 }
  }

  const { error: erroOS } = await supabase.from('ordens_servico').update(atualizacao).eq('id', os.id)
  if (erroOS) return NextResponse.json({ error: `Não consegui concluir a OS: ${erroOS.message}` }, { status: 500 })

  // Daqui em diante a OS já está entregue: o que falhar vira aviso na tela, não erro
  const avisos: string[] = []

  // Peças do orçamento saem do estoque, como na tela de OS
  try {
    const { data: itens } = await supabase.from('os_orcamento_itens').select('produto_id, quantidade').eq('os_id', os.id)
    for (const item of (itens ?? []) as { produto_id: string | null; quantidade: number }[]) {
      if (!item.produto_id) continue
      const { data: prod } = await supabase.from('produtos').select('estoque_atual').eq('id', item.produto_id).single()
      if (prod) await supabase.from('produtos').update({ estoque_atual: Math.max(0, Number(prod.estoque_atual) - Number(item.quantidade)) }).eq('id', item.produto_id)
    }
  } catch (e) {
    console.error('[entregar] estoque', e)
    avisos.push('Não consegui baixar o estoque das peças.')
  }

  // Lançamento no caixa do dia, para o valor entrar no fechamento
  if (!semCobranca && valor > 0) {
    const lancamento = {
      valor, forma, referencia_id: os.id,
      observacoes: `OS #${os.numero}${parcelas > 1 ? ` (${parcelas}x)` : ''}`,
      data_ref: agora.split('T')[0],
    }
    // Uma OS só entra no caixa uma vez, mesmo que a entrega seja refeita
    const { data: jaLancado } = await supabase.from('caixa_movimentos').select('id').eq('referencia_id', os.id).limit(1).maybeSingle()
    if (!jaLancado) {
      // "os" separa o serviço das vendas do PDV no fechamento; se o banco só aceitar os tipos antigos, entra como venda
      let { error: erroCaixa } = await supabase.from('caixa_movimentos').insert({ ...lancamento, tipo: 'os' })
      if (erroCaixa) ({ error: erroCaixa } = await supabase.from('caixa_movimentos').insert({ ...lancamento, tipo: 'venda' }))
      if (erroCaixa) {
        console.error('[entregar] caixa', erroCaixa.message)
        avisos.push(`O valor NÃO foi lançado no caixa (${erroCaixa.message}). Lance manualmente.`)
      }
    }
  }

  try { await supabase.from('events').insert({ type: 'OS_ATUALIZADA', entity: 'os', entity_id: os.id, payload: { status: 'entregue', pago: true, origem: 'entrega' } }) } catch { /* registro não é crítico */ }

  // Aviso de retirada e garantia, se a loja ligou esse aviso
  let aviso = 'desligado'
  try { aviso = (await notificarEventoOS(os.id as string, 'entregue')).resultado } catch (e) { console.error('[entregar] aviso', e) }

  return NextResponse.json({ ok: true, numero: os.numero, troco, avisos, aviso })
}
