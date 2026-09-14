// Emissão de NFC-e via Focus NFe (https://doc.focusnfe.com.br)
// Config por filial na tabela nfe_config; notas registradas em notas_fiscais.

export type NfeConfig = {
  filial_id: string
  ativo: boolean
  token: string | null
  ambiente: 'homologacao' | 'producao'
  emitir_automatico: boolean
  csosn_padrao: string | null
  cfop_padrao: string | null
  origem_padrao: string | null
  ncm_padrao: string | null
  natureza_operacao: string | null
}

export type ItemVenda = {
  descricao: string
  quantidade: number
  preco_unit: number
  produto?: {
    codigo_interno: string | null
    ncm: string | null
    cest: string | null
    csosn: string | null
    cfop: string | null
    origem: string | null
    gtin: string | null
    unidade: string | null
  } | null
}

export type Pagamento = { forma: string; valor: number }

// Códigos de forma de pagamento da NFC-e (tabela SEFAZ)
const FORMA_PAGAMENTO_NFE: Record<string, string> = {
  dinheiro: '01',
  cheque: '02',
  credito: '03',
  credito_parcela: '03',
  debito: '04',
  crediario: '05',
  pix: '17',
  transferencia: '18',
}

// A OS guarda rótulos livres ("Cartão de crédito", "PIX"...) — normaliza para as chaves do mapa
export function normalizarFormaPagamento(s: string | null): string {
  const n = (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('pix')) return 'pix'
  if (n.includes('dinheiro')) return 'dinheiro'
  if (n.includes('deb')) return 'debito'
  if (n.includes('cred') && n.includes('crediario')) return 'crediario'
  if (n.includes('cred')) return 'credito'
  if (n.includes('cheque')) return 'cheque'
  if (n.includes('transfer')) return 'transferencia'
  return n
}

export function focusBaseUrl(ambiente: string): string {
  return ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br'
}

export async function focusRequest(
  cfg: NfeConfig, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const auth = Buffer.from(`${cfg.token ?? ''}:`).toString('base64')
  const res = await fetch(`${focusBaseUrl(cfg.ambiente)}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: Record<string, unknown> = {}
  try { data = await res.json() as Record<string, unknown> } catch { /* corpo vazio */ }
  return { status: res.status, data }
}

export type PayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; erro: string }

// Monta o JSON da NFC-e. Retorna erro legível se faltar dado fiscal obrigatório.
export function montarPayloadNfce(
  cfg: NfeConfig,
  itens: ItemVenda[],
  pagamentos: Pagamento[],
  desconto: number,
  total: number
): PayloadResult {
  if (itens.length === 0) return { ok: false, erro: 'Nenhum item para emitir.' }

  const semNcm: string[] = []
  const round2 = (n: number) => Math.round(n * 100) / 100

  // desconto distribuído proporcionalmente entre os itens (a NFC-e valida os totais)
  const somaBruta = itens.reduce((acc, i) => acc + i.quantidade * i.preco_unit, 0)
  let descontoRestante = round2(desconto || 0)

  const itensPayload = itens.map((item, idx) => {
    const p = item.produto
    const ncm = (p?.ncm ?? cfg.ncm_padrao ?? '').replace(/\D/g, '')
    if (ncm.length !== 8) semNcm.push(item.descricao)
    const bruto = round2(item.quantidade * item.preco_unit)
    let descItem = 0
    if (descontoRestante > 0 && somaBruta > 0) {
      descItem = idx === itens.length - 1
        ? descontoRestante
        : Math.min(descontoRestante, round2((desconto * bruto) / somaBruta))
      descontoRestante = round2(descontoRestante - descItem)
    }
    const unidade = (p?.unidade ?? 'UN').toUpperCase()
    return {
      numero_item: idx + 1,
      codigo_produto: p?.codigo_interno || `ITEM${idx + 1}`,
      codigo_barras_comercial: p?.gtin || undefined,
      descricao: item.descricao.slice(0, 120),
      codigo_ncm: ncm,
      cest: p?.cest?.replace(/\D/g, '') || undefined,
      cfop: p?.cfop || cfg.cfop_padrao || '5102',
      unidade_comercial: unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: round2(item.preco_unit),
      unidade_tributavel: unidade,
      quantidade_tributavel: item.quantidade,
      valor_unitario_tributavel: round2(item.preco_unit),
      valor_bruto: bruto,
      valor_desconto: descItem > 0 ? descItem : undefined,
      icms_origem: p?.origem ?? cfg.origem_padrao ?? '0',
      icms_situacao_tributaria: p?.csosn || cfg.csosn_padrao || '102',
    }
  })

  if (semNcm.length > 0) {
    return {
      ok: false,
      erro: `Produtos sem NCM válido (8 dígitos): ${semNcm.slice(0, 5).join(', ')}${semNcm.length > 5 ? ` e mais ${semNcm.length - 5}` : ''}. Preencha o NCM no cadastro completo do produto (ou defina um NCM padrão nas configurações).`,
    }
  }

  const formasPagamento = (pagamentos.length > 0 ? pagamentos : [{ forma: 'outros', valor: total }])
    .filter(pg => pg.valor > 0)
    .map(pg => ({
      forma_pagamento: FORMA_PAGAMENTO_NFE[pg.forma] ?? '99',
      valor_pagamento: round2(pg.valor),
    }))

  return {
    ok: true,
    payload: {
      data_emissao: new Date().toISOString(),
      natureza_operacao: cfg.natureza_operacao || 'VENDA AO CONSUMIDOR',
      presenca_comprador: '1',
      modalidade_frete: '9',
      itens: itensPayload,
      formas_pagamento: formasPagamento,
    },
  }
}

// Interpreta a resposta da Focus e devolve os campos que gravamos em notas_fiscais
export function extrairResultadoFocus(cfg: NfeConfig, data: Record<string, unknown>) {
  const status = String(data.status ?? '')
  const base = focusBaseUrl(cfg.ambiente)
  const caminho = (k: string) => (typeof data[k] === 'string' && data[k] ? `${base}${data[k]}` : null)
  return {
    autorizada: status === 'autorizado',
    processando: status === 'processando_autorizacao',
    status: status === 'autorizado' ? 'autorizada' : status === 'processando_autorizacao' ? 'processando' : status === 'cancelado' ? 'cancelada' : 'erro',
    numero: data.numero != null ? String(data.numero) : null,
    serie: data.serie != null ? String(data.serie) : null,
    chave: data.chave_nfe != null ? String(data.chave_nfe) : null,
    url_danfe: caminho('caminho_danfe'),
    url_xml: caminho('caminho_xml_nota_fiscal'),
    mensagem_erro: data.mensagem_sefaz != null ? String(data.mensagem_sefaz) : data.mensagem != null ? String(data.mensagem) : null,
  }
}
