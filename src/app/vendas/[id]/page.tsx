'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type VendaItem = {
  id: string
  produto_id: string | null
  descricao: string
  quantidade: number
  preco_unit: number
}

type Venda = {
  id: string
  numero?: number
  status: string
  tipo: string
  filial_id?: string | null
  created_at: string
  total: number
  desconto: number
  subtotal: number
  forma_pagamento: string
  taxa_pagamento?: number
  observacoes?: string
  campos_extras?: { custom?: Record<string, string> }
  perfis?: { nome: string } | null
  venda_itens?: VendaItem[]
  pagamentos?: any
}

type CampoPersonalizado = {
  id: string
  nome: string
  tipo: string
}

type NotaFiscal = {
  id: string
  referencia: string
  status: string
  numero: string | null
  chave: string | null
  url_danfe: string | null
  url_xml: string | null
  mensagem_erro: string | null
}

type Alteracao = {
  id: string
  usuario_nome: string | null
  acao: string
  detalhes: Record<string, any> | null
  created_at: string
}

type GarantiaProduto = {
  id: string
  produto_nome: string
  tipo: string
  quantidade: number
  valor_credito: number | null
  credito_status: string | null
  cliente_nome: string | null
  motivo: string | null
  usuario_nome: string | null
  created_at: string
}

type ProdutoBusca = {
  id: string
  nome: string
  preco_venda: number | null
  estoque_atual: number | null
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_VENDA: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  finalizada: { label: 'Concretizada', bg: '#16a34a', color: '#fff', icon: '✅' },
  aberta:     { label: 'Em andamento', bg: '#d97706', color: '#fff', icon: '✏️' },
  cancelada:  { label: 'Cancelada',    bg: '#dc2626', color: '#fff', icon: '❌' },
  pendente:   { label: 'Pendente',     bg: '#ea580c', color: '#fff', icon: '⏳' },
}

const hoje = () => new Date().toISOString().split('T')[0]

export default function VendaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [venda, setVenda] = useState<Venda | null>(null)
  const [campos, setCampos] = useState<CampoPersonalizado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState<NotaFiscal | null>(null)
  const [nfeAtivo, setNfeAtivo] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [nfeErro, setNfeErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Garantias de produtos vinculadas a esta venda
  const [garantias, setGarantias] = useState<GarantiaProduto[]>([])

  // Auditoria
  const [alteracoes, setAlteracoes] = useState<Alteracao[]>([])
  const [auditIndisponivel, setAuditIndisponivel] = useState(false)
  const [perfilAtual, setPerfilAtual] = useState<{ id: string; nome: string } | null>(null)

  // Edição de itens (status "aberta" / em andamento)
  const [itensEdit, setItensEdit] = useState<Record<string, { quantidade: string; preco_unit: string }>>({})
  const [buscaProduto, setBuscaProduto] = useState('')
  const [resultadosProduto, setResultadosProduto] = useState<ProdutoBusca[]>([])
  const buscaProdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [manualDesc, setManualDesc] = useState('')
  const [manualPreco, setManualPreco] = useState('')

  async function carregarNota() {
    const { data } = await supabase.from('notas_fiscais')
      .select('id, referencia, status, numero, chave, url_danfe, url_xml, mensagem_erro')
      .eq('venda_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setNota((data as NotaFiscal) ?? null)
  }

  async function emitirNota() {
    setEmitindo(true); setNfeErro(null)
    try {
      const res = await fetch('/api/nfe/emitir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venda_id: id }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok || data.error) setNfeErro(data.error ?? 'Erro ao emitir')
      await carregarNota()
    } catch (e) {
      setNfeErro(String(e))
    } finally {
      setEmitindo(false)
    }
  }

  async function consultarNota() {
    if (!nota) return
    setEmitindo(true)
    try {
      await fetch(`/api/nfe/status?ref=${encodeURIComponent(nota.referencia)}`)
      await carregarNota()
    } finally {
      setEmitindo(false)
    }
  }

  const carregarAlteracoes = useCallback(async () => {
    const { data, error: err } = await supabase.from('venda_alteracoes')
      .select('id, usuario_nome, acao, detalhes, created_at')
      .eq('venda_id', id).order('created_at', { ascending: false })
    if (err) { setAuditIndisponivel(true); return }
    setAuditIndisponivel(false)
    setAlteracoes((data as Alteracao[]) ?? [])
  }, [supabase, id])

  const carregar = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('vendas')
        .select('*, perfis(nome), venda_itens(*)')
        .eq('id', id)
        .single()

      if (err) throw err
      const v = data as Venda
      setVenda(v)
      const edit: Record<string, { quantidade: string; preco_unit: string }> = {}
      for (const item of v.venda_itens ?? []) edit[item.id] = { quantidade: String(item.quantidade), preco_unit: item.preco_unit.toFixed(2) }
      setItensEdit(edit)

      const res = await fetch('/api/campos-personalizados?entidade=venda')
      const d = await res.json()
      setCampos(d.campos ?? [])

      const { data: cfg } = await supabase.from('nfe_config').select('ativo').maybeSingle()
      setNfeAtivo(cfg?.ativo ?? false)
      await carregarNota()
      await carregarAlteracoes()

      // Garantias de produtos desta venda (silencioso se a tabela ainda não existir)
      const { data: gars } = await supabase.from('garantias_produtos')
        .select('id,produto_nome,tipo,quantidade,valor_credito,credito_status,cliente_nome,motivo,usuario_nome,created_at')
        .eq('venda_id', id).order('created_at', { ascending: false })
      setGarantias((gars as GarantiaProduto[]) ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar venda')
    } finally {
      setLoading(false)
    }
  }, [supabase, id, carregarAlteracoes])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    const buscarPerfil = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const { data: p } = await supabase.from('perfis').select('id, nome').eq('id', userData.user.id).maybeSingle()
      setPerfilAtual(p ? { id: p.id, nome: p.nome } : { id: userData.user.id, nome: userData.user.email ?? 'Usuário' })
    }
    buscarPerfil()
  }, [supabase])

  async function registrarAlteracao(acao: string, detalhes: Record<string, any>) {
    await supabase.from('venda_alteracoes').insert({
      venda_id: id,
      filial_id: venda?.filial_id ?? null,
      usuario_id: perfilAtual?.id ?? null,
      usuario_nome: perfilAtual?.nome ?? null,
      acao,
      detalhes,
    })
  }

  // ── Efeitos no estoque e no caixa (aplicar = concretizar, estornar = reabrir/cancelar)
  async function aplicarEfeitos(sentido: 'aplicar' | 'estornar') {
    if (!venda) return
    const numeroLabel = venda.numero ?? venda.id.slice(0, 8)
    for (const item of venda.venda_itens ?? []) {
      if (!item.produto_id) continue
      const { data: prod } = await supabase.from('produtos').select('estoque_atual, filial_id').eq('id', item.produto_id).single()
      if (prod && prod.estoque_atual != null) {
        const novo = sentido === 'aplicar'
          ? Math.max(0, prod.estoque_atual - item.quantidade)
          : prod.estoque_atual + item.quantidade
        await supabase.from('produtos').update({ estoque_atual: novo }).eq('id', item.produto_id)
        if (prod.filial_id)
          await supabase.from('movimentacoes_estoque').insert({
            filial_id: prod.filial_id, produto_id: item.produto_id,
            tipo: sentido === 'aplicar' ? 'saida' : 'entrada', quantidade: item.quantidade,
            motivo: `${sentido === 'aplicar' ? 'Venda' : 'Estorno venda'} #${numeroLabel}`,
          })
      }
    }
    // Lançamento no caixa: estorno entra como valor negativo para manter o total do dia correto
    await supabase.from('caixa_movimentos').insert({
      tipo: 'venda',
      valor: sentido === 'aplicar' ? venda.total : -venda.total,
      forma: venda.forma_pagamento ?? 'dinheiro',
      referencia_id: venda.id,
      observacoes: `${sentido === 'aplicar' ? 'Reaplicação' : 'Estorno'} venda #${numeroLabel}`,
      data_ref: hoje(),
    })
  }

  async function mudarStatus(novo: 'finalizada' | 'aberta' | 'cancelada') {
    if (!venda || venda.status === novo || salvando) return
    const de = venda.status
    const estavaAplicada = de === 'finalizada'
    const ficaraAplicada = novo === 'finalizada'

    const msgs: string[] = []
    if (novo === 'aberta' && estavaAplicada) msgs.push(`Reabrir a venda para edição?\n\n• O estoque dos itens será devolvido\n• Um estorno de ${fmt(venda.total)} será lançado no caixa de hoje\n\nAo concretizar de novo, tudo será reaplicado com os itens atualizados.`)
    if (novo === 'cancelada' && estavaAplicada) msgs.push(`Cancelar esta venda?\n\n• O estoque dos itens será devolvido\n• Um estorno de ${fmt(venda.total)} será lançado no caixa de hoje\n\nA venda continuará visível no histórico, marcada como cancelada.`)
    if (novo === 'cancelada' && !estavaAplicada) msgs.push('Cancelar esta venda? Como ela está em andamento, não há efeito no estoque nem no caixa.')
    if (novo === 'finalizada') msgs.push(`Concretizar a venda?\n\n• O estoque dos itens será baixado\n• ${fmt(venda.total)} será lançado no caixa de hoje`)
    if (novo === 'aberta' && !estavaAplicada) msgs.push('Reativar esta venda como "Em andamento" para edição?')
    if (novo === 'cancelada' && nota?.status === 'autorizada') msgs.push(`⚠️ ATENÇÃO: existe uma nota fiscal AUTORIZADA (nº ${nota.numero ?? '—'}) vinculada a esta venda. O cancelamento aqui NÃO cancela a NFC-e na SEFAZ — faça isso separadamente se necessário.`)

    if (!confirm(msgs.join('\n\n'))) return

    setSalvando(true)
    if (estavaAplicada && !ficaraAplicada) await aplicarEfeitos('estornar')
    if (!estavaAplicada && ficaraAplicada) await aplicarEfeitos('aplicar')

    const { error: err } = await supabase.from('vendas').update({ status: novo, updated_at: new Date().toISOString() }).eq('id', id)
    if (err) { alert(`Erro ao mudar status: ${err.message}`); setSalvando(false); return }

    await registrarAlteracao('status', { de, para: novo })
    setSalvando(false)
    await carregar()
  }

  // ── Recalcular totais após mexer nos itens
  async function recalcularTotais() {
    const { data: itens } = await supabase.from('venda_itens').select('quantidade, preco_unit').eq('venda_id', id)
    const subtotal = (itens ?? []).reduce((s, i) => s + i.quantidade * Number(i.preco_unit), 0)
    const total = Math.max(0, subtotal - (venda?.desconto ?? 0))
    await supabase.from('vendas').update({ subtotal, total, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function salvarItem(item: VendaItem) {
    const edit = itensEdit[item.id]
    if (!edit) return
    const novaQtd = Math.max(1, parseInt(edit.quantidade) || 1)
    const novoPreco = Math.max(0, parseFloat(edit.preco_unit.replace(',', '.')) || 0)
    if (novaQtd === item.quantidade && Math.abs(novoPreco - item.preco_unit) < 0.001) return
    setSalvando(true)
    const { error: err } = await supabase.from('venda_itens').update({ quantidade: novaQtd, preco_unit: novoPreco }).eq('id', item.id)
    if (err) { alert(`Erro: ${err.message}`); setSalvando(false); return }
    await registrarAlteracao('item_edit', {
      descricao: item.descricao,
      de: { quantidade: item.quantidade, preco_unit: item.preco_unit },
      para: { quantidade: novaQtd, preco_unit: novoPreco },
    })
    await recalcularTotais()
    setSalvando(false)
    await carregar()
  }

  async function removerItem(item: VendaItem) {
    if (!confirm(`Remover "${item.descricao}" da venda?`)) return
    setSalvando(true)
    const { error: err } = await supabase.from('venda_itens').delete().eq('id', item.id)
    if (err) { alert(`Erro: ${err.message}`); setSalvando(false); return }
    await registrarAlteracao('item_remove', { descricao: item.descricao, quantidade: item.quantidade, preco_unit: item.preco_unit })
    await recalcularTotais()
    setSalvando(false)
    await carregar()
  }

  async function adicionarItem(descricao: string, preco: number, produto_id: string | null) {
    setSalvando(true)
    const { error: err } = await supabase.from('venda_itens').insert({
      venda_id: id, produto_id, descricao, quantidade: 1, preco_unit: preco,
    })
    if (err) { alert(`Erro: ${err.message}`); setSalvando(false); return }
    await registrarAlteracao('item_add', { descricao, quantidade: 1, preco_unit: preco })
    await recalcularTotais()
    setSalvando(false)
    setBuscaProduto(''); setResultadosProduto([]); setManualDesc(''); setManualPreco('')
    await carregar()
  }

  function onBuscaProdutoChange(v: string) {
    setBuscaProduto(v)
    if (buscaProdTimer.current) clearTimeout(buscaProdTimer.current)
    if (v.trim().length < 2) { setResultadosProduto([]); return }
    buscaProdTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('produtos')
        .select('id, nome, preco_venda, estoque_atual')
        .is('deleted_at', null).eq('ativo', true)
        .or(`nome.ilike.%${v.trim()}%,codigo_interno.ilike.%${v.trim()}%`)
        .limit(8)
      setResultadosProduto((data as ProdutoBusca[]) ?? [])
    }, 250)
  }

  function descreverAlteracao(a: Alteracao): string {
    const d = a.detalhes ?? {}
    if (a.acao === 'status') {
      const de = STATUS_VENDA[d.de]?.label ?? d.de
      const para = STATUS_VENDA[d.para]?.label ?? d.para
      return `mudou o status de "${de}" para "${para}"`
    }
    if (a.acao === 'item_add') return `adicionou ${d.quantidade}× "${d.descricao}" (${fmt(Number(d.preco_unit) || 0)})`
    if (a.acao === 'item_remove') return `removeu ${d.quantidade}× "${d.descricao}"`
    if (a.acao === 'item_edit') {
      const partes: string[] = []
      if (d.de?.quantidade !== d.para?.quantidade) partes.push(`qtd ${d.de?.quantidade} → ${d.para?.quantidade}`)
      if (d.de?.preco_unit !== d.para?.preco_unit) partes.push(`preço ${fmt(Number(d.de?.preco_unit) || 0)} → ${fmt(Number(d.para?.preco_unit) || 0)}`)
      return `alterou "${d.descricao}" (${partes.join(', ') || 'sem mudanças'})`
    }
    return a.acao
  }

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#64748b' }}>
        Carregando...
      </div>
    )
  }

  if (error || !venda) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#dc2626' }}>
        {error ?? 'Venda não encontrada.'}
      </div>
    )
  }

  const label = venda.numero ? `#${venda.numero}` : `#${venda.id.slice(0, 8)}`
  const st = STATUS_VENDA[venda.status] ?? { label: venda.status, bg: '#64748b', color: '#fff', icon: '•' }
  const dataFormatada = new Date(venda.created_at).toLocaleString('pt-BR')
  const customFields = venda.campos_extras?.custom ?? {}
  const camposComValor = campos.filter((c) => customFields[c.id])
  const editavel = venda.status === 'aberta'

  const btnStatus = (bg: string, border: string, color: string): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: salvando ? 'wait' : 'pointer', border: `1px solid ${border}`, background: bg, color,
  })

  return (
    <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#1e293b', maxWidth: 900, margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={() => router.push('/vendas')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6',
          fontSize: 14, padding: '4px 0', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ← Voltar ao histórico
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Venda {label}</h1>
        <span
          style={{
            background: st.bg, color: st.color, borderRadius: 20,
            padding: '4px 14px', fontSize: 13, fontWeight: 600,
          }}
        >
          {st.icon} {st.label}
        </span>
      </div>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>{dataFormatada}</p>

      {/* Ações de status */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {venda.status === 'finalizada' && (
          <>
            <button disabled={salvando} onClick={() => mudarStatus('aberta')} style={btnStatus('#fffbeb', '#fde68a', '#92400e')}>✏️ Reabrir para edição</button>
            <button disabled={salvando} onClick={() => mudarStatus('cancelada')} style={btnStatus('#fef2f2', '#fecaca', '#991b1b')}>❌ Cancelar venda</button>
          </>
        )}
        {venda.status === 'aberta' && (
          <>
            <button disabled={salvando} onClick={() => mudarStatus('finalizada')} style={btnStatus('#f0fdf4', '#86efac', '#166534')}>✅ Concretizar venda</button>
            <button disabled={salvando} onClick={() => mudarStatus('cancelada')} style={btnStatus('#fef2f2', '#fecaca', '#991b1b')}>❌ Cancelar venda</button>
          </>
        )}
        {venda.status === 'cancelada' && (
          <>
            <button disabled={salvando} onClick={() => mudarStatus('aberta')} style={btnStatus('#fffbeb', '#fde68a', '#92400e')}>↩️ Reativar (em andamento)</button>
            <button disabled={salvando} onClick={() => mudarStatus('finalizada')} style={btnStatus('#f0fdf4', '#86efac', '#166534')}>✅ Concretizar venda</button>
          </>
        )}
      </div>

      {editavel && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#92400e' }}>
          ✏️ <strong>Venda em andamento:</strong> os itens abaixo podem ser editados. O estoque e o caixa só serão afetados quando você <strong>concretizar</strong> a venda.
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Subtotal', value: fmt(venda.subtotal ?? 0) },
          { label: 'Desconto', value: fmt(venda.desconto ?? 0) },
          { label: 'Total', value: fmt(venda.total ?? 0) },
          { label: 'Forma de pagamento', value: venda.forma_pagamento ?? '—' },
        ].map((card) => (
          <div
            key={card.label}
            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}
          >
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {card.label}
            </p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Nota fiscal */}
      {(nfeAtivo || nota) && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🧾 Nota fiscal</h2>
              {nota ? (
                <span style={{
                  padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: nota.status === 'autorizada' ? '#dcfce7' : nota.status === 'processando' ? '#fef3c7' : '#fee2e2',
                  color: nota.status === 'autorizada' ? '#166534' : nota.status === 'processando' ? '#92400e' : '#991b1b',
                }}>
                  {nota.status === 'autorizada' ? `Autorizada${nota.numero ? ` · nº ${nota.numero}` : ''}` : nota.status === 'processando' ? 'Processando na SEFAZ' : nota.status === 'cancelada' ? 'Cancelada' : 'Erro na emissão'}
                </span>
              ) : (
                <span style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma nota emitida para esta venda</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {nota?.status === 'autorizada' && nota.url_danfe && (
                <a href={nota.url_danfe} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, background: '#f0fdf4', color: '#166534', fontWeight: 600, textDecoration: 'none' }}>Ver DANFE</a>
              )}
              {nota?.status === 'autorizada' && nota.url_xml && (
                <a href={nota.url_xml} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#374151', textDecoration: 'none' }}>XML</a>
              )}
              {nota?.status === 'processando' && (
                <button onClick={consultarNota} disabled={emitindo} style={{ padding: '8px 16px', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontWeight: 500 }}>
                  {emitindo ? 'Consultando...' : 'Consultar status'}
                </button>
              )}
              {nfeAtivo && venda.status === 'finalizada' && (!nota || nota.status === 'erro' || nota.status === 'cancelada') && (
                <button onClick={emitirNota} disabled={emitindo} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, fontSize: 13, background: emitindo ? '#93c5fd' : '#2563eb', color: '#fff', fontWeight: 600, cursor: emitindo ? 'wait' : 'pointer' }}>
                  {emitindo ? 'Emitindo...' : nota ? 'Emitir novamente' : 'Emitir NFC-e'}
                </button>
              )}
            </div>
          </div>
          {(nfeErro || nota?.mensagem_erro) && nota?.status !== 'autorizada' && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px' }}>
              {nfeErro ?? nota?.mensagem_erro}
            </p>
          )}
        </div>
      )}

      {/* Items table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 32, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Itens</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['#', 'Produto', 'Qtd', 'Preço unit.', 'Subtotal', ...(editavel ? [''] : [])].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b',
                      fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(venda.venda_itens ?? []).map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{idx + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{item.descricao}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {editavel ? (
                      <input
                        type="number" min={1}
                        value={itensEdit[item.id]?.quantidade ?? item.quantidade}
                        onChange={e => setItensEdit(prev => ({ ...prev, [item.id]: { ...prev[item.id], quantidade: e.target.value } }))}
                        onBlur={() => salvarItem(item)}
                        style={{ width: 64, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }}
                      />
                    ) : item.quantidade}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {editavel ? (
                      <input
                        value={itensEdit[item.id]?.preco_unit ?? item.preco_unit.toFixed(2)}
                        onChange={e => setItensEdit(prev => ({ ...prev, [item.id]: { ...prev[item.id], preco_unit: e.target.value } }))}
                        onBlur={() => salvarItem(item)}
                        style={{ width: 90, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }}
                      />
                    ) : fmt(item.preco_unit)}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{fmt(item.quantidade * item.preco_unit)}</td>
                  {editavel && (
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => removerItem(item)} disabled={salvando} style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#991b1b', fontSize: 12, cursor: 'pointer' }}>
                        🗑 Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(venda.venda_itens ?? []).length === 0 && (
                <tr><td colSpan={editavel ? 6 : 5} style={{ padding: '16px', color: '#94a3b8', textAlign: 'center' }}>Nenhum item nesta venda</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Adicionar itens (somente em andamento) */}
        {editavel && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>+ Adicionar item</p>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                value={buscaProduto}
                onChange={e => onBuscaProdutoChange(e.target.value)}
                placeholder="Buscar produto do estoque por nome ou código..."
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              />
              {resultadosProduto.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 20, maxHeight: 240, overflowY: 'auto' }}>
                  {resultadosProduto.map(p => (
                    <button
                      key={p.id}
                      onClick={() => adicionarItem(p.nome, p.preco_venda ?? 0, p.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
                    >
                      <span style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</span>
                      <span style={{ color: '#64748b', flexShrink: 0, marginLeft: 8 }}>
                        {fmt(p.preco_venda ?? 0)} · est: {p.estoque_atual ?? '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={manualDesc}
                onChange={e => setManualDesc(e.target.value)}
                placeholder="Ou item avulso: descrição..."
                style={{ flex: 2, minWidth: 180, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}
              />
              <input
                value={manualPreco}
                onChange={e => setManualPreco(e.target.value)}
                placeholder="Preço (R$)"
                style={{ width: 110, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}
              />
              <button
                onClick={() => {
                  const preco = parseFloat(manualPreco.replace(',', '.')) || 0
                  if (!manualDesc.trim() || preco <= 0) { alert('Preencha a descrição e um preço válido.'); return }
                  adicionarItem(manualDesc.trim(), preco, null)
                }}
                disabled={salvando}
                style={{ padding: '9px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#2563eb', color: '#fff', cursor: 'pointer' }}
              >
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Garantias de produtos vinculadas */}
      {garantias.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>🛡️ Garantias vinculadas a esta venda</h2>
          {garantias.map(g => {
            const credito = g.tipo === 'credito'
            return (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '10px 14px', marginBottom: 6, borderRadius: 9,
                background: credito ? '#eff6ff' : '#f0fdf4',
                border: `1px solid ${credito ? '#bfdbfe' : '#bbf7d0'}`,
              }}>
                <span style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, flexShrink: 0,
                  background: credito ? '#dbeafe' : '#d1fae5', color: credito ? '#1d4ed8' : '#065f46',
                }}>
                  {credito ? '💳 Crédito' : '🔄 Troca'}
                </span>
                <span style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                  <strong style={{ color: '#0f172a' }}>{g.quantidade}× {g.produto_nome}</strong>
                  <span style={{ color: '#64748b' }}> · {new Date(g.created_at).toLocaleDateString('pt-BR')}</span>
                  {g.cliente_nome && <span style={{ color: '#64748b' }}> · 👤 {g.cliente_nome}</span>}
                  {g.motivo && <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginTop: 2 }}>{g.motivo}</span>}
                </span>
                {credito && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>
                    {fmt(g.valor_credito ?? 0)}
                    <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, color: g.credito_status === 'pendente' ? '#d97706' : g.credito_status === 'utilizado' ? '#16a34a' : '#94a3b8' }}>
                      {g.credito_status === 'pendente' ? '⏳ pendente' : g.credito_status === 'utilizado' ? '✅ utilizado' : '✕ cancelado'}
                    </span>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Info section */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Informações</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operador</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{venda.perfis?.nome ?? '—'}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{dataFormatada}</p>
          </div>
          {venda.taxa_pagamento !== undefined && venda.taxa_pagamento > 0 && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taxa de pagamento</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{venda.taxa_pagamento}%</p>
            </div>
          )}
          {venda.observacoes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observações</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{venda.observacoes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Custom fields */}
      {camposComValor.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Campos personalizados</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {camposComValor.map((campo) => (
              <div key={campo.id}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{campo.nome}</p>
                <p style={{ margin: 0, fontWeight: 500 }}>{customFields[campo.id]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico de alterações */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>📜 Histórico de alterações</h2>
        {auditIndisponivel ? (
          <p style={{ margin: 0, fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
            A tabela de auditoria ainda não existe no banco. Rode o arquivo <code>supabase-migration-vendas-historico.sql</code> no SQL Editor do Supabase.
          </p>
        ) : alteracoes.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Nenhuma alteração registrada nesta venda.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {alteracoes.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < alteracoes.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0, minWidth: 118 }}>
                  {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ fontSize: 13, color: '#374151' }}>
                  <strong style={{ color: '#0f172a' }}>{a.usuario_nome ?? 'Sistema'}</strong> {descreverAlteracao(a)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
