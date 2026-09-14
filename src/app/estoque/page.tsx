'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import CategoriaSelect from '@/components/CategoriaSelect'
import CamposPersonalizadosForm from '@/components/CamposPersonalizadosForm'

type EntradaHistorico = {
  id: string; produto_id: string; produto_nome?: string
  quantidade: number; custo_unit: number; data_compra: string; nota_fiscal: string | null; created_at: string
}

type Fornecedor = { id: string; nome: string; telefone: string | null; email: string | null; ativo: boolean }

type FotoItem = { url: string; file?: File }

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
  fornecedor_id: string | null; categoria: string | null; estoque_minimo: number | null
  campos_extras: { fotos?: string[] } | null
}

type PedidoPeca = {
  id: string; aparelho_id: string; item_key: string | null
  peca_nome: string; preco: number; chegou: boolean; created_at: string
  aparelhos?: { marca: string; modelo: string } | null
}

type Entrada = {
  id: string; produto_id: string; quantidade: number
  custo_unit: number; custo_total: number; data_compra: string; created_at: string
}

type LinhaImport = {
  nome: string
  codigo_interno: string | null
  codigo_barras: string | null
  unidade: string | null
  estoque_atual: number | null
  estoque_minimo: number | null
  custo_unit: number | null
  preco_venda: number | null
  categoria: string | null
  modelos: string | null
  descricao: string | null
  ativo: boolean | null
  status: 'novo' | 'atualizar'
  matchId: string | null
}

const COMPLETO = (p: Produto) => (p.preco_venda ?? 0) > 0 && (p.custo_unit ?? 0) > 0

// ── Helpers de importação de planilha ──
function normHeader(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// aceita número, "1.234,56", "35,00", "R$ 45" — "------" e "N/A" viram null
function parseNumBR(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  let s = String(v).trim()
  if (!s || /^-+$/.test(s) || s.toUpperCase() === 'N/A') return null
  s = s.replace(/[R$\s]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function parseTexto(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s || /^-+$/.test(s) || s.toUpperCase() === 'N/A') return null
  return s
}

// mapeia cabeçalhos da planilha (nossos e de outros sistemas, ex: Cellparts) para campos do banco
const COLUNAS_IMPORT: { campo: string; aliases: string[] }[] = [
  { campo: 'codigo_interno', aliases: ['cod interno', 'codigo interno', 'codigo', 'cod', 'referencia', 'ref'] },
  { campo: 'nome', aliases: ['nome', 'produto', 'descricao do produto', 'nome do produto'] },
  { campo: 'codigo_barras', aliases: ['cod barra', 'cod barras', 'codigo de barras', 'codigo barras', 'codigo barra', 'ean', 'gtin'] },
  { campo: 'unidade', aliases: ['unidade', 'und', 'un'] },
  { campo: 'estoque_atual', aliases: ['estoque', 'estoque atual', 'qtd', 'quantidade', 'saldo', 'saldo atual'] },
  { campo: 'estoque_minimo', aliases: ['estoque min', 'estoque minimo'] },
  { campo: 'custo_unit', aliases: ['custo unit', 'custo', 'custo unitario', 'preco custo', 'preco de custo', 'valor custo'] },
  { campo: 'preco_venda', aliases: ['valor venda', 'preco venda', 'valor de venda', 'preco de venda', 'venda', 'preco'] },
  { campo: 'categoria', aliases: ['categoria'] },
  { campo: 'modelos', aliases: ['modelos compat', 'modelos compativeis', 'modelos'] },
  { campo: 'descricao', aliases: ['descricao', 'observacao', 'obs'] },
  { campo: 'ativo', aliases: ['ativo'] },
]

const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
      <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', background: value ? '#2563eb' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
      </div>
      {label}
    </label>
  )
}

export default function EstoquePage() {
  const supabase = createClient()
  const router = useRouter()

  const [aba, setAba] = useState<'produtos' | 'entradas' | 'fornecedores' | 'pedidos'>('produtos')
  const [pedidosPecas, setPedidosPecas] = useState<PedidoPeca[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(false)
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
  const [showModalEscolha, setShowModalEscolha] = useState(false)
  const [showModalRapido, setShowModalRapido] = useState(false)
  const [showModalCompleto, setShowModalCompleto] = useState(false)
  const [showModalEntrada, setShowModalEntrada] = useState(false)

  // ── Importação / exportação de planilha
  const importInputRef = useRef<HTMLInputElement>(null)
  const [showModalImport, setShowModalImport] = useState(false)
  const [importLinhas, setImportLinhas] = useState<LinhaImport[]>([])
  const [importArquivo, setImportArquivo] = useState('')
  const [importErro, setImportErro] = useState<string | null>(null)
  const [importProcessando, setImportProcessando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [importResultado, setImportResultado] = useState<{ criados: number; atualizados: number; erros: string[] } | null>(null)
  const [exportando, setExportando] = useState(false)

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
  const [fcFotos, setFcFotos] = useState<FotoItem[]>([])
  const [fcFornecedorId, setFcFornecedorId] = useState('')
  const [fcCategoria, setFcCategoria] = useState('')
  const [fcEstoqueMinimo, setFcEstoqueMinimo] = useState('')
  const [fcUploadando, setFcUploadando] = useState(false)
  const [camposValores, setCamposValores] = useState<Record<string, string>>({})

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

  // Abre modal rápido automaticamente se vier com ?novo=<nome> na URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nomeParam = params.get('novo')
    if (nomeParam) {
      setFNome(decodeURIComponent(nomeParam))
      setFEditId(null)
      setShowModalRapido(true)
    }
  }, [])

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
    setFcFotos((p.campos_extras?.fotos ?? []).map(url => ({ url })))
    setFcFornecedorId(p.fornecedor_id ?? '')
    setFcCategoria(p.categoria ?? '')
    setFcEstoqueMinimo(p.estoque_minimo ? String(p.estoque_minimo) : '')
    setCamposValores((p.campos_extras as Record<string, unknown> & { custom?: Record<string, string> } | null)?.custom ?? {})
  }

  function resetBase() {
    setFNome(''); setFCodInterno(''); setFCodBarras(''); setFUnidade('un')
    setFCusto('0'); setFMargem('0'); setFPrecoVenda('0')
    setFModelos(''); setFDescricao(''); setFAtivo(true); setFMovEstoque(true); setFEditId(null)
  }

  function resetCompleto() {
    setFcTab('ident'); setFcPrecoAtacado(''); setFcQtdMinAtacado('')
    setFcDespExtras('0'); setFcDespAcess('0'); setFcNcm(''); setFcCest(''); setFcOrigem('0')
    setFcCsosn(''); setFcCst(''); setFcCfop(''); setFcGtin(''); setFcHabNf(false)
    setFcPesoG(''); setFcAltura(''); setFcLargura(''); setFcComprimento('')
    setFcFotos([]); setFcFornecedorId(''); setFcCategoria(''); setFcEstoqueMinimo('')
  }

  function abrirNovo() { setShowModalEscolha(true) }
  function abrirNovoRapido() { resetBase(); setShowModalEscolha(false); setShowModalRapido(true) }
  function abrirNovoCompleto() { resetBase(); resetCompleto(); setCamposValores({}); setShowModalEscolha(false); setShowModalCompleto(true) }

  function abrirRapido(p: Produto) { popularFormBase(p); setShowModalRapido(true) }

  function abrirCompleto(p: Produto) { popularFormCompleto(p); setShowModalCompleto(true) }

  async function uploadFoto(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('produto-fotos').upload(path, file, { upsert: false })
    if (error) { alert(`Erro no upload da foto: ${error.message}`); return null }
    const { data: pub } = supabase.storage.from('produto-fotos').getPublicUrl(data.path)
    return pub.publicUrl
  }

  function adicionarFotos(files: FileList | null) {
    if (!files) return
    const restantes = 4 - fcFotos.length
    if (restantes <= 0) { alert('Limite de 4 fotos por produto atingido.'); return }
    const novas = Array.from(files).slice(0, restantes).map(file => ({
      url: URL.createObjectURL(file), file,
    }))
    setFcFotos(prev => [...prev, ...novas])
  }

  function substituirFoto(index: number, files: FileList | null) {
    if (!files || !files[0]) return
    const file = files[0]
    const url = URL.createObjectURL(file)
    setFcFotos(prev => prev.map((f, i) => i === index ? { url, file } : f))
  }

  function removerFoto(index: number) {
    setFcFotos(prev => {
      const nova = prev.filter((_, i) => i !== index)
      return nova
    })
  }

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
      const res = await fetch('/api/produtos/criar-rapido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok || data.error) { alert(`Erro: ${data.error}`); setFSaving(false); return }
    }
    setFSaving(false); setShowModalRapido(false); fetchProdutos()
  }

  async function salvarCompleto() {
    if (!fNome.trim()) return
    setFSaving(true)
    setFcUploadando(fcFotos.some(f => !!f.file))

    // fazer upload das fotos locais
    const fotosFinais: string[] = []
    for (const foto of fcFotos) {
      if (foto.file) {
        const url = await uploadFoto(foto.file)
        if (url) fotosFinais.push(url)
      } else {
        fotosFinais.push(foto.url)
      }
    }
    setFcUploadando(false)

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
      fornecedor_id: fcFornecedorId || null,
      categoria: fcCategoria || null,
      estoque_minimo: parseFloat(fcEstoqueMinimo) || null,
      campos_extras: {
        ...(fotosFinais.length > 0 ? { fotos: fotosFinais } : {}),
        custom: camposValores,
      },
    }
    if (fEditId) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', fEditId)
      if (error) { alert(`Erro: ${error.message}`); setFSaving(false); return }
    } else {
      const res = await fetch('/api/produtos/criar-rapido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok || data.error) { alert(`Erro: ${data.error}`); setFSaving(false); return }
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

  // ── Exportar produtos para planilha (formato compatível com a importação)
  async function exportarProdutos() {
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const { data } = await supabase.from('produtos').select('*').is('deleted_at', null).order('nome')
      const lista = (data ?? []) as (Produto & { estoque_atual?: number | null })[]
      const ws = XLSX.utils.json_to_sheet(lista.map(p => ({
        'Cód. interno': p.codigo_interno ?? '',
        'Nome': p.nome,
        'Cód. barra': p.codigo_barras ?? '',
        'Unidade': p.unidade ?? 'un',
        'Estoque': p.estoque_atual ?? 0,
        'Estoque min.': p.estoque_minimo ?? 0,
        'Custo unit.': p.custo_unit ?? 0,
        'Valor venda': p.preco_venda ?? 0,
        'Categoria': p.categoria ?? '',
        'Modelos compat.': p.modelos_compat?.join(', ') ?? '',
        'Descrição': p.descricao ?? '',
        'Ativo': p.ativo ? 'Sim' : 'Não',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
      XLSX.writeFile(wb, `produtos-sos-celulares-${new Date().toISOString().split('T')[0]}.xlsx`)
    } finally {
      setExportando(false)
    }
  }

  // ── Ler planilha e montar prévia da importação
  async function processarArquivoImport(file: File) {
    setImportErro(null); setImportResultado(null); setImportLinhas([])
    setImportArquivo(file.name); setImportProcessando(true); setShowModalImport(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]

      // localizar a linha de cabeçalho (pode não ser a primeira — relatórios têm título antes)
      let headerIdx = -1
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const norm = (rows[i] ?? []).map(normHeader)
        const temNome = norm.some(c => c === 'nome' || c === 'produto' || c === 'nome do produto')
        const temOutra = norm.some(c => ['valor venda', 'preco venda', 'preco de venda', 'custo unit', 'custo', 'estoque'].includes(c))
        if (temNome && temOutra) { headerIdx = i; break }
      }
      if (headerIdx === -1) throw new Error('Linha de cabeçalho não encontrada. A planilha precisa de colunas como "Nome", "Custo unit." e "Valor venda".')

      const mapa: Record<string, number> = {}
      ;(rows[headerIdx] ?? []).forEach((cell, idx) => {
        const n = normHeader(cell)
        if (!n) return
        const col = COLUNAS_IMPORT.find(c => c.aliases.includes(n))
        if (col && mapa[col.campo] === undefined) mapa[col.campo] = idx
      })
      if (mapa.nome === undefined) throw new Error('Coluna com o nome do produto não encontrada.')

      // produtos existentes para detectar o que é atualização (por cód. barras > cód. interno > nome)
      const { data: existentes } = await supabase.from('produtos').select('id, nome, codigo_interno, codigo_barras').is('deleted_at', null)
      const porBarras = new Map<string, string>(); const porCodigo = new Map<string, string>(); const porNome = new Map<string, string>()
      for (const e of existentes ?? []) {
        if (e.codigo_barras) porBarras.set(String(e.codigo_barras).trim(), e.id)
        if (e.codigo_interno) porCodigo.set(String(e.codigo_interno).trim(), e.id)
        porNome.set(String(e.nome).trim().toLowerCase(), e.id)
      }

      const linhas: LinhaImport[] = []
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i] ?? []
        const get = (campo: string) => (mapa[campo] !== undefined ? r[mapa[campo]] : undefined)
        const nome = parseTexto(get('nome'))
        if (!nome) continue
        const codigo_interno = parseTexto(get('codigo_interno'))
        const codigo_barras = parseTexto(get('codigo_barras'))
        let ativo: boolean | null = null
        if (mapa.ativo !== undefined) {
          const a = normHeader(get('ativo'))
          if (['sim', 'ativo', 'true', '1', 's'].includes(a)) ativo = true
          else if (['nao', 'inativo', 'false', '0', 'n'].includes(a)) ativo = false
        }
        const estoqueNum = parseNumBR(get('estoque_atual'))
        const estMinNum = parseNumBR(get('estoque_minimo'))
        const matchId = (codigo_barras ? porBarras.get(codigo_barras) : undefined)
          ?? (codigo_interno ? porCodigo.get(codigo_interno) : undefined)
          ?? porNome.get(nome.toLowerCase()) ?? null
        linhas.push({
          nome, codigo_interno, codigo_barras,
          unidade: parseTexto(get('unidade'))?.toLowerCase() ?? null,
          estoque_atual: estoqueNum !== null ? Math.round(estoqueNum) : null,
          estoque_minimo: estMinNum !== null ? Math.round(estMinNum) : null,
          custo_unit: parseNumBR(get('custo_unit')),
          preco_venda: parseNumBR(get('preco_venda')),
          categoria: parseTexto(get('categoria')),
          modelos: parseTexto(get('modelos')),
          descricao: parseTexto(get('descricao')),
          ativo,
          status: matchId ? 'atualizar' : 'novo',
          matchId,
        })
      }
      if (linhas.length === 0) throw new Error('Nenhum produto válido encontrado na planilha.')
      setImportLinhas(linhas)
    } catch (err) {
      setImportErro(err instanceof Error ? err.message : String(err))
    } finally {
      setImportProcessando(false)
    }
  }

  // ── Confirmar importação: envia tudo em uma chamada
  async function confirmarImport() {
    setImportando(true)
    const margemDe = (custo: number | null, preco: number | null) =>
      custo !== null && preco !== null && custo > 0 && preco > custo
        ? Math.round((1 - custo / preco) * 10000) / 100 : null

    const criar: Record<string, unknown>[] = []
    const atualizar: { id: string; dados: Record<string, unknown> }[] = []
    for (const l of importLinhas) {
      if (l.status === 'novo') {
        criar.push({
          nome: l.nome, codigo_interno: l.codigo_interno, codigo_barras: l.codigo_barras,
          unidade: l.unidade ?? 'un',
          custo_unit: l.custo_unit ?? 0, preco_venda: l.preco_venda ?? 0,
          margem_pct: margemDe(l.custo_unit, l.preco_venda) ?? 0,
          estoque_atual: l.estoque_atual ?? 0, estoque_minimo: l.estoque_minimo,
          categoria: l.categoria,
          modelos_compat: l.modelos ? l.modelos.split(',').map(s => s.trim()).filter(Boolean) : null,
          descricao: l.descricao,
          ativo: l.ativo ?? true, movimenta_estoque: true, cadastro_rapido: false,
        })
      } else if (l.matchId) {
        // atualização: só sobrescreve campos que vieram preenchidos na planilha
        const dados: Record<string, unknown> = { nome: l.nome }
        if (l.codigo_interno !== null) dados.codigo_interno = l.codigo_interno
        if (l.codigo_barras !== null) dados.codigo_barras = l.codigo_barras
        if (l.unidade !== null) dados.unidade = l.unidade
        if (l.estoque_atual !== null) dados.estoque_atual = l.estoque_atual
        if (l.estoque_minimo !== null) dados.estoque_minimo = l.estoque_minimo
        if (l.custo_unit !== null) dados.custo_unit = l.custo_unit
        if (l.preco_venda !== null) dados.preco_venda = l.preco_venda
        const m = margemDe(l.custo_unit, l.preco_venda)
        if (m !== null) dados.margem_pct = m
        if (l.categoria !== null) dados.categoria = l.categoria
        if (l.modelos !== null) dados.modelos_compat = l.modelos.split(',').map(s => s.trim()).filter(Boolean)
        if (l.descricao !== null) dados.descricao = l.descricao
        if (l.ativo !== null) dados.ativo = l.ativo
        atualizar.push({ id: l.matchId, dados })
      }
    }

    try {
      const res = await fetch('/api/produtos/importar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criar, atualizar }),
      })
      const data = await res.json() as { criados?: number; atualizados?: number; erros?: string[]; error?: string }
      if (!res.ok || data.error) { setImportErro(data.error ?? 'Erro ao importar'); return }
      setImportResultado({ criados: data.criados ?? 0, atualizados: data.atualizados ?? 0, erros: data.erros ?? [] })
      fetchProdutos()
    } catch (err) {
      setImportErro(String(err))
    } finally {
      setImportando(false)
    }
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

  const fetchPedidosPecas = useCallback(async () => {
    setLoadingPedidos(true)
    const { data } = await supabase.from('aparelho_pecas')
      .select('id,aparelho_id,item_key,peca_nome,preco,chegou,created_at,aparelhos(marca,modelo)')
      .eq('chegou', false).order('created_at', { ascending: false })
    setPedidosPecas((data ?? []) as unknown as PedidoPeca[])
    setLoadingPedidos(false)
  }, [supabase])

  useEffect(() => {
    if (aba === 'entradas') fetchEntradasHistorico()
    if (aba === 'fornecedores') fetchFornecedoresList()
    if (aba === 'pedidos') fetchPedidosPecas()
  }, [aba, fetchEntradasHistorico, fetchFornecedoresList, fetchPedidosPecas])

  useEffect(() => {
    if (showModalCompleto && fornecedoresList.length === 0) fetchFornecedoresList()
  }, [showModalCompleto])

  async function marcarPecaChegou(id: string) {
    await supabase.from('aparelho_pecas').update({ chegou: true }).eq('id', id)
    setPedidosPecas(prev => prev.filter(p => p.id !== id))
  }

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
        onMouseEnter={e => { e.currentTarget.style.background = incompleto ? '#fef9ec' : '#eff6ff' }}
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
            <button onClick={e => { e.stopPropagation(); abrirEntrada(p) }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #dbeafe', borderRadius: 6, background: '#dbeafe', color: '#2563eb', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>+ Entrada</button>
            <button onClick={e => { e.stopPropagation(); abrirRapido(p) }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>Editar rápido</button>
            <button onClick={e => { e.stopPropagation(); abrirCompleto(p) }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #bfdbfe', borderRadius: 6, background: '#dbeafe', color: '#2563eb', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}>Editar completo</button>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={exportarProdutos} disabled={exportando}
                style={{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: exportando ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                {exportando ? 'Exportando...' : '⬇ Exportar'}
              </button>
              <button onClick={() => importInputRef.current?.click()}
                style={{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⬆ Importar
              </button>
              <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) processarArquivoImport(file)
                  e.target.value = ''
                }} />
              <button onClick={abrirNovo} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Novo produto</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {([['produtos','📦 Produtos & Estoque'],['entradas','📥 Entradas'],['fornecedores','🏭 Fornecedores'],['pedidos','🔧 Pedidos de peças']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ padding: '9px 16px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#2563eb' : '#64748b', borderBottom: aba === k ? '2px solid #2563eb' : '2px solid transparent', whiteSpace: 'nowrap', marginBottom: -1 }}>{l}</button>
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
                <button onClick={abrirNovo} style={{ marginTop: 16, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ Cadastrar primeiro produto</button>
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
            <button onClick={fetchEntradasHistorico} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Filtrar</button>
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
            <div style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 36, marginBottom: 12 }}>🏭</div><p style={{ color: '#94a3b8' }}>Nenhum fornecedor cadastrado</p><button onClick={() => router.push('/fornecedores')} style={{ marginTop: 12, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Gerenciar fornecedores</button></div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 13, color: '#64748b' }}>{fornecedoresList.length} fornecedores</p>
                <button onClick={() => router.push('/fornecedores')} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>Gerenciar completo →</button>
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

      {/* ── ABA PEDIDOS DE PEÇAS */}
      {aba === 'pedidos' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loadingPedidos ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
          ) : pedidosPecas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔧</div>
              <p style={{ color: '#94a3b8', fontSize: 14 }}>Nenhuma peça pendente de chegada.</p>
            </div>
          ) : (
            <div>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>⏳ {pedidosPecas.length} peça(s) aguardando chegada</span>
                <span style={{ fontSize: 13, color: '#92400e', fontWeight: 700 }}>
                  Total: R$ {pedidosPecas.reduce((acc,p)=>acc+(p.preco??0),0).toFixed(2).replace('.',',')}
                </span>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Aparelho','Peça','Valor estimado','Data pedido',''].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {pedidosPecas.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a' }}>
                          {p.aparelhos ? `${p.aparelhos.marca} ${p.aparelhos.modelo}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#374151' }}>{p.peca_nome}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#374151' }}>
                          {p.preco > 0 ? `R$ ${p.preco.toFixed(2).replace('.',',')}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>
                          {new Date(p.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <button onClick={() => marcarPecaChegou(p.id)} style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #bbf7d0', borderRadius: 8, background: '#ecfdf5', color: '#065f46', cursor: 'pointer', fontWeight: 500 }}>
                            ✓ Chegou
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODAL ESCOLHA TIPO DE CADASTRO ═══ */}
      {showModalEscolha && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Novo produto</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>Escolha o tipo de cadastro</p>
              </div>
              <button onClick={() => setShowModalEscolha(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, marginTop: -4 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button onClick={abrirNovoRapido} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '18px 20px', border: '2px solid #e2e8f0', borderRadius: 12, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#93c5fd')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>⚡</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Cadastro rápido</p>
                  <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>Nome, código, preço e unidade. Ideal para cadastrar rapidamente durante uma venda ou OS.</p>
                </div>
              </button>
              <button onClick={abrirNovoCompleto} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '18px 20px', border: '2px solid #e2e8f0', borderRadius: 12, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>📋</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Cadastro completo</p>
                  <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>Todas as informações: fotos, fornecedor, categoria, dimensões, dados fiscais (NCM, CSOSN, CFOP), preço atacado e mais.</p>
                </div>
              </button>
            </div>
          </div>
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
                style={{ padding: '9px 22px', background: fSaving || !fNome.trim() ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: fSaving || !fNome.trim() ? 'not-allowed' : 'pointer' }}>
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
                  color: fcTab === k ? '#2563eb' : '#64748b',
                  borderBottom: fcTab === k ? '2px solid #2563eb' : '2px solid transparent',
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Fornecedor</label>
                      <select style={inp} value={fcFornecedorId} onChange={e => setFcFornecedorId(e.target.value)}>
                        <option value="">— Nenhum —</option>
                        {fornecedoresList.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Categoria</label>
                      <CategoriaSelect
                        value={fcCategoria}
                        onChange={v => setFcCategoria(v)}
                        placeholder="Ex: Display, Bateria, Carcaça..."
                      />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Modelos compatíveis (separados por vírgula)</label>
                    <input style={inp} value={fModelos} onChange={e => setFModelos(e.target.value)} placeholder="Samsung Galaxy A32, Apple iPhone 13..." />
                  </div>
                  <div>
                    <label style={lbl}>Descrição</label>
                    <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={fDescricao} onChange={e => setFDescricao(e.target.value)} placeholder="Detalhes técnicos, características..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Estoque mínimo (alerta)</label>
                      <input style={inp} inputMode="decimal" value={fcEstoqueMinimo}
                        onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFcEstoqueMinimo(e.target.value) }}
                        placeholder="Ex: 5" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <Toggle value={fAtivo} onChange={setFAtivo} label="Produto ativo" />
                    <Toggle value={fMovEstoque} onChange={setFMovEstoque} label="Movimenta estoque" />
                    <Toggle value={fcHabNf} onChange={setFcHabNf} label="Habilitar NF-e" />
                  </div>
                  <CamposPersonalizadosForm
                    entidade="produto"
                    valores={camposValores}
                    onChange={setCamposValores}
                  />
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
                      <div style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 20, fontSize: 12 }}>
                        <div><span style={{ color: '#64748b' }}>Lucro: </span><strong style={{ color: '#1d4ed8' }}>R$ {(parseFloat(fPrecoVenda) - parseFloat(fCusto)).toFixed(2).replace('.', ',')}</strong></div>
                        <div><span style={{ color: '#64748b' }}>Margem: </span><strong style={{ color: '#1d4ed8' }}>{fMargem}%</strong></div>
                        <div><span style={{ color: '#64748b' }}>Markup: </span><strong style={{ color: '#1d4ed8' }}>{parseFloat(fCusto) > 0 ? ((parseFloat(fPrecoVenda) / parseFloat(fCusto) * 100) - 100).toFixed(1) : '—'}%</strong></div>
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
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Somente números. Usado para cálculo de frete e NF-e.</p>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Peso</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={lbl}>Peso bruto (g)</label>
                        <input style={inp} inputMode="decimal" value={fcPesoG} placeholder="Ex: 150"
                          onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFcPesoG(e.target.value) }}
                          onKeyDown={e => { if (!/[\d.,Backspace,Delete,Tab,ArrowLeft,ArrowRight]/.test(e.key)) e.preventDefault() }} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Medidas (cm)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      {([
                        ['Altura (cm)', fcAltura, setFcAltura],
                        ['Largura (cm)', fcLargura, setFcLargura],
                        ['Comprimento (cm)', fcComprimento, setFcComprimento],
                      ] as [string, string, (v:string)=>void][]).map(([label, val, set]) => (
                        <div key={label}>
                          <label style={lbl}>{label}</label>
                          <input style={inp} inputMode="decimal" value={val} placeholder="0,0"
                            onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) set(e.target.value) }}
                            onKeyDown={e => { if (!/[\d.,Backspace,Delete,Tab,ArrowLeft,ArrowRight]/.test(e.key)) e.preventDefault() }} />
                        </div>
                      ))}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Fotos do produto</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{fcFotos.length}/4 fotos · Formatos: JPG, PNG, WebP · Máx. 5 MB por foto</p>
                    </div>
                    {fcFotos.length < 4 && (
                      <label style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        + Adicionar foto
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                          onChange={e => adicionarFotos(e.target.files)} />
                      </label>
                    )}
                  </div>
                  {fcFotos.length === 0 ? (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', border: '2px dashed #e2e8f0', borderRadius: 12, color: '#94a3b8', cursor: 'pointer', gap: 8 }}>
                      <span style={{ fontSize: 40 }}>🖼</span>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Clique para adicionar fotos</p>
                      <p style={{ fontSize: 12 }}>ou arraste arquivos aqui</p>
                      <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                        onChange={e => adicionarFotos(e.target.files)} />
                    </label>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                      {fcFotos.map((foto, i) => (
                        <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0', aspectRatio: '4/3', background: '#f8fafc' }}>
                          <img src={foto.url} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">🖼</text></svg>' }} />
                          {foto.file && (
                            <div style={{ position: 'absolute', top: 6, left: 6, background: '#2563eb', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>LOCAL</div>
                          )}
                          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                            <label title="Substituir foto" style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(15,23,42,0.7)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                              ✎
                              <input type="file" accept="image/*" style={{ display: 'none' }}
                                onChange={e => substituirFoto(i, e.target.files)} />
                            </label>
                            <button onClick={() => removerFoto(i)} title="Remover foto"
                              style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                              ×
                            </button>
                          </div>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', background: 'linear-gradient(transparent,rgba(0,0,0,0.55))', fontSize: 10, color: '#fff' }}>
                            Foto {i + 1}{i === 0 ? ' · Principal' : ''}
                          </div>
                        </div>
                      ))}
                      {fcFotos.length < 4 && (
                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #bfdbfe', borderRadius: 10, aspectRatio: '4/3', color: '#93c5fd', cursor: 'pointer', gap: 6 }}>
                          <span style={{ fontSize: 28 }}>+</span>
                          <span style={{ fontSize: 12 }}>Adicionar</span>
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                            onChange={e => adicionarFotos(e.target.files)} />
                        </label>
                      )}
                    </div>
                  )}
                  {fcFotos.some(f => f.file) && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                      ⚠ {fcFotos.filter(f => f.file).length} foto(s) pendente(s) de upload — serão enviadas ao salvar.
                    </div>
                  )}
                </>
              )}

            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'space-between', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
                {(['ident','valores','fiscal','dimensoes','fotos'] as const).map((t, i) => (
                  <span key={t} onClick={() => setFcTab(t)} style={{ cursor: 'pointer', marginRight: 4, fontSize: 14, color: fcTab === t ? '#2563eb' : '#d1d5db' }}>●</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowModalCompleto(false)} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                <button onClick={salvarCompleto} disabled={fSaving || !fNome.trim()}
                  style={{ padding: '9px 22px', background: fSaving || !fNome.trim() ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: fSaving || !fNome.trim() ? 'not-allowed' : 'pointer' }}>
                  {fcUploadando ? '📤 Enviando fotos...' : fSaving ? 'Salvando...' : '✓ Salvar cadastro completo'}
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
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resumo da entrada</p>
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
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: i < entradas.length - 1 ? '1px solid #f1f5f9' : 'none', background: i === 0 ? '#f0f9ff' : '#fff' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {i === 0 && <span style={{ fontSize: 10, fontWeight: 500, background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 10 }}>última</span>}
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
              <button onClick={salvarEntrada} disabled={eSaving || !eCusto} style={{ padding: '8px 18px', background: eSaving || !eCusto ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: eSaving || !eCusto ? 'not-allowed' : 'pointer' }}>
                {eSaving ? 'Registrando...' : 'Registrar entrada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL IMPORTAR PLANILHA ═══ */}
      {showModalImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, marginBottom: 20, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 40px)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>⬆ Importar produtos</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{importArquivo}</p>
              </div>
              <button onClick={() => setShowModalImport(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1 }}>
              {importProcessando ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Lendo planilha...</div>
              ) : importErro ? (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>Não foi possível importar</p>
                  <p style={{ fontSize: 13, color: '#b91c1c' }}>{importErro}</p>
                </div>
              ) : importResultado ? (
                <div>
                  <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 20px', marginBottom: 12 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#065f46', marginBottom: 6 }}>✓ Importação concluída</p>
                    <p style={{ fontSize: 13, color: '#047857' }}>
                      {importResultado.criados} produto{importResultado.criados !== 1 ? 's' : ''} criado{importResultado.criados !== 1 ? 's' : ''} · {importResultado.atualizados} atualizado{importResultado.atualizados !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {importResultado.erros.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>⚠ {importResultado.erros.length} erro(s):</p>
                      {importResultado.erros.slice(0, 10).map((e, i) => <p key={i} style={{ fontSize: 12, color: '#92400e' }}>{e}</p>)}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, background: '#ecfdf5', color: '#065f46' }}>
                      + {importLinhas.filter(l => l.status === 'novo').length} novos
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8' }}>
                      ↻ {importLinhas.filter(l => l.status === 'atualizar').length} serão atualizados
                    </span>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                            {['', 'Produto', 'Cód. interno', 'Custo', 'Venda', 'Estoque'].map((h, i) => (
                              <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importLinhas.map((l, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '7px 12px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap', background: l.status === 'novo' ? '#ecfdf5' : '#eff6ff', color: l.status === 'novo' ? '#065f46' : '#1d4ed8' }}>
                                  {l.status === 'novo' ? 'Novo' : 'Atualizar'}
                                </span>
                              </td>
                              <td style={{ padding: '7px 12px', fontWeight: 500, color: '#0f172a' }}>{l.nome}</td>
                              <td style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 11 }}>{l.codigo_interno ?? '—'}</td>
                              <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#374151' }}>{l.custo_unit !== null ? `R$ ${l.custo_unit.toFixed(2).replace('.', ',')}` : '—'}</td>
                              <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{l.preco_venda !== null ? `R$ ${l.preco_venda.toFixed(2).replace('.', ',')}` : '—'}</td>
                              <td style={{ padding: '7px 12px', color: '#374151' }}>{l.estoque_atual ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
                    Produtos são reconhecidos pelo código de barras, código interno ou nome — os já cadastrados serão atualizados (células vazias na planilha não apagam dados existentes).
                  </p>
                </>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#f8fafc', borderRadius: '0 0 16px 16px', flexShrink: 0 }}>
              {importResultado || importErro ? (
                <button onClick={() => setShowModalImport(false)} style={{ padding: '9px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
              ) : (
                <>
                  <button onClick={() => setShowModalImport(false)} disabled={importando} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                  <button onClick={confirmarImport} disabled={importando || importProcessando || importLinhas.length === 0}
                    style={{ padding: '9px 22px', background: importando || importProcessando || importLinhas.length === 0 ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: importando ? 'wait' : 'pointer' }}>
                    {importando ? 'Importando...' : `✓ Importar ${importLinhas.length} produto${importLinhas.length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
