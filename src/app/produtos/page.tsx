'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'

type Produto = {
  id: string; nome: string; codigo_interno: string | null; codigo_barras: string | null
  grupo_id: string | null; qualidade_id: string | null; unidade: string
  movimenta_estoque: boolean; habilitar_nf: boolean; ativo: boolean; cadastro_rapido: boolean
  descricao: string | null; peso_g: number | null; altura_cm: number | null
  largura_cm: number | null; comprimento_cm: number | null; campos_extras: Record<string, string>
  custo_unit: number; despesas_extras: number; despesas_acess: number; custo_final: number
  margem_pct: number; preco_venda: number; preco_atacado: number | null; qtd_min_atacado: number
  ncm: string | null; cest: string | null; origem: string; csosn: string | null
  cst: string | null; cfop: string | null; gtin: string | null
  modelos_compat: string[] | null; created_at: string
}

type Grupo    = { id: string; nome: string }
type Qualidade= { id: string; nome: string; cor_hex: string }
type Fornecedor={ id: string; nome: string }
type Estoque  = { produto_id: string; qtd_atual: number; qtd_minima: number; qtd_maxima: number | null; custo_medio: number }

const UNIDADES = ['un','kg','g','m','cm','l','ml','cx','pc','par']
const ORIGENS  = [['0','Nacional'],['1','Estrangeira — importação direta'],['2','Estrangeira — adquirida no mercado interno']]

const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
const sec: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function ProdutosPage() {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [qualidades, setQualidades] = useState<Qualidade[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [estoques, setEstoques] = useState<Record<string, Estoque>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [showCadastro, setShowCadastro] = useState(false)
  const [showRapido, setShowRapido] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [abaForm, setAbaForm] = useState<'dados'|'detalhes'|'valores'|'estoque'|'fotos'|'fiscal'|'fornecedores'|'filiais'>('dados')

  // Form
  const [f, setF] = useState<Partial<Produto>>({ unidade: 'un', movimenta_estoque: true, habilitar_nf: false, ativo: true, origem: '0', custo_unit: 0, despesas_extras: 0, despesas_acess: 0, margem_pct: 0, preco_venda: 0, qtd_min_atacado: 1, campos_extras: {} })
  const [fModelos, setFModelos] = useState('')
  const [fFornIds, setFFornIds] = useState<string[]>([])
  const [qtdMin, setQtdMin] = useState('0')
  const [qtdMax, setQtdMax] = useState('')
  const [camposExtras, setCamposExtras] = useState<{chave: string; valor: string}[]>([])
  const [fotos, setFotos] = useState<{url: string; file?: File}[]>([])
  const dragRef = useRef<HTMLDivElement>(null)

  // Form rápido
  const [rNome, setRNome] = useState('')
  const [rQtd, setRQtd] = useState('0')
  const [rCusto, setRCusto] = useState('')
  const [rPreco, setRPreco] = useState('')
  const [rForn, setRForn] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: g }, { data: q }, { data: forn }, { data: est }] = await Promise.all([
      supabase.from('produtos').select('*').is('deleted_at', null).order('nome'),
      supabase.from('produto_grupos').select('*').eq('ativo', true).order('nome'),
      supabase.from('produto_qualidades').select('*').eq('ativo', true).order('ordem'),
      supabase.from('fornecedores').select('id,nome').eq('ativo', true).order('nome'),
      supabase.from('estoque').select('*'),
    ])
    setProdutos((p ?? []) as Produto[])
    setGrupos((g ?? []) as Grupo[])
    setQualidades((q ?? []) as Qualidade[])
    setFornecedores((forn ?? []) as Fornecedor[])
    const estMap: Record<string, Estoque> = {}
    ;(est ?? []).forEach((e: any) => { estMap[e.produto_id] = e })
    setEstoques(estMap)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  function abrirNovo() {
    setF({ unidade: 'un', movimenta_estoque: true, habilitar_nf: false, ativo: true, origem: '0', custo_unit: 0, despesas_extras: 0, despesas_acess: 0, margem_pct: 0, preco_venda: 0, qtd_min_atacado: 1, campos_extras: {} })
    setFModelos(''); setFFornIds([]); setQtdMin('0'); setQtdMax(''); setCamposExtras([]); setFotos([])
    setEditId(null); setAbaForm('dados'); setShowCadastro(true)
  }

  function abrirEdit(p: Produto) {
    setF(p); setFModelos(p.modelos_compat?.join(', ') ?? '')
    setEditId(p.id); setAbaForm('dados'); setShowCadastro(true)
    const est = estoques[p.id]
    if (est) { setQtdMin(String(est.qtd_minima)); setQtdMax(est.qtd_maxima ? String(est.qtd_maxima) : '') }
    if (p.campos_extras) setCamposExtras(Object.entries(p.campos_extras).map(([chave, valor]) => ({ chave, valor: valor as string })))
  }

  // Cálculo automático de preço por margem
  function calcPreco(custo: number, margem: number) {
    if (margem >= 100 || custo <= 0) return 0
    return Math.round(custo / (1 - margem / 100) * 100) / 100
  }

  function onFChange(field: string, value: any) {
    setF(prev => {
      const novo = { ...prev, [field]: value }
      const custo = Number(novo.custo_unit ?? 0) + Number(novo.despesas_extras ?? 0) + Number(novo.despesas_acess ?? 0)
      if (field === 'margem_pct' && custo > 0) novo.preco_venda = calcPreco(custo, Number(value))
      if ((field === 'custo_unit' || field === 'despesas_extras' || field === 'despesas_acess') && Number(novo.margem_pct ?? 0) > 0) {
        novo.preco_venda = calcPreco(custo, Number(novo.margem_pct))
      }
      if (field === 'preco_venda' && custo > 0) {
        novo.margem_pct = Math.round((1 - custo / Number(value)) * 10000) / 100
      }
      return novo
    })
  }

  async function salvar() {
    if (!f.nome?.trim()) return
    setSaving(true)
    const payload = {
      ...f,
      modelos_compat: fModelos ? fModelos.split(',').map(s => s.trim()).filter(Boolean) : null,
      campos_extras: camposExtras.reduce((acc, {chave, valor}) => { if (chave) acc[chave] = valor; return acc }, {} as Record<string, string>),
    }
    // Ao salvar produto pendente, marca como completo
    if (editId) (payload as any).cadastro_rapido = false

    let prodId = editId
    if (editId) {
      await supabase.from('produtos').update(payload).eq('id', editId)
    } else {
      const { data } = await supabase.from('produtos').insert(payload).select('id').single()
      prodId = data?.id ?? null
    }
    // Estoque
    if (prodId && f.movimenta_estoque) {
      await supabase.from('estoque').upsert({ produto_id: prodId, qtd_minima: parseFloat(qtdMin) || 0, qtd_maxima: qtdMax ? parseFloat(qtdMax) : null }, { onConflict: 'produto_id,filial_id' })
    }
    // Fornecedores
    if (prodId && fFornIds.length > 0) {
      await supabase.from('produto_fornecedores').delete().eq('produto_id', prodId)
      await supabase.from('produto_fornecedores').insert(fFornIds.map((id, i) => ({ produto_id: prodId, fornecedor_id: id, preferencial: i === 0 })))
    }
    setSaving(false); setShowCadastro(false); fetchAll()
  }

  async function salvarRapido() {
    if (!rNome.trim()) return
    setSaving(true)
    const { data } = await supabase.from('produtos').insert({
      nome: rNome.trim(), custo_unit: parseFloat(rCusto) || 0,
      preco_venda: parseFloat(rPreco) || 0, ativo: true,
      movimenta_estoque: true, cadastro_rapido: true,
      unidade: 'un', origem: '0',
    }).select('id').single()
    if (data?.id) {
      if (parseFloat(rQtd) > 0) {
        await supabase.from('estoque_movimentos').insert({ produto_id: data.id, tipo: 'entrada', quantidade: parseFloat(rQtd), custo_unit: parseFloat(rCusto) || 0 })
      }
      if (rForn) {
        await supabase.from('produto_fornecedores').insert({ produto_id: data.id, fornecedor_id: rForn, preferencial: true })
      }
    }
    setSaving(false); setShowRapido(false); setRNome(''); setRQtd('0'); setRCusto(''); setRPreco(''); setRForn('')
    fetchAll()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este produto?')) return
    await supabase.from('produtos').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    fetchAll()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    setFotos(prev => [...prev, ...files.map(file => ({ url: URL.createObjectURL(file), file }))])
  }

  const produtosFiltrados = produtos.filter(p => {
    if (search && !p.nome.toLowerCase().includes(search.toLowerCase()) && !p.codigo_interno?.includes(search)) return false
    if (filtroGrupo && p.grupo_id !== filtroGrupo) return false
    return true
  })

  const custoFinal = (Number(f.custo_unit ?? 0) + Number(f.despesas_extras ?? 0) + Number(f.despesas_acess ?? 0))

  // Feedback de campos obrigatórios
  function inpReqStyle(value: string | number | null | undefined): React.CSSProperties {
    const vazio = !value || String(value).trim() === '' || Number(value) === 0
    return { ...inp, background: vazio ? '#fef2f2' : '#f0fdf4', border: `1px solid ${vazio ? '#fecaca' : '#bbf7d0'}`, transition: 'background 0.2s, border 0.2s' }
  }

  // Indicadores de aba com erro
  const abaDadosErro = !f.nome?.trim()
  const abaValoresErro = !f.preco_venda || Number(f.preco_venda) === 0

  function numKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','.', ',','-']
    if (!e.key.match(/^\d$/) && !allowed.includes(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault()
  }

  const ABAS_FORM: [typeof abaForm, string][] = [
    ['dados','Dados'], ['detalhes','Detalhes'], ['valores','Valores'],
    ['estoque','Estoque'], ['fotos','Fotos'], ['fiscal','Fiscal'],
    ['fornecedores','Fornecedores'], ['filiais','Filiais'],
  ]

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Produtos</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{produtos.length} cadastrados · {produtos.filter(p => p.cadastro_rapido).length} pendentes de completar</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowRapido(true)} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#374151' }}>
            ⚡ Cadastro rápido
          </button>
          <button onClick={abrirNovo} style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Novo produto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por nome ou código..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inp, flex: 1, minWidth: 200, background: '#f8fafc' }} />
        <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">Todos os grupos</option>
          {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
        <button style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', cursor: 'pointer', color: '#374151' }}>
          ⬆ Importar CSV
        </button>
      </div>

      {/* Alerta cadastro rápido */}
      {produtos.filter(p => p.cadastro_rapido).length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <span><strong>{produtos.filter(p => p.cadastro_rapido).length} produto(s)</strong> foram criados via cadastro rápido e precisam de informações complementares. Aparecerão no Fechamento do Dia.</span>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div>
      ) : produtosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhum produto encontrado</p>
          <button onClick={abrirNovo} style={{ marginTop: 16, padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ Cadastrar primeiro produto</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Produto','Código','Grupo','Qualidade','Custo final','Preço venda','Margem','Estoque','Status',''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => {
                const est = estoques[p.id]
                const q = qualidades.find(q => q.id === p.qualidade_id)
                const g = grupos.find(g => g.id === p.grupo_id)
                const baixoEstoque = est && est.qtd_minima > 0 && est.qtd_atual <= est.qtd_minima
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fafafa' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <p style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</p>
                      {p.cadastro_rapido && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 10, fontWeight: 500 }}>⚠ incompleto</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{p.codigo_interno ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>{g?.nome ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {q ? <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: q.cor_hex + '20', color: q.cor_hex }}>{q.nome}</span> : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'monospace', fontSize: 12 }}>
                      {p.custo_final > 0 ? `R$ ${p.custo_final.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a', fontFamily: 'monospace', fontSize: 12 }}>
                      R$ {p.preco_venda.toFixed(2).replace('.', ',')}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {p.margem_pct > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: p.margem_pct >= 30 ? '#065f46' : p.margem_pct >= 15 ? '#92400e' : '#991b1b' }}>
                          {p.margem_pct.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {est ? (
                        <span style={{ fontSize: 12, fontWeight: 500, color: baixoEstoque ? '#991b1b' : '#065f46' }}>
                          {baixoEstoque ? '⚠ ' : ''}{est.qtd_atual}
                        </span>
                      ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: p.ativo ? '#ecfdf5' : '#f1f5f9', color: p.ativo ? '#065f46' : '#94a3b8' }}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrirEdit(p)} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>Editar</button>
                        <button onClick={() => excluir(p.id)} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#ef4444' }}>✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ MODAL CADASTRO RÁPIDO ═══ */}
      {showRapido && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>⚡ Cadastro rápido</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Informações mínimas — complementar no fechamento do dia</p>
              </div>
              <button onClick={() => setShowRapido(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={lbl}>Nome do produto *</label><input style={inp} value={rNome} onChange={e => setRNome(e.target.value)} placeholder="Ex: Display Samsung A32" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Quantidade inicial</label><input style={inp} type="number" value={rQtd} onChange={e => setRQtd(e.target.value)} /></div>
                <div><label style={lbl}>Fornecedor</label>
                  <select style={inp} value={rForn} onChange={e => setRForn(e.target.value)}>
                    <option value="">Selecione...</option>
                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Custo unitário (R$)</label><input style={inp} type="number" step="0.01" value={rCusto} onChange={e => setRCusto(e.target.value)} placeholder="0,00" /></div>
                <div><label style={lbl}>Preço de venda (R$)</label><input style={inp} type="number" step="0.01" value={rPreco} onChange={e => setRPreco(e.target.value)} placeholder="0,00" /></div>
              </div>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                ⚠ Este produto será sinalizado como incompleto e aparecerá no painel de fechamento do dia para complementar as informações.
              </div>
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRapido(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvarRapido} disabled={saving || !rNome.trim()} style={{ padding: '8px 18px', background: saving || !rNome.trim() ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {saving ? 'Salvando...' : '⚡ Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CADASTRO COMPLETO ═══ */}
      {showCadastro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{editId ? 'Editar produto' : 'Novo produto'}</h2>
              <button onClick={() => setShowCadastro(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', flexShrink: 0, padding: '0 22px' }}>
              {ABAS_FORM.map(([k, l]) => {
                const temErro = (k === 'dados' && abaDadosErro) || (k === 'valores' && abaValoresErro)
                return (
                  <button key={k} onClick={() => setAbaForm(k)} style={{ padding: '10px 14px', fontSize: 12, fontWeight: abaForm === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: abaForm === k ? '#6366f1' : '#64748b', borderBottom: abaForm === k ? '2px solid #6366f1' : '2px solid transparent', whiteSpace: 'nowrap', marginBottom: -1, position: 'relative' }}>
                    {l}{temErro && <span style={{ position: 'absolute', top: 8, right: 3, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />}
                  </button>
                )
              })}
            </div>

            {/* Conteúdo das abas */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

              {/* DADOS */}
              {abaForm === 'dados' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={sec}>Identificação</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Nome *</label><input style={inpReqStyle(f.nome)} value={f.nome ?? ''} onChange={e => onFChange('nome', e.target.value)} placeholder="Nome do produto" /></div>
                    <div><label style={lbl}>Código interno</label><input style={inp} value={f.codigo_interno ?? ''} onChange={e => onFChange('codigo_interno', e.target.value)} placeholder="PRD-001" /></div>
                    <div><label style={lbl}>Código de barras</label><input style={inp} value={f.codigo_barras ?? ''} onChange={e => onFChange('codigo_barras', e.target.value)} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Grupo</label>
                      <select style={inp} value={f.grupo_id ?? ''} onChange={e => onFChange('grupo_id', e.target.value || null)}>
                        <option value="">Selecione...</option>
                        {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Qualidade</label>
                      <select style={inp} value={f.qualidade_id ?? ''} onChange={e => onFChange('qualidade_id', e.target.value || null)}>
                        <option value="">Selecione...</option>
                        {qualidades.map(q => <option key={q.id} value={q.id}>{q.nome}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Unidade</label>
                      <select style={inp} value={f.unidade ?? 'un'} onChange={e => onFChange('unidade', e.target.value)}>
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <p style={sec}>Configurações</p>
                  <div style={{ display: 'flex', gap: 24 }}>
                    {[['movimenta_estoque','Movimenta estoque'], ['habilitar_nf','Habilitar NF-e'], ['ativo','Produto ativo']].map(([field, label]) => (
                      <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                        <input type="checkbox" checked={Boolean((f as any)[field])} onChange={e => onFChange(field, e.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div><label style={lbl}>Modelos compatíveis (separados por vírgula)</label><input style={inp} value={fModelos} onChange={e => setFModelos(e.target.value)} placeholder="Samsung Galaxy A32, Apple iPhone 13..." /></div>
                </div>
              )}

              {/* DETALHES */}
              {abaForm === 'detalhes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={sec}>Descrição</p>
                  <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={f.descricao ?? ''} onChange={e => onFChange('descricao', e.target.value)} placeholder="Descrição detalhada do produto..." />
                  <p style={sec}>Características físicas</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {[['peso_g','Peso (g)'], ['altura_cm','Altura (cm)'], ['largura_cm','Largura (cm)'], ['comprimento_cm','Comprimento (cm)']].map(([field, label]) => (
                      <div key={field}><label style={lbl}>{label}</label><input style={inp} type="number" step="0.001" min="0" value={(f as any)[field] ?? ''} onKeyDown={numKey} onChange={e => onFChange(field, e.target.value ? parseFloat(e.target.value) : null)} onBlur={e => { if (e.target.value && isNaN(parseFloat(e.target.value))) onFChange(field, null) }} /></div>
                    ))}
                  </div>
                  <p style={sec}>Campos extras</p>
                  {camposExtras.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input style={{ ...inp, flex: 1 }} value={c.chave} onChange={e => setCamposExtras(prev => prev.map((x, j) => j === i ? { ...x, chave: e.target.value } : x))} placeholder="Nome do campo" />
                      <input style={{ ...inp, flex: 2 }} value={c.valor} onChange={e => setCamposExtras(prev => prev.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} placeholder="Valor" />
                      <button onClick={() => setCamposExtras(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setCamposExtras(prev => [...prev, { chave: '', valor: '' }])} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>+ Adicionar campo extra</button>
                </div>
              )}

              {/* VALORES */}
              {abaForm === 'valores' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={sec}>Custos</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div><label style={lbl}>Custo unitário (R$)</label><input style={inp} type="number" step="0.01" min="0" onKeyDown={numKey} value={f.custo_unit ?? 0} onChange={e => onFChange('custo_unit', parseFloat(e.target.value) || 0)} /></div>
                    <div><label style={lbl}>Despesas extras (R$)</label><input style={inp} type="number" step="0.01" min="0" onKeyDown={numKey} value={f.despesas_extras ?? 0} onChange={e => onFChange('despesas_extras', parseFloat(e.target.value) || 0)} /></div>
                    <div><label style={lbl}>Despesas acessórias (R$)</label><input style={inp} type="number" step="0.01" min="0" onKeyDown={numKey} value={f.despesas_acess ?? 0} onChange={e => onFChange('despesas_acess', parseFloat(e.target.value) || 0)} /></div>
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#065f46' }}>Custo final calculado</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#065f46' }}>R$ {custoFinal.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <p style={sec}>Preço de venda</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Margem de lucro (%)</label>
                      <input style={inp} type="number" step="0.1" value={f.margem_pct ?? 0} onChange={e => onFChange('margem_pct', parseFloat(e.target.value) || 0)} />
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Altera o preço automaticamente</p>
                    </div>
                    <div>
                      <label style={lbl}>Preço de venda (R$) — varejo *</label>
                      <input style={inpReqStyle(f.preco_venda)} type="number" step="0.01" min="0" onKeyDown={numKey} value={f.preco_venda ?? 0} onChange={e => onFChange('preco_venda', parseFloat(e.target.value) || 0)} />
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Altera a margem automaticamente</p>
                    </div>
                    <div>
                      <label style={lbl}>Preço atacado (R$)</label>
                      <input style={inp} type="number" step="0.01" value={f.preco_atacado ?? ''} onChange={e => onFChange('preco_atacado', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Opcional" />
                    </div>
                    <div>
                      <label style={lbl}>Qtd mínima para atacado</label>
                      <input style={inp} type="number" value={f.qtd_min_atacado ?? 1} onChange={e => onFChange('qtd_min_atacado', parseInt(e.target.value) || 1)} />
                    </div>
                  </div>
                  {custoFinal > 0 && (f.preco_venda ?? 0) > 0 && (
                    <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                        <div><span style={{ color: '#64748b' }}>Margem:</span> <strong style={{ color: '#3730a3' }}>{f.margem_pct?.toFixed(1)}%</strong></div>
                        <div><span style={{ color: '#64748b' }}>Lucro unitário:</span> <strong style={{ color: '#3730a3' }}>R$ {((f.preco_venda ?? 0) - custoFinal).toFixed(2).replace('.', ',')}</strong></div>
                        <div><span style={{ color: '#64748b' }}>Markup:</span> <strong style={{ color: '#3730a3' }}>{custoFinal > 0 ? ((f.preco_venda ?? 0) / custoFinal * 100 - 100).toFixed(1) : 0}%</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ESTOQUE */}
              {abaForm === 'estoque' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={sec}>Configurações de estoque</p>
                  {!f.movimenta_estoque && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
                      ⚠ Este produto está configurado para não movimentar estoque.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Estoque mínimo</label><input style={inp} type="number" step="0.001" value={qtdMin} onChange={e => setQtdMin(e.target.value)} /></div>
                    <div><label style={lbl}>Estoque máximo (opcional)</label><input style={inp} type="number" step="0.001" value={qtdMax} onChange={e => setQtdMax(e.target.value)} placeholder="Sem limite" /></div>
                  </div>
                  {editId && estoques[editId] && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Saldo atual</p>
                      <div style={{ display: 'flex', gap: 20 }}>
                        <div><p style={{ fontSize: 11, color: '#64748b' }}>Quantidade atual</p><p style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{estoques[editId].qtd_atual}</p></div>
                        <div><p style={{ fontSize: 11, color: '#64748b' }}>Custo médio</p><p style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>R$ {estoques[editId].custo_medio.toFixed(2).replace('.', ',')}</p></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* FOTOS */}
              {abaForm === 'fotos' && (
                <div>
                  <p style={sec}>Fotos do produto</p>
                  <div ref={dragRef} onDrop={onDrop} onDragOver={e => e.preventDefault()} style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '40px 20px', textAlign: 'center', marginBottom: 16, cursor: 'pointer', background: '#f8fafc' }}
                    onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.onchange = (e: any) => { const files = Array.from(e.target.files as FileList) as File[]; setFotos(prev => [...prev, ...files.map(file => ({ url: URL.createObjectURL(file), file }))]) }; input.click() }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🖼</div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Arraste imagens aqui ou clique para selecionar</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>PNG, JPG, WEBP — até 5MB cada</p>
                  </div>
                  {fotos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                      {fotos.map((foto, i) => (
                        <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', aspectRatio: '1' }}>
                          <img src={foto.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          <button onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                          {i === 0 && <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 9, background: '#6366f1', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>principal</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FISCAL */}
              {abaForm === 'fiscal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={sec}>Informações fiscais</p>
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                    ⚠ Preencha somente se o produto emitirá NF-e. Consulte seu contador para os códigos corretos.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>NCM</label><input style={inp} value={f.ncm ?? ''} onChange={e => onFChange('ncm', e.target.value)} placeholder="0000.00.00" /></div>
                    <div><label style={lbl}>CEST</label><input style={inp} value={f.cest ?? ''} onChange={e => onFChange('cest', e.target.value)} /></div>
                    <div><label style={lbl}>GTIN / EAN</label><input style={inp} value={f.gtin ?? ''} onChange={e => onFChange('gtin', e.target.value)} /></div>
                    <div><label style={lbl}>Origem</label>
                      <select style={inp} value={f.origem ?? '0'} onChange={e => onFChange('origem', e.target.value)}>
                        {ORIGENS.map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>CSOSN (Simples)</label><input style={inp} value={f.csosn ?? ''} onChange={e => onFChange('csosn', e.target.value)} placeholder="102" /></div>
                    <div><label style={lbl}>CST</label><input style={inp} value={f.cst ?? ''} onChange={e => onFChange('cst', e.target.value)} placeholder="000" /></div>
                    <div><label style={lbl}>CFOP</label><input style={inp} value={f.cfop ?? ''} onChange={e => onFChange('cfop', e.target.value)} placeholder="5102" /></div>
                  </div>
                </div>
              )}

              {/* FORNECEDORES */}
              {abaForm === 'fornecedores' && (
                <div>
                  <p style={sec}>Fornecedores deste produto</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fornecedores.map(forn => (
                      <label key={forn.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `1px solid ${fFornIds.includes(forn.id) ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', background: fFornIds.includes(forn.id) ? '#eef2ff' : '#fff' }}>
                        <input type="checkbox" checked={fFornIds.includes(forn.id)} onChange={e => setFFornIds(prev => e.target.checked ? [...prev, forn.id] : prev.filter(id => id !== forn.id))} />
                        <span style={{ fontSize: 13, fontWeight: fFornIds[0] === forn.id ? 600 : 400, color: '#0f172a' }}>{forn.nome}</span>
                        {fFornIds[0] === forn.id && <span style={{ fontSize: 10, background: '#e0e7ff', color: '#3730a3', padding: '1px 7px', borderRadius: 20, marginLeft: 'auto' }}>preferencial</span>}
                      </label>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>O primeiro selecionado será o fornecedor preferencial.</p>
                </div>
              )}

              {/* FILIAIS */}
              {abaForm === 'filiais' && (
                <div>
                  <p style={sec}>Filiais onde este produto está disponível</p>
                  <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Se nenhuma filial for selecionada, o produto fica disponível em todas.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                      <input type="radio" name="filiais" defaultChecked />
                      <span style={{ fontSize: 13, color: '#0f172a' }}>Todas as filiais</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowCadastro(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvar} disabled={saving || !f.nome?.trim()} style={{ padding: '8px 20px', background: saving || !f.nome?.trim() ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Cadastrar produto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
