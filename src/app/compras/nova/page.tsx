'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Fornecedor = { id: string; nome: string; ativo: boolean }

type ItemCompra = {
  key: number
  produto_id: string | null
  descricao: string
  detalhes: string
  quantidade: string
  unidade: string
  custo_unit: string
  desconto: string
}

type ProdutoBusca = { id: string; nome: string; unidade: string | null; custo_unit: number | null; estoque_atual: number | null }

type CompraItemDB = { id: string; produto_id: string | null; descricao: string; quantidade: number; custo_unit: number; desconto: number }

type Compra = {
  id: string
  numero: number
  numero_nfe: string | null
  data_emissao: string
  situacao: string
  total: number
  total_produtos: number
  pagamento: string
  parcelas: { n: number; vencimento: string; valor: number }[] | null
  usuario_nome: string | null
  confirmada_em: string | null
  created_at: string
  fornecedores: { nome: string } | null
  compra_itens: CompraItemDB[]
}

const SITUACAO: Record<string, { label: string; bg: string; color: string }> = {
  em_aberto:    { label: 'Em aberto',    bg: '#f1f5f9', color: '#475569' },
  em_andamento: { label: 'Em andamento', bg: '#fef3c7', color: '#92400e' },
  confirmada:   { label: 'Confirmada',   bg: '#d1fae5', color: '#065f46' },
  cancelada:    { label: 'Cancelada',    bg: '#fee2e2', color: '#991b1b' },
}

const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const num = (s: string) => parseFloat(s.replace(',', '.')) || 0
const hojeISO = () => new Date().toISOString().split('T')[0]

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }
const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 18 }

let itemKeySeq = 1

export default function NovaCompraPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'nova' | 'registradas'>('nova')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [perfilAtual, setPerfilAtual] = useState<{ id: string; nome: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const processandoRef = useRef(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [tabelaFaltando, setTabelaFaltando] = useState(false)

  // ── Dados da compra
  const [fornecedorId, setFornecedorId] = useState('')
  const [numeroNfe, setNumeroNfe] = useState('')
  const [dataEmissao, setDataEmissao] = useState(hojeISO())
  const [situacao, setSituacao] = useState('em_aberto')

  // ── Itens
  const [itens, setItens] = useState<ItemCompra[]>([])
  const [buscaProduto, setBuscaProduto] = useState('')
  const [resultados, setResultados] = useState<ProdutoBusca[]>([])
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Transporte / ajustes
  const [transportadora, setTransportadora] = useState('')
  const [frete, setFrete] = useState('')
  const [freteSoma, setFreteSoma] = useState(true)
  const [descontoGeral, setDescontoGeral] = useState('')
  const [impostos, setImpostos] = useState('')

  // ── Pagamento
  const [pagamento, setPagamento] = useState<'a_vista' | 'parcelado'>('a_vista')
  const [numParcelas, setNumParcelas] = useState('2')
  const [primeiroVenc, setPrimeiroVenc] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0])

  // ── Observações
  const [observacoes, setObservacoes] = useState('')
  const [obsInternas, setObsInternas] = useState('')

  // ── Registradas
  const [compras, setCompras] = useState<Compra[]>([])
  const [loadingCompras, setLoadingCompras] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('fornecedores').select('id,nome,ativo').order('nome')
      setFornecedores(((data ?? []) as Fornecedor[]).filter(f => f.ativo !== false))
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user) {
        const { data: p } = await supabase.from('perfis').select('id, nome').eq('id', userData.user.id).maybeSingle()
        setPerfilAtual(p ? { id: p.id, nome: p.nome } : { id: userData.user.id, nome: userData.user.email ?? 'Usuário' })
      }
    }
    init()
  }, [supabase])

  const fetchCompras = useCallback(async () => {
    setLoadingCompras(true)
    const { data, error } = await supabase
      .from('compras')
      .select('id,numero,numero_nfe,data_emissao,situacao,total,total_produtos,pagamento,parcelas,usuario_nome,confirmada_em,created_at,fornecedores(nome),compra_itens(id,produto_id,descricao,quantidade,custo_unit,desconto)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) { setTabelaFaltando(true); setLoadingCompras(false); return }
    setTabelaFaltando(false)
    setCompras((data as unknown as Compra[]) ?? [])
    setLoadingCompras(false)
  }, [supabase])

  useEffect(() => { if (aba === 'registradas') fetchCompras() }, [aba, fetchCompras])

  // ── Busca de produtos
  function onBuscaProduto(v: string) {
    setBuscaProduto(v)
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    if (v.trim().length < 2) { setResultados([]); return }
    buscaTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('produtos')
        .select('id,nome,unidade,custo_unit,estoque_atual')
        .is('deleted_at', null)
        .or(`nome.ilike.%${v.trim()}%,codigo_interno.ilike.%${v.trim()}%`)
        .limit(8)
      setResultados((data as ProdutoBusca[]) ?? [])
    }, 250)
  }

  function addProduto(p: ProdutoBusca) {
    setItens(prev => [...prev, {
      key: itemKeySeq++, produto_id: p.id, descricao: p.nome, detalhes: '',
      quantidade: '1', unidade: p.unidade ?? 'un', custo_unit: (p.custo_unit ?? 0).toFixed(2), desconto: '',
    }])
    setBuscaProduto(''); setResultados([])
  }

  function addAvulso() {
    if (buscaProduto.trim().length < 2) return
    setItens(prev => [...prev, {
      key: itemKeySeq++, produto_id: null, descricao: buscaProduto.trim(), detalhes: '',
      quantidade: '1', unidade: 'un', custo_unit: '', desconto: '',
    }])
    setBuscaProduto(''); setResultados([])
  }

  function setItem(key: number, campo: keyof ItemCompra, valor: string) {
    setItens(prev => prev.map(i => i.key === key ? { ...i, [campo]: valor } : i))
  }

  const subtotalItem = (i: ItemCompra) => Math.max(0, (parseInt(i.quantidade) || 0) * num(i.custo_unit) - num(i.desconto))
  const totalProdutos = itens.reduce((s, i) => s + subtotalItem(i), 0)
  const totalFinal = Math.max(0, totalProdutos + (freteSoma ? num(frete) : 0) + num(impostos) - num(descontoGeral))

  // Prévia das parcelas
  const nParc = Math.max(2, parseInt(numParcelas) || 2)
  const parcelasPreview = pagamento === 'parcelado'
    ? Array.from({ length: nParc }, (_, i) => {
        const venc = new Date(new Date(primeiroVenc + 'T12:00:00').getTime() + i * 30 * 86400000)
        const valorBase = Math.floor((totalFinal / nParc) * 100) / 100
        const valor = i === 0 ? Math.round((totalFinal - valorBase * (nParc - 1)) * 100) / 100 : valorBase
        return { n: i + 1, vencimento: venc.toISOString().split('T')[0], valor }
      })
    : null

  // ── Entrada no estoque (ao confirmar)
  // Tenta vincular itens avulsos pelo nome, insere as entradas em lote e
  // devolve um resumo do que entrou / ficou de fora / falhou.
  async function aplicarEntradaEstoque(itensDB: CompraItemDB[], numeroCompra: number, nfe: string | null, dataCompra: string) {
    let semVinculo = 0
    let erros = 0
    const paraEntrada: { produto_id: string; quantidade: number; custo_unit: number }[] = []

    setProgresso(`Verificando vínculos dos ${itensDB.length} itens...`)
    for (const item of itensDB) {
      if (item.quantidade <= 0) continue
      let pid = item.produto_id
      if (!pid) {
        // Item avulso: tenta achar produto com o mesmo nome no estoque
        const { data: match } = await supabase.from('produtos').select('id')
          .is('deleted_at', null).ilike('nome', item.descricao.trim()).limit(2)
        if (match && match.length === 1) {
          pid = match[0].id
          // Persiste o vínculo no item da compra (quando o item tem id real)
          if (item.id.length === 36) await supabase.from('compra_itens').update({ produto_id: pid }).eq('id', item.id)
        }
      }
      if (!pid) { semVinculo++; continue }
      paraEntrada.push({ produto_id: pid, quantidade: item.quantidade, custo_unit: item.custo_unit })
    }

    // Histórico de entradas em lote (1 requisição)
    if (paraEntrada.length > 0) {
      setProgresso(`Registrando ${paraEntrada.length} entradas...`)
      const { error: errEnt } = await supabase.from('produto_entradas').insert(paraEntrada.map(p => ({
        produto_id: p.produto_id, quantidade: p.quantidade,
        custo_unit: p.custo_unit, data_compra: dataCompra, nota_fiscal: nfe || `Compra #${numeroCompra}`,
      })))
      if (errEnt) {
        setProgresso(null)
        return { ok: 0, semVinculo, erros: paraEntrada.length, msgErro: errEnt.message }
      }
    }

    // Atualiza o estoque agrupado por produto
    const porProduto = new Map<string, number>()
    paraEntrada.forEach(p => porProduto.set(p.produto_id, (porProduto.get(p.produto_id) ?? 0) + p.quantidade))
    const movs: { filial_id: string; produto_id: string; tipo: string; quantidade: number; motivo: string }[] = []
    let ok = 0
    let n = 0
    let msgErro: string | undefined
    for (const [pid, q] of porProduto) {
      n++
      setProgresso(`Atualizando estoque ${n}/${porProduto.size}...`)
      const { data: prod, error: e1 } = await supabase.from('produtos').select('estoque_atual, filial_id').eq('id', pid).single()
      if (e1 || !prod) { erros++; msgErro = e1?.message ?? msgErro; continue }
      const { error: e2 } = await supabase.from('produtos').update({ estoque_atual: (prod.estoque_atual ?? 0) + q }).eq('id', pid)
      if (e2) { erros++; msgErro = e2.message; continue }
      ok++
      if (prod.filial_id) movs.push({ filial_id: prod.filial_id, produto_id: pid, tipo: 'entrada', quantidade: q, motivo: `Compra #${numeroCompra}` })
    }
    if (movs.length > 0) await supabase.from('movimentacoes_estoque').insert(movs)
    setProgresso(null)
    return { ok, semVinculo, erros, msgErro }
  }

  function resumoEntrada(r: { ok: number; semVinculo: number; erros: number; msgErro?: string }) {
    const partes = [`✅ ${r.ok} produto${r.ok !== 1 ? 's' : ''} com entrada no estoque.`]
    if (r.semVinculo > 0) partes.push(`⚠️ ${r.semVinculo} item(ns) avulso(s) sem vínculo com o estoque — não tiveram entrada (vincule pelo nome exato do produto ou lance manualmente no Estoque).`)
    if (r.erros > 0) partes.push(`❌ ${r.erros} erro(s)${r.msgErro ? `: ${r.msgErro}` : ''}`)
    return partes.join('\n')
  }

  async function estornarEntradaEstoque(itensDB: CompraItemDB[], numeroCompra: number) {
    for (const item of itensDB) {
      if (!item.produto_id || item.quantidade <= 0) continue
      const { data: prod } = await supabase.from('produtos').select('estoque_atual, filial_id').eq('id', item.produto_id).single()
      if (prod && prod.estoque_atual != null) {
        await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - item.quantidade) }).eq('id', item.produto_id)
        if (prod.filial_id)
          await supabase.from('movimentacoes_estoque').insert({
            filial_id: prod.filial_id, produto_id: item.produto_id, tipo: 'saida',
            quantidade: item.quantidade, motivo: `Estorno compra #${numeroCompra}`,
          })
      }
    }
  }

  async function cadastrar() {
    if (salvando || processandoRef.current) return
    if (itens.length === 0) { alert('Adicione ao menos um produto à compra.'); return }
    if (!fornecedorId) { alert('Selecione o fornecedor.'); return }
    processandoRef.current = true
    setSalvando(true); setSucesso(null)

    const { data: compra, error } = await supabase.from('compras').insert({
      fornecedor_id: fornecedorId,
      numero_nfe: numeroNfe.trim() || null,
      data_emissao: dataEmissao,
      situacao,
      transportadora: transportadora.trim() || null,
      frete: num(frete), frete_soma: freteSoma,
      desconto: num(descontoGeral), impostos: num(impostos),
      total_produtos: totalProdutos, total: totalFinal,
      pagamento, parcelas: parcelasPreview,
      observacoes: observacoes.trim() || null,
      observacoes_internas: obsInternas.trim() || null,
      usuario_id: perfilAtual?.id ?? null, usuario_nome: perfilAtual?.nome ?? null,
      confirmada_em: situacao === 'confirmada' ? new Date().toISOString() : null,
    }).select('id, numero').single()

    if (error || !compra) {
      if (error?.code === '42P01') setTabelaFaltando(true)
      alert(`Erro ao cadastrar: ${error?.message ?? 'desconhecido'}`)
      processandoRef.current = false; setSalvando(false); return
    }

    const itensDB = itens.map(i => ({
      compra_id: compra.id, produto_id: i.produto_id, descricao: i.descricao,
      detalhes: i.detalhes.trim() || null, quantidade: Math.max(1, parseInt(i.quantidade) || 1),
      unidade: i.unidade, custo_unit: num(i.custo_unit), desconto: num(i.desconto),
    }))
    const { data: itensSalvos, error: errItens } = await supabase.from('compra_itens').insert(itensDB)
      .select('id,produto_id,descricao,quantidade,custo_unit,desconto')
    if (errItens) { alert(`Compra criada, mas erro ao salvar itens: ${errItens.message}`); processandoRef.current = false; setSalvando(false); return }

    if (situacao === 'confirmada') {
      const r = await aplicarEntradaEstoque(
        (itensSalvos as CompraItemDB[]) ?? [],
        compra.numero, numeroNfe.trim() || null, dataEmissao,
      )
      alert(`Compra #${compra.numero} cadastrada.\n\n${resumoEntrada(r)}`)
    }

    // Limpa o formulário
    setFornecedorId(''); setNumeroNfe(''); setDataEmissao(hojeISO()); setSituacao('em_aberto')
    setItens([]); setTransportadora(''); setFrete(''); setFreteSoma(true); setDescontoGeral(''); setImpostos('')
    setPagamento('a_vista'); setNumParcelas('2'); setObservacoes(''); setObsInternas('')
    setSucesso(`Compra #${compra.numero} cadastrada${situacao === 'confirmada' ? ' e estoque atualizado' : ''}!`)
    processandoRef.current = false
    setSalvando(false)
  }

  async function mudarSituacao(c: Compra, nova: 'confirmada' | 'cancelada') {
    if (salvando || processandoRef.current) return
    const eraConfirmada = c.situacao === 'confirmada'
    if (nova === 'confirmada') {
      const totalItens = c.compra_itens.reduce((s, i) => s + i.quantidade, 0)
      if (!confirm(`Confirmar a compra #${c.numero}?\n\nSerá dada entrada de até ${totalItens} itens no estoque (itens avulsos são vinculados pelo nome quando possível).`)) return
    } else {
      if (!confirm(`Cancelar a compra #${c.numero}?${eraConfirmada ? '\n\nA entrada no estoque será estornada.' : ''}`)) return
    }
    processandoRef.current = true
    setSalvando(true)

    if (nova === 'confirmada') {
      // Trava atômica: só confirma se AINDA não estiver confirmada.
      // Um segundo clique (ou outra aba) não passa daqui — evita entrada dupla.
      const agora = new Date().toISOString()
      const { data: claimed, error: errClaim } = await supabase.from('compras')
        .update({ situacao: 'confirmada', confirmada_em: agora, updated_at: agora })
        .eq('id', c.id)
        .neq('situacao', 'confirmada')
        .select('id')
      if (errClaim || !claimed || claimed.length === 0) {
        processandoRef.current = false
        setSalvando(false)
        alert(errClaim ? `Erro: ${errClaim.message}` : `A compra #${c.numero} já estava confirmada — nada foi feito, para evitar entrada duplicada.`)
        fetchCompras()
        return
      }
      const r = await aplicarEntradaEstoque(c.compra_itens, c.numero, c.numero_nfe, c.data_emissao)
      alert(`Compra #${c.numero} confirmada.\n\n${resumoEntrada(r)}`)
    } else {
      if (eraConfirmada) await estornarEntradaEstoque(c.compra_itens, c.numero)
      await supabase.from('compras').update({ situacao: 'cancelada', updated_at: new Date().toISOString() }).eq('id', c.id)
    }

    processandoRef.current = false
    setSalvando(false)
    fetchCompras()
  }

  // Confere a entrada de uma compra confirmada e corrige nos dois sentidos:
  // remove entradas duplicadas (ex.: confirmação clicada 2x) e lança as que
  // faltam (ex.: itens avulsos vinculados depois). Idempotente — pode rodar
  // quantas vezes for preciso.
  async function conferirECorrigir(c: Compra) {
    if (salvando || processandoRef.current) return
    if (!confirm(`Conferir e corrigir a entrada da compra #${c.numero}?\n\nO sistema compara o que deveria ter entrado com o que entrou de fato:\n• remove entradas duplicadas (confirmação em dobro)\n• lança as entradas que faltam (itens sem vínculo que agora têm)\n\nPode rodar quantas vezes precisar — não duplica nada.`)) return
    processandoRef.current = true
    setSalvando(true)
    const nfRef = c.numero_nfe || `Compra #${c.numero}`

    // 1. Resolve vínculos (auto-link por nome exato, persistindo no item)
    const esperadoPorProduto = new Map<string, number>()
    let semVinculo = 0
    setProgresso('Verificando vínculos dos itens...')
    for (const item of c.compra_itens) {
      if (item.quantidade <= 0) continue
      let pid = item.produto_id
      if (!pid) {
        const { data: match } = await supabase.from('produtos').select('id')
          .is('deleted_at', null).ilike('nome', item.descricao.trim()).limit(2)
        if (match && match.length === 1) {
          pid = match[0].id
          await supabase.from('compra_itens').update({ produto_id: pid }).eq('id', item.id)
        }
      }
      if (!pid) { semVinculo++; continue }
      esperadoPorProduto.set(pid, (esperadoPorProduto.get(pid) ?? 0) + item.quantidade)
    }

    // 2. Compara com as entradas já registradas desta compra e corrige
    let removidas = 0
    let adicionadas = 0
    let corretos = 0
    let erros = 0
    const msgsErro: string[] = []
    const registrarErro = (msg: string | undefined) => {
      erros++
      if (msg && !msgsErro.includes(msg)) msgsErro.push(msg)
      if (msg) console.error('[conferirECorrigir]', msg)
    }
    let n = 0
    for (const [pid, esperado] of esperadoPorProduto) {
      n++
      setProgresso(`Conferindo produto ${n}/${esperadoPorProduto.size}...`)
      const { data: rows, error: e0 } = await supabase.from('produto_entradas')
        .select('id, quantidade')
        .eq('produto_id', pid).eq('nota_fiscal', nfRef).eq('data_compra', c.data_emissao)
        .order('created_at', { ascending: false })
      if (e0) { registrarErro(e0.message); continue }
      const atual = (rows ?? []).reduce((s, r) => s + r.quantidade, 0)

      if (atual > esperado) {
        // Excesso: apaga as entradas mais recentes até bater e devolve o estoque
        const excesso = atual - esperado
        let removidoQtd = 0
        for (const r of rows ?? []) {
          if (removidoQtd >= excesso) break
          const { error: eDel } = await supabase.from('produto_entradas').delete().eq('id', r.id)
          if (!eDel) removidoQtd += r.quantidade
        }
        if (removidoQtd > 0) {
          const { data: prod } = await supabase.from('produtos').select('estoque_atual, filial_id').eq('id', pid).single()
          if (prod) {
            await supabase.from('produtos').update({ estoque_atual: Math.max(0, (prod.estoque_atual ?? 0) - removidoQtd) }).eq('id', pid)
            if (prod.filial_id)
              await supabase.from('movimentacoes_estoque').insert({
                filial_id: prod.filial_id, produto_id: pid, tipo: 'saida',
                quantidade: removidoQtd, motivo: `Correção de entrada duplicada — compra #${c.numero}`,
              })
          }
          removidas += removidoQtd
        }
      } else if (atual < esperado) {
        // Falta: lança a diferença
        const falta = esperado - atual
        const custoItem = c.compra_itens.find(i => i.produto_id === pid)?.custo_unit ?? 0
        const { error: eIns } = await supabase.from('produto_entradas').insert({
          produto_id: pid, quantidade: falta, custo_unit: custoItem,
          data_compra: c.data_emissao, nota_fiscal: nfRef,
        })
        if (eIns) { registrarErro(eIns.message); continue }
        const { data: prod } = await supabase.from('produtos').select('estoque_atual, filial_id').eq('id', pid).single()
        if (prod) {
          await supabase.from('produtos').update({ estoque_atual: (prod.estoque_atual ?? 0) + falta }).eq('id', pid)
          if (prod.filial_id)
            await supabase.from('movimentacoes_estoque').insert({
              filial_id: prod.filial_id, produto_id: pid, tipo: 'entrada',
              quantidade: falta, motivo: `Compra #${c.numero} (correção)`,
            })
        }
        adicionadas += falta
      } else {
        corretos++
      }
    }

    setProgresso(null)
    processandoRef.current = false
    setSalvando(false)
    alert([
      `Conferência da compra #${c.numero} concluída:`,
      '',
      `✅ ${corretos} produtos já estavam corretos`,
      removidas > 0 ? `➖ ${removidas} unidades duplicadas removidas (estoque ajustado)` : null,
      adicionadas > 0 ? `➕ ${adicionadas} unidades que faltavam foram lançadas` : null,
      semVinculo > 0 ? `⚠️ ${semVinculo} itens sem vínculo (nome não bate com nenhum produto do estoque)` : null,
      erros > 0 ? `❌ ${erros} erros — motivo: ${msgsErro[0] ?? 'desconhecido'}` : null,
      msgsErro.some(m => m.includes('produto_entradas')) || msgsErro.some(m => m.toLowerCase().includes('does not exist'))
        ? '\n💡 A tabela de histórico de entradas parece não existir no banco. Rode o arquivo supabase-migration-produto-entradas.sql no SQL Editor do Supabase e tente de novo.'
        : null,
    ].filter(Boolean).join('\n'))
    fetchCompras()
  }

  return (
    <div style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Compras</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>Registre notas de compra de fornecedores — ao confirmar, os produtos entram no estoque.</p>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 22, borderBottom: '1px solid #e2e8f0' }}>
        {([['nova', '➕ Adicionar compra'], ['registradas', '📋 Registradas']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setAba(key)}
            style={{
              padding: '10px 18px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: aba === key ? 600 : 400, color: aba === key ? '#2563eb' : '#94a3b8',
              borderBottom: aba === key ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {tabelaFaltando && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#92400e' }}>
          ⚠️ As tabelas de compras ainda não existem no banco. Rode o arquivo <code>supabase-migration-compras-notas.sql</code> no SQL Editor do Supabase.
        </div>
      )}

      {progresso && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
          ⏳ {progresso}
        </div>
      )}

      {sucesso && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#166534', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {sucesso}</span>
          <button onClick={() => { setSucesso(null); setAba('registradas') }} style={{ border: '1px solid #86efac', background: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#166534', fontWeight: 600 }}>Ver registradas →</button>
        </div>
      )}

      {/* ═══ ABA ADICIONAR ═══ */}
      {aba === 'nova' && (
        <>
          {/* Dados da compra */}
          <div style={card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Dados da compra</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <div>
                <label style={lbl}>Fornecedor *</label>
                <select style={inp} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <Link href="/fornecedores" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>+ Cadastrar novo fornecedor</Link>
              </div>
              <div>
                <label style={lbl}>Número da NF-e</label>
                <input style={inp} value={numeroNfe} onChange={e => setNumeroNfe(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label style={lbl}>Data de emissão</label>
                <input type="date" style={inp} value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Situação</label>
                <select style={inp} value={situacao} onChange={e => setSituacao(e.target.value)}>
                  <option value="em_aberto">Em aberto</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="confirmada">Confirmada (dá entrada no estoque)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Produtos */}
          <div style={card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Produtos</h2>

            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                value={buscaProduto}
                onChange={e => onBuscaProduto(e.target.value)}
                placeholder="🔍 Buscar produto do estoque por nome ou código... (Enter para adicionar como item avulso)"
                onKeyDown={async e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (resultados.length > 0) { addProduto(resultados[0]); return }
                  // A busca é assíncrona: antes de criar item avulso, consulta o estoque agora
                  const v = buscaProduto.trim()
                  if (v.length < 2) return
                  const { data } = await supabase.from('produtos')
                    .select('id,nome,unidade,custo_unit,estoque_atual')
                    .is('deleted_at', null)
                    .or(`nome.ilike.%${v}%,codigo_interno.ilike.%${v}%`)
                    .limit(1)
                  if (data && data.length > 0) addProduto(data[0] as ProdutoBusca)
                  else addAvulso()
                }}
                style={inp}
              />
              {resultados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 20, maxHeight: 260, overflowY: 'auto' }}>
                  {resultados.map(p => (
                    <button key={p.id} onClick={() => addProduto(p)}
                      style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                      <span style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</span>
                      <span style={{ color: '#64748b', flexShrink: 0, marginLeft: 8 }}>custo: {fmt(p.custo_unit ?? 0)} · est: {p.estoque_atual ?? '—'}</span>
                    </button>
                  ))}
                  <button onClick={addAvulso} style={{ width: '100%', padding: '9px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#2563eb', textAlign: 'left', fontWeight: 600 }}>
                    + Adicionar &quot;{buscaProduto}&quot; como item avulso
                  </button>
                </div>
              )}
            </div>

            {itens.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '18px 0', margin: 0 }}>Adicione os produtos desta compra usando a busca acima.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Produto', 'Detalhes', 'Qtd', 'Un', 'Valor de custo', 'Desconto', 'Subtotal', ''].map((h, i) => (
                        <th key={i} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(i => (
                      <tr key={i.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 500, color: '#0f172a', minWidth: 160 }}>
                          {i.descricao}
                          {!i.produto_id && <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', borderRadius: 20, padding: '1px 7px', marginLeft: 6 }}>avulso</span>}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input style={{ ...inp, width: 130 }} value={i.detalhes} onChange={e => setItem(i.key, 'detalhes', e.target.value)} placeholder="Cor, qualidade..." />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input type="number" min={1} style={{ ...inp, width: 64 }} value={i.quantidade} onChange={e => setItem(i.key, 'quantidade', e.target.value)} />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <select style={{ ...inp, width: 64 }} value={i.unidade} onChange={e => setItem(i.key, 'unidade', e.target.value)}>
                            {['un', 'pç', 'cx', 'kit'].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input style={{ ...inp, width: 92 }} value={i.custo_unit} onChange={e => setItem(i.key, 'custo_unit', e.target.value)} placeholder="0,00" />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input style={{ ...inp, width: 80 }} value={i.desconto} onChange={e => setItem(i.key, 'desconto', e.target.value)} placeholder="0,00" />
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(subtotalItem(i))}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <button onClick={() => setItens(prev => prev.filter(x => x.key !== i.key))} style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 6, padding: '5px 9px', fontSize: 12, cursor: 'pointer' }}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ padding: '10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total de produtos</td>
                      <td colSpan={2} style={{ padding: '10px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{fmt(totalProdutos)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Transporte e ajustes */}
          <div style={card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Transporte, descontos e impostos</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
              <div>
                <label style={lbl}>Transportadora</label>
                <input style={inp} value={transportadora} onChange={e => setTransportadora(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label style={lbl}>Valor do frete (R$)</label>
                <input style={inp} value={frete} onChange={e => setFrete(e.target.value)} placeholder="0,00" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginTop: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={freteSoma} onChange={e => setFreteSoma(e.target.checked)} /> Somar ao total
                </label>
              </div>
              <div>
                <label style={lbl}>Desconto (R$)</label>
                <input style={inp} value={descontoGeral} onChange={e => setDescontoGeral(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label style={lbl}>Impostos (R$)</label>
                <input style={inp} value={impostos} onChange={e => setImpostos(e.target.value)} placeholder="0,00" />
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div style={card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Pagamento</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {([['a_vista', '💵 À vista'], ['parcelado', '📆 Parcelado']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setPagamento(key)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: pagamento === key ? 600 : 400, cursor: 'pointer',
                    border: pagamento === key ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: pagamento === key ? '#dbeafe' : '#fff', color: pagamento === key ? '#1d4ed8' : '#64748b',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {pagamento === 'parcelado' && (
              <>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>Nº de parcelas</label>
                    <input type="number" min={2} max={24} style={{ ...inp, width: 100 }} value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>1º vencimento</label>
                    <input type="date" style={{ ...inp, width: 160 }} value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)} />
                  </div>
                </div>
                {parcelasPreview && totalFinal > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {parcelasPreview.map(p => (
                      <div key={p.n} style={{ fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', color: '#475569' }}>
                        <strong>{p.n}ª</strong> · {new Date(p.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')} · <strong style={{ color: '#0f172a' }}>{fmt(p.valor)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Observações */}
          <div style={card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Observações</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              <div>
                <label style={lbl}>Observações</label>
                <textarea rows={3} style={{ ...inp, resize: 'vertical' }} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Observações internas</label>
                <textarea rows={3} style={{ ...inp, resize: 'vertical' }} value={obsInternas} onChange={e => setObsInternas(e.target.value)} placeholder="Visível apenas para a equipe" />
              </div>
            </div>
          </div>

          {/* Rodapé: total + ações */}
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, position: 'sticky', bottom: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor total</p>
              <p style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{fmt(totalFinal)}</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => history.back()} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#475569' }}>Cancelar</button>
              <button onClick={cadastrar} disabled={salvando}
                style={{ padding: '10px 26px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: salvando ? 'wait' : 'pointer', background: '#2563eb', color: '#fff', boxShadow: '0 1px 3px rgba(37,99,235,0.3)' }}>
                {salvando ? 'Cadastrando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ ABA REGISTRADAS ═══ */}
      {aba === 'registradas' && (
        loadingCompras ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
        ) : compras.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>Nenhuma compra registrada ainda</p>
          </div>
        ) : (
          <div>
            {compras.map(c => {
              const st = SITUACAO[c.situacao] ?? SITUACAO.em_aberto
              const cancelada = c.situacao === 'cancelada'
              const qtdItens = c.compra_itens.reduce((s, i) => s + i.quantidade, 0)
              const semVinculo = c.compra_itens.filter(i => !i.produto_id).length
              return (
                <div key={c.id} style={{
                  background: cancelada ? '#fef2f2' : '#fff',
                  border: `1px solid ${cancelada ? '#fecaca' : '#e2e8f0'}`,
                  borderLeft: `4px solid ${cancelada ? '#ef4444' : c.situacao === 'confirmada' ? '#10b981' : '#f59e0b'}`,
                  opacity: cancelada ? 0.75 : 1,
                  borderRadius: 10, padding: '13px 16px', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 60 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>#{c.numero}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(c.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.fornecedores?.nome ?? 'Sem fornecedor'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {qtdItens} ite{qtdItens > 1 ? 'ns' : 'm'}
                      {c.numero_nfe && <span> · NF {c.numero_nfe}</span>}
                      {c.pagamento === 'parcelado' && c.parcelas && <span> · {c.parcelas.length}× parcelas</span>}
                      {c.usuario_nome && <span> · 👤 {c.usuario_nome}</span>}
                    </div>
                    {semVinculo > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginTop: 3 }}>
                        ⚠ {semVinculo} ite{semVinculo > 1 ? 'ns' : 'm'} sem vínculo com o estoque
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: cancelada ? '#991b1b' : '#0f172a', textDecoration: cancelada ? 'line-through' : 'none' }}>{fmt(c.total ?? 0)}</div>
                    <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                      {c.situacao === 'confirmada' ? '✅ ' : ''}{st.label}
                    </span>
                    {c.situacao === 'confirmada' && c.confirmada_em && (
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        em {new Date(c.confirmada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(c.situacao === 'em_aberto' || c.situacao === 'em_andamento') && (
                      <button disabled={salvando} onClick={() => mudarSituacao(c, 'confirmada')} style={{ padding: '6px 12px', border: '1px solid #86efac', borderRadius: 7, background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✅ Confirmar</button>
                    )}
                    {c.situacao === 'confirmada' && (
                      <button disabled={salvando} onClick={() => conferirECorrigir(c)} title="Compara o esperado com o que entrou e corrige duplicidades ou faltas — seguro rodar mais de uma vez" style={{ padding: '6px 12px', border: '1px solid #bfdbfe', borderRadius: 7, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔧 Conferir/corrigir entrada</button>
                    )}
                    {c.situacao !== 'cancelada' && (
                      <button disabled={salvando} onClick={() => mudarSituacao(c, 'cancelada')} style={{ padding: '6px 12px', border: '1px solid #fecaca', borderRadius: 7, background: '#fef2f2', color: '#991b1b', fontSize: 12, cursor: 'pointer' }}>❌ Cancelar</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
