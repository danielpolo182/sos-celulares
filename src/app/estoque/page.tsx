'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type EntradaHistorico = {
  id: string; produto_id: string; produto_nome?: string
  quantidade: number; custo_unit: number; data_compra: string; nota_fiscal: string | null; created_at: string
}

type Fornecedor = { id: string; nome: string; telefone: string | null; email: string | null; ativo: boolean }

type Produto = {
  id: string; nome: string; unidade: string; ativo: boolean; cadastro_rapido: boolean
  custo_unit: number; margem_pct: number; preco_venda: number
  modelos_compat: string[] | null
  codigo_interno: string | null; codigo_barras: string | null; descricao: string | null
  movimenta_estoque: boolean
  peso_g: number | null; altura_cm: number | null; largura_cm: number | null; comprimento_cm: number | null
  ncm: string | null; cest: string | null; origem: string | null
  csosn: string | null; cst: string | null; cfop: string | null; gtin: string | null
  habilitar_nf: boolean
  preco_atacado: number | null; qtd_min_atacado: number | null
  despesas_extras: number | null; despesas_acess: number | null; custo_final: number | null
  campos_extras: { fotos?: string[] } | null
}

type Entrada = {
  id: string; produto_id: string; quantidade: number
  custo_unit: number; custo_total: number; data_compra: string; created_at: string
}

const COMPLETO = (p: Produto) => (p.preco_venda ?? 0) > 0 && (p.custo_unit ?? 0) > 0

const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
      <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', background: value ? '#6366f1' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
      </div>
      {label}
    </label>
  )
}

export default function EstoquePage() {
  const supabase = createClient()
  const router = useRouter()

  const [aba, setAba] = useState<'produtos' | 'entradas' | 'fornecedores'>('produtos')
  const [entradasHistorico, setEntradasHistorico] = useState<EntradaHistorico[]>([])
  const [fornecedoresList, setFornecedoresList] = useState<Fornecedor[]>([])
  const [loadingEntradas, setLoadingEntradas] = useState(false)
  const [loadingFornecedores, setLoadingFornecedores] = useState(false)
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [produtoSel, setProdutoSel] = useState<Produto | null>(null)
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [showModalRapido, setShowModalRapido] = useState(false)
  const [showModalCompleto, setShowModalCompleto] = useState(false)
  const [showModalEntrada, setShowModalEntrada] = useState(false)

  // ── Form compartilhado (rápido + completo)
  const [fNome, setFNome] = useState('')
  const [fCodInterno, setFCodInterno] = useState('')
  const [fCodBarras, setFCodBarras] = useState('')
  const [fUnidade, setFUnidade] = useState('un')
  const [fCusto, setFCusto] = useState('0')
  const [fMargem, setFMargem] = useState('0')
  const [fPrecoVenda, setFPrecoVenda] = useState('0')
  const [fModelos, setFModelos] = useState('')
  const [fDescricao, setFDescricao] = useState('')
  const [fAtivo, setFAtivo] = useState(true)
  const [fMovEstoque, setFMovEstoque] = useState(true)
  const [fEditId, setFEditId] = useState<string | null>(null)
  const [fSaving, setFSaving] = useState(false)

  // ── Campos extras (só modal completo)
  const [fcTab, setFcTab] = useState<'ident' | 'valores' | 'fiscal' | 'dimensoes' | 'fotos'>('ident')
  const [fcPrecoAtacado, setFcPrecoAtacado] = useState('')
  const [fcQtdMinAtacado, setFcQtdMinAtacado] = useState('')
  const [fcDespExtras, setFcDespExtras] = useState('0')
  const [fcDespAcess, setFcDespAcess] = useState('0')
  const [fcNcm, setFcNcm] = useState('')
  const [fcCest, setFcCest] = useState('')
  const [fcOrigem, setFcOrigem] = useState('0')
  const [fcCsosn, setFcCsosn] = useState('')
  const [fcCst, setFcCst] = useState('')
  const [fcCfop, setFcCfop] = useState('')
  const [fcGtin, setFcGtin] = useState('')
  const [fcHabNf, setFcHabNf] = useState(false)
  const [fcPesoG, setFcPesoG] = useState('')
  const [fcAltura, setFcAltura] = useState('')
  const [fcLargura, setFcLargura] = useState('')
  const [fcComprimento, setFcComprimento] = useState('')
  const [fcFotos, setFcFotos] = useState<string[]>([])
  const [fcFotoInput, setFcFotoInput] = useState('')

  // ── Form entrada
  const [eQtd, setEQtd] = useState('1')
  const [eCusto, setECusto] = useState('')
  const [eData, setEData] = useState(new Date().toISOString().split('T')[0])
  const [eNF, setENF] = useState('')
  const [eSaving, setESaving] = useState(false)
  const [ultimoCusto, setUltimoCusto] = useState<number | null>(null)

  const fetchProdutos = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('produtos').select('*').is('deleted_at', null).order('nome')
    if (search) q = q.ilike('nome', `%${search}%`)
    const { data } = await q
    setProdutos((data ?? []) as Produto[])
    setLoading(false)
  }, [supabase, search])

  const fetchEntradas = useCallback(async (prodId: string) => {
    const { data } = await supabase.from('produto_entradas').select('*').eq('produto_id', prodId).order('data_compra', { ascending: false }).limit(20)
    setEntradas((data ?? []) as Entrada[])
    if (data && data.length > 0) setUltimoCusto(data[0].custo_unit)
    else setUltimoCusto(null)
  }, [supabase])

  useEffect(() => { fetchProdutos() }, [fetchProdutos])
  useEffect(() => { if (produtoSel) fetchEntradas(produtoSel.id) }, [produtoSel, fetchEntradas])

  function calcPreco(custo: number, margem: number) {
    if (margem >= 100 || custo <= 0) return 0
    return Math.round(custo / (1 - margem / 100) * 100) / 100
  }

  function inpReq(value: string | number | null | undefined): React.CSSProperties {
    const vazio = !value || String(value).trim() === '' || Number(value) === 0
    return { ...inp, background: vazio ? '#fef2f2' : '#f0fdf4', border: `1px solid ${vazio ? '#fecaca' : '#bbf7d0'}`, transition: 'background 0.2s, border 0.2s' }
  }

  function popularFormBase(p: Produto) {
    setFNome(p.nome); setFCodInterno(p.codigo_interno ?? ''); setFCodBarras(p.codigo_barras ?? '')
    setFUnidade(p.unidade ?? 'un'); setFCusto(String(p.custo_unit ?? 0))
    setFMargem(String(p.margem_pct ?? 0)); setFPrecoVenda(String(p.preco_venda ?? 0))
    setFModelos(p.modelos_compat?.join(', ') ?? ''); setFDescricao(p.descricao ?? '')
    setFAtivo(p.ativo ?? true); setFMovEstoque(p.movimenta_estoque ?? true)
    setFEditId(p.id)
  }

  function popularFormCompleto(p: Produto) {
    popularFormBase(p)
    setFcTab('ident')
    setFcPrecoAtacado(p.preco_atacado ? String(p.preco_atacado) : '')
    setFcQtdMinAtacado(p.qtd_min_atacado ? String(p.qtd_min_atacado) : '')
    setFcDespExtras(String(p.despesas_extras ?? 0))
    setFcDespAcess(String(p.despesas_acess ?? 0))
    setFcNcm(p.ncm ?? ''); setFcCest(p.cest ?? ''); setFcOrigem(p.origem ?? '0')
    setFcCsosn(p.csosn ?? ''); setFcCst(p.cst ?? ''); setFcCfop(p.cfop ?? ''); setFcGtin(p.gtin ?? '')
    setFcHabNf(p.habilitar_nf ?? false)
    setFcPesoG(p.peso_g ? String(p.peso_g) : ''); setFcAltura(p.altura_cm ? String(p.altura_cm) : '')
    setFcLargura(p.largura_cm ? String(p.largura_cm) : ''); setFcComprimento(p.comprimento_cm ? String(p.comprimento_cm) : '')
    setFcFotos(p.campos_extras?.fotos ?? []); setFcFotoInput('')
  }

  function resetBase() {
    setFNome(''); setFCodInterno(''); setFCodBarras(''); setFUnidade('un')
    setFCusto('0'); setFMargem('0'); setFPrecoVenda('0')
    setFModelos(''); setFDescricao(''); setFAtivo(true); setFMovEstoque(true); setFEditId(null)
  }

  function abrirNovo() { resetBase(); setShowModalRapido(true) }

  function abrirRapido(p: Produto) { popularFormBase(p); setShowModalRapido(true) }

  function abrirCompleto(p: Produto) { popularFormCompleto(p); setShowModalCompleto(true) }

  async function salvarRapido() {
    if (!fNome.trim()) return
    setFSaving(true)
    const payload = {
      nome: fNome.trim(), codigo_interno: fCodInterno || null, codigo_barras: fCodBarras || null,
      unidade: fUnidade, custo_unit: parseFloat(fCusto) || 0, margem_pct: parseFloat(fMargem) || 0,
      preco_venda: parseFloat(fPrecoVenda) || 0,
      modelos_compat: fModelos ? fModelos.split(',').map(s => s.trim()).filter(Boolean) : null,
      descricao: fDescricao || null, ativo: fAtivo, movimenta_estoque: fMovEstoque, cadastro_rapido: false,
    }
    if (fEditId) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', fEditId)
      if (error) { alert(`Erro: ${error.message}`); setFSaving(false); return }
    } else {
      const { error } = await supabase.from('produtos').insert(payload)
      if (error) { alert(`Erro: ${error.message}`); setFSaving(false); return }
    }
    setFSaving(false); setShowModalRapido(false); fetchProdutos()
  }

  async function salvarCompleto() {
    if (!fNome.trim()) return
    setFSaving(true)
    const payload = {
      nome: fNome.trim(), codigo_interno: fCodInterno || null, codigo_barras: fCodBarras || null,
      unidade: fUnidade, custo_unit: parseFloat(fCusto) || 0, margem_pct: parseFloat(fMargem) || 0,
      preco_venda: parseFloat(fPrecoVenda) || 0,
      modelos_compat: fModelos ? fModelos.split(',').map(s => s.trim()).filter(Boolean) : null,
      descricao: fDescricao || null, ativo: fAtivo, movimenta_estoque: fMovEstoque, cadastro_rapido: false,
      preco_atacado: parseFloat(fcPrecoAtacado) || null,
      qtd_min_atacado: parseInt(fcQtdMinAtacado) || null,
      despesas_extras: parseFloat(fcDespExtras) || 0,
      despesas_acess: parseFloat(fcDespAcess) || 0,
      ncm: fcNcm || null, cest: fcCest || null, origem: fcOrigem || null,
      csosn: fcCsosn || null, cst: fcCst || null, cfop: fcCfop || null, gtin: fcGtin || null,
      habilitar_nf: fcHabNf,
      peso_g: parseFloat(fcPesoG) || null,
      altura_cm: parseFloat(fcAltura) || null,
      largura_cm: parseFloat(fcLargura) || null,
      comprimento_cm: parseFloat(fcComprimento) || null,
      campos_extras: fcFotos.length > 0 ? { fotos: fcFotos } : null,
    }
    if (fEditId) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', fEditId)
      if (error) { alert(`Erro: ${error.message}`); setFSaving(false); return }
    } else {
      const { error } = await supabase.from('produtos').insert(payload)
      if (error) { alert(`Erro: ${error.message}`); setFSaving(false); return }
    }
    setFSaving(false); setShowModalCompleto(false); fetchProdutos()
  }

  function abrirEntrada(p: Produto) {
    setProdutoSel(p); setEQtd('1'); setECusto(''); setEData(new Date().toISOString().split('T')[0]); setENF('')
    fetchEntradas(p.id); setShowModalEntrada(true)
  }

  async function salvarEntrada() {
    if (!produtoSel || !eCusto) return
    setESaving(true)
    const { error } = await supabase.from('produto_entradas').insert({
      produto_id: produtoSel.id, quantidade: parseInt(eQtd) || 1,
      custo_unit: parseFloat(eCusto), data_compra: eData, nota_fiscal: eNF || null,
    })
    if (error) { alert(`Erro: ${error.message}`); setESaving(false); return }
    setESaving(false); setShowModalEntrada(false); fetchProdutos()
  }

  const fetchEntradasHistorico = useCallback(async () => {
    setLoadingEntradas(true)
    let q = supabase.from('produto_entradas').select('*, produtos(nome)').order('data_compra', { ascending: false }).limit(100)
    if (filtroDataInicio) q = q.gte('data_compra', filtroDataInicio)
    if (filtroDataFim) q = q.lte('data_compra', filtroDataFim)
    const { data } = await q
    setEntradasHistorico((data ?? []).map((e: any) => ({ ...e, produto_nome: e.produtos?.nome })) as EntradaHistorico[])
    setLoadingEntradas(false)
  }, [supabase, filtroDataInicio, filtroDataFim])

  const fetchFornecedoresList = useCallback(async () => {
    setLoadingFornecedores(true)
    const { data } = await supabase.from('fornecedores').select('id,nome,telefone,email,ativo').order('nome')
    setFornecedoresList((data ?? []) as Fornecedor[])
    setLoadingFornecedores(false)
  }, [supabase])

  useEffect(() => {
    if (aba === 'entradas') fetchEntradasHistorico()
    if (aba === 'fornecedores') fetchFornecedoresList()
  }, [aba, fetchEntradasHistorico, fetchFornecedoresList])

  // Separar incompletos e completos
  const incompletos = produtos.filter(p => !COMPLETO(p))
  const completos = produtos.filter(p => COMPLETO(p))

  // ── Linha da tabela de produtos
  function ProdutoRow({ p, showDivider }: { p: Produto; showDivider?: boolean }) {
    const custo = p.custo_unit ?? 0
    const preco = p.preco_venda ?? 0
    const margem = custo > 0 && preco > 0 ? ((preco - custo) / preco * 100).toFixed(0) : null
    const incompleto = !COMPLETO(p)
    return (
      <tr style={{ borderBottom: '1px solid #f1f5f9', background: showDivider ? '#fffbeb' : undefined }}
        onMouseEnter={e => { e.currentTarget.style.background = incompleto ? '#fef9ec' : '#f5f3ff' }}
        onMouseLeave={e => { e.currentTarget.style.background = showDivider ? '#fffbeb' : '#fff' }}>
        <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {incompleto && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', whiteSpace: 'nowrap' }}>
                ⚠ Incompleto
              </span>
            )}
            <span>{p.nome}</span>
          </div>
          {p.codigo_interno && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{p.codigo_interno}</div>}
          {p.modelos_compat && p.modelos_compat.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{p.modelos_compat.slice(0, 2).join(', ')}{p.modelos_compat.length > 2 ? ` +${p.modelos_compat.length - 2}` : ''}</div>
          )}
        </td>
        <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>{p.unidade ?? 'un'}</td>
        <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {custo > 0 ? `R$ ${custo.toFixed(2).replace('.', ',')}` : <span style={{ color: '#fbbf24' }}>—</span>}
        </td>
        <td style={{ padding: '10px 14px', fontWeight: 500, color: preco > 0 ? '#0f172a' : '#fbbf24', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {preco > 0 ? `R$ ${preco.toFixed(2).replace('.', ',')}` : '—'}
        </td>
        <td style={{ padding: '10px 14px' }}>
          {margem ? <span style={{ fontSize: 12, fontWeight: 600, color: parseInt(margem) >= 30 ? '#065f46' : parseInt(margem) >= 15 ? '#92400e' : '#991b1b' }}>{margem}%</span> : '—'}
        </td>
        <td style={{ padding: '10px 14px' }}>
          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: p.ativo ? '#ecfdf5' : '#f1f5f9', color: p.ativo ? '#065f46' : '#94a3b8' }}>
            {p.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={e => { e.stopPropagation(); abrirEntrada(p) }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e0e7ff', borderRadius: 6, background: '#eef2ff', color: '#4338ca', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>+ Entrada</button>
            <button onClick={e => { e.stopPropagation(); abrirRapido(p) }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>Editar rápido</button>
            <button onClick={e => { e.stopPropagation(); abrirCompleto(p) }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #c7d2fe', borderRadius: 6, background: '#eef2ff', color: '#4338ca', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}>Editar completo</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* Header + tabs */}
      <div style={{ padding: '16px 24px 0', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Produtos & Estoque</h1>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {produtos.length} produtos · {incompletos.length > 0 ? <span style={{ color: '#d97706' }}>{incompletos.length} incompletos</span> : 'todos completos'}
            </p>
          </div>
          {aba === 'produtos' && (
            <button onClick={abrirNovo} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Novo produto</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {([['produtos','📦 Produtos & Estoque'],['entradas','📥 Entradas'],['fornecedores','🏭 Fornecedores']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ padding: '9px 16px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#6366f1' : '#64748b', borderBottom: aba === k ? '2px solid #6366f1' : '2px solid transparent', whiteSpace: 'nowrap', marginBottom: -1 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── ABA PRODUTOS */}
      {aba === 'produtos' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, flexShrink: 0 }}>
            <input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1, background: '#f8fafc' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
            ) : produtos.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhum produto cadastrado</p>
                <button onClick={abrirNovo} style={{ marginTop: 16, padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ Cadastrar primeiro produto</button>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Produto', 'Unidade', 'Custo unit.', 'Preço venda', 'Margem', 'Status', 'Ações'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Seção incompletos */}
                  {incompletos.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={7} style={{ padding: '8px 14px', background: '#fffbeb', borderBottom: '1px solid #fde68a', borderTop: '1px solid #fde68a' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14 }}>⚠</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Cadastros incompletos — {incompletos.length} produto{incompletos.length > 1 ? 's' : ''} sem preço ou custo
                            </span>
                          </div>
                        </td>
                      </tr>
                      {incompletos.map(p => <ProdutoRow key={p.id} p={p} showDivider />)}
                      <tr>
                        <td colSpan={7} style={{ padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', borderTop: '2px solid #e2e8f0' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            ✓ Produtos completos — {completos.length}
                          </span>
                        </td>
                      </tr>
                    </>
                  )}
                  {/* Seção completos */}
                  {completos.map(p => <ProdutoRow key={p.id} p={p} />)}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── ABA ENTRADAS */}
      {aba === 'entradas' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={{ ...inp, width: 'auto' }} />
            <span style={{ alignSelf: 'center', color: '#94a3b8' }}>até</span>
            <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={{ ...inp, width: 'auto' }} />
            <button onClick={fetchEntradasHistorico} style={{ padding: '8px 14px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Filtrar</button>
          </div>
          {loadingEntradas ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
          ) : entradasHistorico.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 36, marginBottom: 12 }}>📥</div><p style={{ color: '#94a3b8' }}>Nenhuma entrada registrada</p></div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Data','Produto','Quantidade','Custo unit.','Total','NF / Ref.'].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {entradasHistorico.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 14px', color: '#64748b', fontSize: 12 }}>{new Date(e.data_compra + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 500, color: '#0f172a' }}>{e.produto_nome ?? e.produto_id}</td>
                      <td style={{ padding: '9px 14px', color: '#374151' }}>{e.quantidade} un</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12 }}>R$ {Number(e.custo_unit).toFixed(2).replace('.', ',')}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', fontSize: 12 }}>R$ {(e.quantidade * Number(e.custo_unit)).toFixed(2).replace('.', ',')}</td>
                      <td style={{ padding: '9px 14px', color: '#94a3b8', fontSize: 12 }}>{e.nota_fiscal ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ABA FORNECEDORES */}
      {aba === 'fornecedores' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loadingFornecedores ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
          ) : fornecedoresList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 36, marginBottom: 12 }}>🏭</div><p style={{ color: '#94a3b8' }}>Nenhum fornecedor cadastrado</p><button onClick={() => router.push('/fornecedores')} style={{ marginTop: 12, padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Gerenciar fornecedores</button></div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 13, color: '#64748b' }}>{fornecedoresList.length} fornecedores</p>
                <button onClick={() => router.push('/fornecedores')} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>Gerenciar completo →</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Fornecedor','Telefone','E-mail','Status'].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {fornecedoresList.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a' }}>{f.nome}</td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>{f.telefone ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>{f.email ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: f.ativo ? '#ecfdf5' : '#f1f5f9', color: f.ativo ? '#065f46' : '#94a3b8' }}>{f.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODAL EDITAR RÁPIDO ═══ */}
      {showModalRapido && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, marginBottom: 20 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: '16px 16px 0 0' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{fEditId ? '⚡ Editar rápido' : '📦 Novo produto'}</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Informações básicas · use "Editar completo" para todos os campos</p>
              </div>
              <button onClick={() => setShowModalRapido(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Nome do produto *</label>
                <input style={inpReq(fNome)} value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Ex: Display Samsung Galaxy A32 Incell" autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Código interno</label><input style={inp} value={fCodInterno} onChange={e => setFCodInterno(e.target.value)} placeholder="PRD-001" /></div>
                <div><label style={lbl}>Unidade</label>
                  <select style={inp} value={fUnidade} onChange={e => setFUnidade(e.target.value)}>
                    {['un','kg','g','m','cm','l','ml','cx','pc','par'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Custo (R$)</label>
                  <input style={inp} type="number" step="0.01" min="0" value={fCusto} onChange={e => {
                    setFCusto(e.target.value)
                    const c = parseFloat(e.target.value) || 0; const m = parseFloat(fMargem) || 0
                    if (m > 0 && c > 0) setFPrecoVenda(String(calcPreco(c, m)))
                  }} />
                </div>
                <div>
                  <label style={lbl}>Margem (%)</label>
                  <input style={inp} type="number" step="0.1" min="0" max="99" value={fMargem} onChange={e => {
                    setFMargem(e.target.value)
                    const c = parseFloat(fCusto) || 0; const m = parseFloat(e.target.value) || 0
                    if (c > 0) setFPrecoVenda(String(calcPreco(c, m)))
                  }} />
                </div>
                <div>
                  <label style={lbl}>Preço venda (R$) *</label>
                  <input style={inpReq(parseFloat(fPrecoVenda))} type="number" step="0.01" min="0" value={fPrecoVenda} onChange={e => {
                    setFPrecoVenda(e.target.value)
                    const c = parseFloat(fCusto) || 0; const p = parseFloat(e.target.value) || 0
                    if (c > 0 && p > c) setFMargem(String(Math.round((1 - c / p) * 10000) / 100))
                  }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Modelos compatíveis</label>
                <input style={inp} value={fModelos} onChange={e => setFModelos(e.target.value)} placeholder="Samsung A32, iPhone 13..." />
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <Toggle value={fAtivo} onChange={setFAtivo} label="Produto ativo" />
                <Toggle value={fMovEstoque} onChange={setFMovEstoque} label="Movimenta estoque" />
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
              <button onClick={() => setShowModalRapido(false)} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarRapido} disabled={fSaving || !fNome.trim()}
                style={{ padding: '9px 22px', background: fSaving || !fNome.trim() ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: fSaving || !fNome.trim() ? 'not-allowed' : 'pointer' }}>
                {fSaving ? 'Salvando...' : '✓ Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL EDITAR COMPLETO ═══ */}
      {showModalCompleto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, marginBottom: 20 }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: '16px 16px 0 0', position: 'sticky', top: 0, zIndex: 1 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>📋 Cadastro completo</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{fNome || 'Novo produto'}</p>
              </div>
              <button onClick={() => setShowModalCompleto(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>

            {/* Tabs do modal */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', padding: '0 24px', background: '#fafafa' }}>
              {([
                ['ident', '📝 Identificação'],
                ['valores', '💰 Valores'],
                ['fiscal', '🧾 Fiscal'],
                ['dimensoes', '📐 Dimensões'],
                ['fotos', `🖼 Fotos${fcFotos.length > 0 ? ` (${fcFotos.length})` : ''}`],
              ] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFcTab(k)} style={{
                  padding: '10px 14px', fontSize: 12, fontWeight: fcTab === k ? 600 : 400,
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: fcTab === k ? '#6366f1' : '#64748b',
                  borderBottom: fcTab === k ? '2px solid #6366f1' : '2px solid transparent',
                  marginBottom: -1, whiteSpace: 'nowrap',
                }}>{l}</button>
              ))}
            </div>

            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── TAB: IDENTIFICAÇÃO */}
              {fcTab === 'ident' && (
                <>
                  <div>
                    <label style={lbl}>Nome do produto *</label>
                    <input style={inpReq(fNome)} value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Ex: Display Samsung Galaxy A32 Incell" autoFocus />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Código interno</label><input style={inp} value={fCodInterno} onChange={e => setFCodInterno(e.target.value)} placeholder="PRD-001" /></div>
                    <div><label style={lbl}>Código de barras</label><input style={inp} value={fCodBarras} onChange={e => setFCodBarras(e.target.value)} /></div>
                    <div><label style={lbl}>Unidade</label>
                      <select style={inp} value={fUnidade} onChange={e => setFUnidade(e.target.value)}>
                        {['un','kg','g','m','cm','l','ml','cx','pc','par'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Modelos compatíveis (separados por vírgula)</label>
                    <input style={inp} value={fModelos} onChange={e => setFModelos(e.target.value)} placeholder="Samsung Galaxy A32, Apple iPhone 13..." />
                  </div>
                  <div>
                    <label style={lbl}>Descrição</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={fDescricao} onChange={e => setFDescricao(e.target.value)} placeholder="Detalhes técnicos, características..." />
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <Toggle value={fAtivo} onChange={setFAtivo} label="Produto ativo" />
                    <Toggle value={fMovEstoque} onChange={setFMovEstoque} label="Movimenta estoque" />
                    <Toggle value={fcHabNf} onChange={setFcHabNf} label="Habilitar NF-e" />
                  </div>
                </>
              )}

              {/* ── TAB: VALORES */}
              {fcTab === 'valores' && (
                <>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Preço de custo</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div><label style={lbl}>Custo unitário (R$)</label>
                        <input style={inp} type="number" step="0.01" min="0" value={fCusto} onChange={e => {
                          setFCusto(e.target.value)
                          const c = parseFloat(e.target.value) || 0; const m = parseFloat(fMargem) || 0
                          if (m > 0 && c > 0) setFPrecoVenda(String(calcPreco(c, m)))
                        }} />
                      </div>
                      <div><label style={lbl}>Despesas extras (R$)</label><input style={inp} type="number" step="0.01" min="0" value={fcDespExtras} onChange={e => setFcDespExtras(e.target.value)} /></div>
                      <div><label style={lbl}>Despesas acessórias (R$)</label><input style={inp} type="number" step="0.01" min="0" value={fcDespAcess} onChange={e => setFcDespAcess(e.target.value)} /></div>
                    </div>
                    {(parseFloat(fcDespExtras) > 0 || parseFloat(fcDespAcess) > 0) && (
                      <div style={{ marginTop: 8, padding: '8px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#374151' }}>
                        Custo final estimado: <strong>R$ {(parseFloat(fCusto || '0') + parseFloat(fcDespExtras || '0') + parseFloat(fcDespAcess || '0')).toFixed(2).replace('.', ',')}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Preço de venda</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
                      <div><label style={lbl}>Margem de lucro (%)</label>
                        <input style={inp} type="number" step="0.1" min="0" max="99" value={fMargem} onChange={e => {
                          setFMargem(e.target.value)
                          const c = parseFloat(fCusto) || 0; const m = parseFloat(e.target.value) || 0
                          if (c > 0) setFPrecoVenda(String(calcPreco(c, m)))
                        }} />
                      </div>
                      <div><label style={lbl}>Preço de venda (R$) *</label>
                        <input style={inpReq(parseFloat(fPrecoVenda))} type="number" step="0.01" min="0" value={fPrecoVenda} onChange={e => {
                          setFPrecoVenda(e.target.value)
                          const c = parseFloat(fCusto) || 0; const p = parseFloat(e.target.value) || 0
                          if (c > 0 && p > c) setFMargem(String(Math.round((1 - c / p) * 10000) / 100))
                        }} />
                      </div>
                    </div>
                    {parseFloat(fCusto) > 0 && parseFloat(fPrecoVenda) > 0 && (
                      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 20, fontSize: 12 }}>
                        <div><span style={{ color: '#64748b' }}>Lucro: </span><strong style={{ color: '#3730a3' }}>R$ {(parseFloat(fPrecoVenda) - parseFloat(fCusto)).toFixed(2).replace('.', ',')}</strong></div>
                        <div><span style={{ color: '#64748b' }}>Margem: </span><strong style={{ color: '#3730a3' }}>{fMargem}%</strong></div>
                        <div><span style={{ color: '#64748b' }}>Markup: </span><strong style={{ color: '#3730a3' }}>{parseFloat(fCusto) > 0 ? ((parseFloat(fPrecoVenda) / parseFloat(fCusto) * 100) - 100).toFixed(1) : '—'}%</strong></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Preço atacado</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={lbl}>Preço atacado (R$)</label><input style={inp} type="number" step="0.01" min="0" value={fcPrecoAtacado} onChange={e => setFcPrecoAtacado(e.target.value)} placeholder="Opcional" /></div>
                      <div><label style={lbl}>Qtd. mínima atacado</label><input style={inp} type="number" min="1" value={fcQtdMinAtacado} onChange={e => setFcQtdMinAtacado(e.target.value)} placeholder="Ex: 5" /></div>
                    </div>
                  </div>
                </>
              )}

              {/* ── TAB: FISCAL */}
              {fcTab === 'fiscal' && (
                <>
                  <div style={{ background: fcHabNf ? '#f0fdf4' : '#f8fafc', border: `1px solid ${fcHabNf ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 4 }}>
                    <Toggle value={fcHabNf} onChange={setFcHabNf} label="Habilitar emissão de NF-e para este produto" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>NCM</label><input style={inp} value={fcNcm} onChange={e => setFcNcm(e.target.value)} placeholder="0000.00.00" /></div>
                    <div><label style={lbl}>CEST</label><input style={inp} value={fcCest} onChange={e => setFcCest(e.target.value)} placeholder="00.000.00" /></div>
                    <div><label style={lbl}>GTIN / EAN</label><input style={inp} value={fcGtin} onChange={e => setFcGtin(e.target.value)} placeholder="SEM GTIN" /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Origem</label>
                      <select style={inp} value={fcOrigem} onChange={e => setFcOrigem(e.target.value)}>
                        <option value="0">0 – Nacional</option>
                        <option value="1">1 – Estrangeira (importação direta)</option>
                        <option value="2">2 – Estrangeira (adquirida no mercado interno)</option>
                        <option value="3">3 – Nacional, conteúdo importação {'>'} 40%</option>
                        <option value="4">4 – Nacional, processos produtivos básicos</option>
                        <option value="5">5 – Nacional, conteúdo importação {'<='} 40%</option>
                        <option value="6">6 – Estrangeira, importação direta, sem similar nacional</option>
                        <option value="7">7 – Estrangeira, mercado interno, sem similar nacional</option>
                        <option value="8">8 – Nacional, conteúdo importação {'>'} 70%</option>
                      </select>
                    </div>
                    <div><label style={lbl}>CFOP</label><input style={inp} value={fcCfop} onChange={e => setFcCfop(e.target.value)} placeholder="5102" /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>CSOSN (Simples Nacional)</label><input style={inp} value={fcCsosn} onChange={e => setFcCsosn(e.target.value)} placeholder="400" /></div>
                    <div><label style={lbl}>CST (Regime Normal)</label><input style={inp} value={fcCst} onChange={e => setFcCst(e.target.value)} placeholder="00" /></div>
                  </div>
                </>
              )}

              {/* ── TAB: DIMENSÕES */}
              {fcTab === 'dimensoes' && (
                <>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Peso</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={lbl}>Peso bruto (g)</label><input style={inp} type="number" step="0.1" min="0" value={fcPesoG} onChange={e => setFcPesoG(e.target.value)} placeholder="Ex: 150" /></div>
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Medidas (cm)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div><label style={lbl}>Altura (cm)</label><input style={inp} type="number" step="0.1" min="0" value={fcAltura} onChange={e => setFcAltura(e.target.value)} placeholder="0,0" /></div>
                      <div><label style={lbl}>Largura (cm)</label><input style={inp} type="number" step="0.1" min="0" value={fcLargura} onChange={e => setFcLargura(e.target.value)} placeholder="0,0" /></div>
                      <div><label style={lbl}>Comprimento (cm)</label><input style={inp} type="number" step="0.1" min="0" value={fcComprimento} onChange={e => setFcComprimento(e.target.value)} placeholder="0,0" /></div>
                    </div>
                  </div>
                  {(fcPesoG || fcAltura || fcLargura || fcComprimento) && (
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#0369a1' }}>
                      📦 Caixa: {fcAltura || '?'} × {fcLargura || '?'} × {fcComprimento || '?'} cm · Peso: {fcPesoG || '?'} g
                    </div>
                  )}
                </>
              )}

              {/* ── TAB: FOTOS */}
              {fcTab === 'fotos' && (
                <>
                  <div>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      Adicione URLs de imagens do produto (hospedadas no Supabase Storage, Imgur, ou qualquer CDN).
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <input style={{ ...inp, flex: 1 }} value={fcFotoInput} onChange={e => setFcFotoInput(e.target.value)} placeholder="https://..." onKeyDown={e => {
                        if (e.key === 'Enter' && fcFotoInput.trim()) {
                          setFcFotos(prev => [...prev, fcFotoInput.trim()]); setFcFotoInput('')
                        }
                      }} />
                      <button onClick={() => { if (fcFotoInput.trim()) { setFcFotos(prev => [...prev, fcFotoInput.trim()]); setFcFotoInput('') } }}
                        style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        + Adicionar
                      </button>
                    </div>
                  </div>
                  {fcFotos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>🖼</div>
                      <p style={{ fontSize: 13 }}>Nenhuma foto adicionada</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                      {fcFotos.map((url, i) => (
                        <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', aspectRatio: '1' }}>
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          <button onClick={() => setFcFotos(prev => prev.filter((_, j) => j !== i))}
                            style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(15,23,42,0.7)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                            ×
                          </button>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 6px', background: 'rgba(0,0,0,0.5)', fontSize: 9, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.split('/').pop()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'space-between', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
                {(['ident','valores','fiscal','dimensoes','fotos'] as const).map((t, i) => (
                  <span key={t} onClick={() => setFcTab(t)} style={{ cursor: 'pointer', marginRight: 4, fontSize: 14, color: fcTab === t ? '#6366f1' : '#d1d5db' }}>●</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowModalCompleto(false)} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                <button onClick={salvarCompleto} disabled={fSaving || !fNome.trim()}
                  style={{ padding: '9px 22px', background: fSaving || !fNome.trim() ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: fSaving || !fNome.trim() ? 'not-allowed' : 'pointer' }}>
                  {fSaving ? 'Salvando...' : '✓ Salvar cadastro completo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL ENTRADA DE CUSTO ═══ */}
      {showModalEntrada && produtoSel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Registrar entrada de custo</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{produtoSel.nome}</p>
              </div>
              <button onClick={() => setShowModalEntrada(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {(produtoSel.custo_unit ?? 0) > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Custo unitário atual</p>
                    <p style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>R$ {(produtoSel.custo_unit ?? 0).toFixed(2).replace('.', ',')}</p>
                  </div>
                  {ultimoCusto && (
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Última compra</p>
                      <p style={{ fontSize: 16, fontWeight: 500, color: '#374151', fontFamily: 'var(--font-mono)' }}>R$ {ultimoCusto.toFixed(2).replace('.', ',')}</p>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div><label style={lbl}>Quantidade comprada</label><input style={inp} type="number" value={eQtd} onChange={e => setEQtd(e.target.value)} min="1" /></div>
                <div><label style={lbl}>Data da compra</label><input style={inp} type="date" value={eData} onChange={e => setEData(e.target.value)} /></div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>Custo unitário pago (R$){ultimoCusto && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>último: R$ {ultimoCusto.toFixed(2).replace('.', ',')}</span>}</label>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inp, paddingLeft: 28, fontSize: 15, fontWeight: 500 }} type="number" step="0.01" value={eCusto} onChange={e => setECusto(e.target.value)} placeholder={ultimoCusto ? ultimoCusto.toFixed(2) : '0,00'} />
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94a3b8' }}>R$</span>
                  </div>
                  {ultimoCusto && eCusto && parseFloat(eCusto) !== ultimoCusto && (
                    <p style={{ fontSize: 11, marginTop: 4, color: parseFloat(eCusto) > ultimoCusto ? '#991b1b' : '#065f46' }}>
                      {parseFloat(eCusto) > ultimoCusto ? `▲ ${((parseFloat(eCusto) - ultimoCusto) / ultimoCusto * 100).toFixed(1)}% mais caro` : `▼ ${((ultimoCusto - parseFloat(eCusto)) / ultimoCusto * 100).toFixed(1)}% mais barato`} que a última compra
                    </p>
                  )}
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>Nota fiscal / referência (opcional)</label>
                  <input style={inp} value={eNF} onChange={e => setENF(e.target.value)} placeholder="NF-e, número do pedido..." />
                </div>
              </div>
              {eCusto && parseFloat(eCusto) > 0 && (
                <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: '#4338ca', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resumo da entrada</p>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div><p style={{ fontSize: 11, color: '#64748b' }}>Qtd.</p><p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{parseInt(eQtd) || 1} un</p></div>
                    <div><p style={{ fontSize: 11, color: '#64748b' }}>Custo total</p><p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>R$ {((parseInt(eQtd) || 1) * parseFloat(eCusto)).toFixed(2).replace('.', ',')}</p></div>
                    <div><p style={{ fontSize: 11, color: '#64748b' }}>Margem estimada</p><p style={{ fontSize: 15, fontWeight: 600, color: produtoSel.preco_venda > parseFloat(eCusto) ? '#065f46' : '#991b1b' }}>
                      {produtoSel.preco_venda > 0 ? `${((produtoSel.preco_venda - parseFloat(eCusto)) / produtoSel.preco_venda * 100).toFixed(0)}%` : '—'}
                    </p></div>
                  </div>
                </div>
              )}
              {entradas.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Histórico de compras</p>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    {entradas.map((e, i) => (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: i < entradas.length - 1 ? '1px solid #f1f5f9' : 'none', background: i === 0 ? '#f8f7ff' : '#fff' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {i === 0 && <span style={{ fontSize: 10, fontWeight: 500, background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: 10 }}>última</span>}
                          <span style={{ fontSize: 12, color: '#64748b' }}>{new Date(e.data_compra + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          <span style={{ fontSize: 12, color: '#374151' }}>{e.quantidade} un</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>R$ {e.custo_unit.toFixed(2).replace('.', ',')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModalEntrada(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarEntrada} disabled={eSaving || !eCusto} style={{ padding: '8px 18px', background: eSaving || !eCusto ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: eSaving || !eCusto ? 'not-allowed' : 'pointer' }}>
                {eSaving ? 'Registrando...' : 'Registrar entrada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
