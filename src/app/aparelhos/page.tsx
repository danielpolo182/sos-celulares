'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Tipos ────────────────────────────────────────────────
type Aparelho = {
  id: string; tipo: string; status: string
  marca: string; modelo: string; capacidade: string | null; cor: string | null
  imei: string | null; specs_json: Record<string, any>
  preco_compra: number | null; preco_venda: number | null
  checklist_json: Record<string, string>; checklist_nota: string | null
  observacoes: string | null; created_at: string
}

type Dispositivo = {
  id: string; marca: string; modelo: string
  ram: string | null; armazenamento: string | null; tela: string | null
  resolucao: string | null; processador: string | null
  camera_principal: string | null; camera_frontal: string | null
  bateria: string | null; sistema: string | null
  dimensoes: string | null; peso: string | null; lancamento: string | null
}

// ─── Checklist ────────────────────────────────────────────
const CHECKLIST_ITENS = [
  { key: 'tela',         label: 'Tela / Display' },
  { key: 'touch',        label: 'Touch / Toque' },
  { key: 'bateria',      label: 'Bateria / Autonomia' },
  { key: 'carregamento', label: 'Carregamento / Conector' },
  { key: 'camera_tras',  label: 'Câmera traseira' },
  { key: 'camera_front', label: 'Câmera frontal' },
  { key: 'alto_falante', label: 'Alto-falante' },
  { key: 'microfone',    label: 'Microfone' },
  { key: 'wifi',         label: 'Wi-Fi' },
  { key: 'bluetooth',    label: 'Bluetooth' },
  { key: 'biometria',    label: 'Biometria / Face ID' },
  { key: 'botoes',       label: 'Botões físicos' },
  { key: 'chip',         label: 'Leitor de chip' },
  { key: 'carcaca',      label: 'Carcaça / Estrutura' },
  { key: 'gps',          label: 'GPS' },
]

const ESTADOS = [
  { v: 'Bom',     bg: '#ecfdf5', color: '#065f46', border: '#86efac' },
  { v: 'Regular', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  { v: 'Ruim',    bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  { v: 'N/A',     bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
]

const FORMAS_PGTO = ['Dinheiro','PIX','Transferência','Cartão débito','Cartão crédito']
const STATUS_CFG: Record<string, {label:string;bg:string;color:string}> = {
  disponivel: { label: 'Disponível', bg: '#ecfdf5', color: '#065f46' },
  vendido:    { label: 'Vendido',    bg: '#f1f5f9', color: '#64748b' },
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }
const sec: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em' }

function formatCPF(v: string) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2') }
function formatPhone(v: string) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4,5})(\d{4})$/,'$1-$2') }
function formatCEP(v: string) { return v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2') }
function fm(v: number) { return `R$ ${v.toFixed(2).replace('.',',')}` }

function notaGeral(cl: Record<string,string>): string {
  const vals = Object.values(cl).filter(v => v && v !== 'N/A')
  if (vals.length === 0) return 'Não avaliado'
  const ruim = vals.filter(v => v === 'Ruim').length
  const regular = vals.filter(v => v === 'Regular').length
  if (ruim > 2) return 'Ruim'
  if (ruim > 0 || regular > 3) return 'Regular'
  return 'Bom'
}

// ─── Componente principal ─────────────────────────────────
export default function AparelhoPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'estoque'|'comprar'|'vender'>('estoque')
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [search, setSearch] = useState('')

  // ── Busca de modelo ──────────────────────────────────────
  const [modeloInput, setModeloInput] = useState('')
  const [modeloSugestoes, setModeloSugestoes] = useState<Dispositivo[]>([])
  const [modeloSelecionado, setModeloSelecionado] = useState<Dispositivo | null>(null)
  const [buscandoSpecs, setBuscandoSpecs] = useState(false)
  const [showSugestoes, setShowSugestoes] = useState(false)
  const modeloTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Dados do aparelho ─────────────────────────────────────
  const [cTipo, setCTipo] = useState<'novo'|'usado'>('usado')
  const [cCapacidade, setCCapacidade] = useState('')
  const [cCor, setCCor] = useState('')
  const [cIMEI, setCIMEI] = useState('')
  const [cIMEI2, setCIMEI2] = useState('')
  const [cSenha, setCScenha] = useState('')
  const [cChecklist, setCChecklist] = useState<Record<string,string>>({})
  const [cObs, setCObs] = useState('')

  // ── Vendedor ─────────────────────────────────────────────
  const [vNome, setVNome] = useState('')
  const [vCPF, setVCPF] = useState('')
  const [vRG, setVRG] = useState('')
  const [vTel, setVTel] = useState('')
  const [vEmail, setVEmail] = useState('')
  const [vCEP, setVCEP] = useState('')
  const [vEnd, setVEnd] = useState('')
  const [vBairro, setVBairro] = useState('')
  const [vCidade, setVCidade] = useState('')
  const [vEstado, setVEstado] = useState('')
  const [buscandoCEP, setBuscandoCEP] = useState(false)

  // ── Pagamento ─────────────────────────────────────────────
  const [cValor, setCValor] = useState('')
  const [cForma, setCForma] = useState('Dinheiro')
  const [salvando, setSalvando] = useState(false)
  const [compraSalva, setCompraSalva] = useState<{id:string;numero:number}|null>(null)

  // ── Foto do vendedor ──────────────────────────────────────
  const [fotoVendedor, setFotoVendedor] = useState<string>('')
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fotoCanvasRef = useRef<HTMLCanvasElement>(null)
  const [streamAtivo, setStreamAtivo] = useState<MediaStream|null>(null)

  // ── Assinaturas ───────────────────────────────────────────
  const vendCanvasRef = useRef<HTMLCanvasElement>(null)
  const [desenhando, setDesenhando] = useState(false)
  const [assinaturaVendedor, setAssinaturaVendedor] = useState('')
  const [assinaturaLoja, setAssinaturaLoja] = useState('')

  // ── Venda ─────────────────────────────────────────────────
  const [aparelhoVenda, setAparelhoVenda] = useState<Aparelho|null>(null)
  const [bNome, setBNome] = useState('')
  const [bCPF, setBCPF] = useState('')
  const [bTel, setBTel] = useState('')
  const [bEmail, setBEmail] = useState('')
  const [bEnd, setBEnd] = useState('')
  const [bValor, setBValor] = useState('')
  const [bForma, setBForma] = useState('Dinheiro')
  const [bGarantia, setBGarantia] = useState('90')
  const [vendaSalva, setVendaSalva] = useState<{id:string;numero:number}|null>(null)
  const comprCanvasRef = useRef<HTMLCanvasElement>(null)
  const [assinaturaComprador, setAssinaturaComprador] = useState('')

  // ── Carregamento ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('aparelhos').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setAparelhos((data ?? []) as unknown as Aparelho[])
    // Buscar assinatura da loja (do usuário logado)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: ass } = await supabase.from('usuario_assinaturas').select('assinatura').eq('usuario_id', user.id).maybeSingle()
      if (ass) setAssinaturaLoja(ass.assinatura)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Busca de modelo no banco ──────────────────────────────
  function onModeloChange(val: string) {
    setModeloInput(val)
    setModeloSelecionado(null)
    if (modeloTimer.current) clearTimeout(modeloTimer.current)
    if (!val.trim()) { setModeloSugestoes([]); setShowSugestoes(false); return }
    modeloTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('dispositivos_modelos')
        .select('*').ilike('modelo', `%${val}%`).eq('ativo', true)
        .order('verificado', { ascending: false }).limit(6)
      setModeloSugestoes((data ?? []) as Dispositivo[])
      setShowSugestoes(true)
    }, 300)
  }

  function selecionarModelo(d: Dispositivo) {
    setModeloSelecionado(d)
    setModeloInput(`${d.marca} ${d.modelo}`)
    if (d.armazenamento) setCCapacidade(d.armazenamento)
    setShowSugestoes(false)
  }

  async function buscarSpecs() {
    if (!modeloInput.trim()) return
    setBuscandoSpecs(true)
    setShowSugestoes(false)
    try {
      const res = await fetch('/api/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo: modeloInput })
      })
      const data = await res.json()
      if (data.results?.length > 0) {
        const d = data.results[0]
        setModeloSelecionado(d)
        if (d.armazenamento) setCCapacidade(d.armazenamento)
      }
    } finally { setBuscandoSpecs(false) }
  }

  // ── Busca CEP ─────────────────────────────────────────────
  async function buscarCEP(cep: string) {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    setBuscandoCEP(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setVEnd(data.logradouro || '')
        setVBairro(data.bairro || '')
        setVCidade(data.localidade || '')
        setVEstado(data.uf || '')
      }
    } finally { setBuscandoCEP(false) }
  }

  // ── Câmera ────────────────────────────────────────────────
  async function abrirCamera() {
    setShowCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      setStreamAtivo(stream)
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
    } catch { setShowCamera(false); alert('Câmera não disponível. Use upload de arquivo.') }
  }

  function tirarFoto() {
    if (!videoRef.current || !fotoCanvasRef.current) return
    const canvas = fotoCanvasRef.current; const video = videoRef.current
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setFotoVendedor(canvas.toDataURL('image/jpeg', 0.8))
    fecharCamera()
  }

  function fecharCamera() {
    streamAtivo?.getTracks().forEach(t => t.stop())
    setStreamAtivo(null); setShowCamera(false)
  }

  function uploadFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { if (ev.target?.result) setFotoVendedor(ev.target.result as string) }
    reader.readAsDataURL(file)
  }

// ── Canvas de assinatura ──────────────────────────────────
function makeCanvasHandlers(ref: React.RefObject<HTMLCanvasElement | null>, setter: (v: string) => void) {
  let drawing = false
  return {
    onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => {
      drawing = true; const c = ref.current; if (!c) return
      const r = c.getBoundingClientRect(); const ctx = c.getContext('2d')!
      ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
    },
    onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawing) return; const c = ref.current; if (!c) return
      const r = c.getBoundingClientRect(); const ctx = c.getContext('2d')!
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke()
    },
    onMouseUp: () => { drawing = false; setter(ref.current?.toDataURL() ?? '') },
    onMouseLeave: () => { if (drawing) { drawing = false; setter(ref.current?.toDataURL() ?? '') } },
  }
}
// ── Limpar canvas de assinatura ───────────────────────────
function limparCanvas(ref: React.RefObject<HTMLCanvasElement | null>, setter: (v: string) => void) {
  const c = ref.current
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, c.width, c.height)
  setter('')
}
limparCanvas(vendCanvasRef, setAssinaturaVendedor)
  // ── Salvar compra ─────────────────────────────────────────
  async function salvarCompra() {
    if (!modeloSelecionado || !vNome.trim() || !vCPF.trim() || !cValor) return
    setSalvando(true)
    const endCompleto = [vEnd, vBairro, vCidade, vEstado].filter(Boolean).join(', ')

    const { data: ap } = await supabase.from('aparelhos').insert({
      tipo: cTipo, status: 'disponivel',
      marca: modeloSelecionado.marca, modelo: modeloSelecionado.modelo,
      capacidade: cCapacidade || null, cor: cCor || null,
      imei: cIMEI || null, imei2: cIMEI2 || null,
      aparelho_legal_url: cIMEI ? `https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}` : null,
      specs_json: modeloSelecionado,
      preco_compra: parseFloat(cValor), data_compra: new Date().toISOString().split('T')[0],
      checklist_json: cChecklist, checklist_nota: notaGeral(cChecklist),
      observacoes: cObs || null,
    }).select('id').single()

    if (!ap) { setSalvando(false); return }

    const { data: compra } = await supabase.from('aparelho_compras').insert({
      aparelho_id: ap.id,
      vendedor_nome: vNome, vendedor_cpf: vCPF, vendedor_rg: vRG || null,
      vendedor_tel: vTel || null, vendedor_email: vEmail || null,
      vendedor_end: endCompleto || vEnd, vendedor_cep: vCEP || null,
      valor_pago: parseFloat(cValor), forma_pagamento: cForma,
      assinatura_vendedor: assinaturaVendedor || null,
      assinatura_loja: assinaturaLoja || null,
      foto_vendedor: fotoVendedor || null,
    }).select('id,numero').single()

    if (compra) {
      await supabase.from('aparelhos').update({ compra_id: compra.id }).eq('id', ap.id)
      setCompraSalva({ id: compra.id, numero: compra.numero })
    }
    setSalvando(false); fetchAll()
  }

  // ── Salvar venda ──────────────────────────────────────────
  async function salvarVenda() {
    if (!aparelhoVenda || !bNome.trim() || !bCPF.trim() || !bValor) return
    setSalvando(true)
    const { data: venda } = await supabase.from('aparelho_vendas').insert({
      aparelho_id: aparelhoVenda.id,
      comprador_nome: bNome, comprador_cpf: bCPF,
      comprador_tel: bTel || null, comprador_email: bEmail || null,
      comprador_end: bEnd || null,
      valor_venda: parseFloat(bValor), forma_pagamento: bForma,
      garantia_dias: parseInt(bGarantia),
      assinatura_comprador: assinaturaComprador || null,
      assinatura_loja: assinaturaLoja || null,
    }).select('id,numero').single()
    if (venda) {
      await supabase.from('aparelhos').update({ status: 'vendido', venda_id: venda.id, preco_venda: parseFloat(bValor), data_venda: new Date().toISOString().split('T')[0] }).eq('id', aparelhoVenda.id)
      setVendaSalva({ id: venda.id, numero: venda.numero })
    }
    setSalvando(false); fetchAll()
  }

  // ── Imprimir termo ────────────────────────────────────────
  function gerarDocumento(tipo: 'compra' | 'venda') {
    const hoje = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })
    const specs = modeloSelecionado
    const endCompleto = [vEnd, vBairro ? `${vBairro}` : '', vCidade && vEstado ? `${vCidade} — ${vEstado}` : vCidade || vEstado].filter(Boolean).join(', ')

    const assVendHtml = assinaturaVendedor ? `<img src="${assinaturaVendedor}" class="sig-img" alt="Assinatura vendedor" />` : ''
    const assLojaHtml = assinaturaLoja     ? `<img src="${assinaturaLoja}"     class="sig-img" alt="Assinatura loja" />` : ''
    const assComprHtml = assinaturaComprador ? `<img src="${assinaturaComprador}" class="sig-img" alt="Assinatura comprador" />` : ''
    const fotoHtml = fotoVendedor ? `<img src="${fotoVendedor}" class="foto-vend" alt="Foto vendedor" />` : ''

    const html = tipo === 'compra' ? `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Termo de Compra #${compraSalva?.numero ?? ''}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@page { size: A4 portrait; margin: 18mm 20mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', Arial, sans-serif; font-size: 9pt; color: #1e293b; line-height: 1.6; }
.header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12pt; border-bottom: 2pt solid #0f172a; margin-bottom: 14pt; }
.brand h1 { font-size: 18pt; font-weight: 700; color: #0f172a; }
.brand p { font-size: 8pt; color: #64748b; }
.doc-title { font-size: 14pt; font-weight: 700; text-align: right; }
.doc-num { font-size: 9pt; color: #6366f1; font-weight: 600; text-align: right; }
.doc-date { font-size: 8pt; color: #94a3b8; text-align: right; }
section { margin-bottom: 12pt; }
.stitle { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6366f1; border-bottom: 1pt solid #e0e7ff; padding-bottom: 3pt; margin-bottom: 8pt; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5pt 16pt; }
.grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5pt 12pt; }
.field-label { font-size: 7.5pt; color: #94a3b8; font-weight: 500; }
.field-value { font-size: 9pt; font-weight: 600; border-bottom: 0.5pt solid #e2e8f0; padding-bottom: 1pt; min-height: 13pt; }
.specs-box { background: #f8fafc; padding: 7pt 9pt; border-radius: 4pt; }
.checklist-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 3pt; }
.ci { display: flex; justify-content: space-between; padding: 2.5pt 5pt; border-radius: 3pt; font-size: 7.5pt; }
.ci-bom     { background: #ecfdf5; color: #065f46; }
.ci-regular { background: #fef3c7; color: #92400e; }
.ci-ruim    { background: #fef2f2; color: #991b1b; }
.ci-na      { background: #f8fafc; color: #94a3b8; }
.legal { background: #f8fafc; border-left: 3pt solid #0f172a; padding: 9pt 12pt; font-size: 8.5pt; line-height: 1.75; }
.legal p { margin-bottom: 5pt; }
.sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; margin-top: 12pt; }
.sig-box {}
.sig-img { max-height: 45pt; max-width: 150pt; display: block; margin-bottom: 3pt; }
.sig-line { border-top: 1pt solid #0f172a; margin-bottom: 3pt; margin-top: 20pt; }
.sig-name { font-size: 8.5pt; font-weight: 600; }
.sig-role { font-size: 7pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
.footer-doc { border-top: 0.5pt solid #e2e8f0; padding-top: 7pt; font-size: 6.5pt; color: #94a3b8; text-align: center; margin-top: 12pt; }
.foto-vend { width: 60pt; height: 60pt; object-fit: cover; border-radius: 4pt; border: 1pt solid #e2e8f0; float: right; margin: 0 0 6pt 12pt; }
.nota-badge { display: inline-block; padding: 2pt 8pt; border-radius: 20pt; font-size: 8pt; font-weight: 700; ${notaGeral(cChecklist)==='Bom'?'background:#ecfdf5;color:#065f46':notaGeral(cChecklist)==='Regular'?'background:#fef3c7;color:#92400e':'background:#fef2f2;color:#991b1b'}; }
.valor-d { font-size: 14pt; font-weight: 700; color: #065f46; }
</style></head><body>

<div class="header">
  <div class="brand"><h1>📱 SOS Celulares</h1><p>Assistência Técnica</p></div>
  <div><div class="doc-title">TERMO DE COMPRA</div><div class="doc-num">Nº ${compraSalva?.numero ?? '—'}</div><div class="doc-date">${hoje}</div></div>
</div>

<section>
  <div class="stitle">Vendedor — Dados pessoais</div>
  ${fotoHtml}
  <div class="grid2">
    <div><div class="field-label">Nome completo</div><div class="field-value">${vNome}</div></div>
    <div><div class="field-label">CPF</div><div class="field-value">${formatCPF(vCPF)}</div></div>
    <div><div class="field-label">RG</div><div class="field-value">${vRG||'—'}</div></div>
    <div><div class="field-label">Telefone</div><div class="field-value">${vTel?formatPhone(vTel):'—'}</div></div>
    <div><div class="field-label">E-mail</div><div class="field-value">${vEmail||'—'}</div></div>
    <div><div class="field-label">CEP</div><div class="field-value">${vCEP||'—'}</div></div>
  </div>
  <div style="margin-top:5pt"><div class="field-label">Endereço completo</div><div class="field-value">${endCompleto||vEnd}</div></div>
</section>

<section>
  <div class="stitle">Aparelho — Identificação</div>
  <div class="grid3">
    <div><div class="field-label">Marca / Modelo</div><div class="field-value">${specs?.marca||''} ${specs?.modelo||modeloInput}</div></div>
    <div><div class="field-label">Capacidade</div><div class="field-value">${cCapacidade||'—'}</div></div>
    <div><div class="field-label">Cor</div><div class="field-value">${cCor||'—'}</div></div>
    <div><div class="field-label">IMEI 1</div><div class="field-value">${cIMEI||'—'}</div></div>
    <div><div class="field-label">IMEI 2</div><div class="field-value">${cIMEI2||'—'}</div></div>
    <div><div class="field-label">Estado geral</div><div class="field-value"><span class="nota-badge">${notaGeral(cChecklist)}</span></div></div>
  </div>
  ${cIMEI ? `<div style="margin-top:5pt;font-size:8pt">🔍 Consulta: <a href="https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}" style="color:#6366f1">aparelhoslegais.com.br/consulta?imei=${cIMEI}</a></div>` : ''}
</section>

${specs ? `<section>
  <div class="stitle">Especificações técnicas</div>
  <div class="specs-box"><div class="grid3">
    ${[['Tela',specs.tela],['Resolução',specs.resolucao],['Processador',specs.processador],['RAM',specs.ram],['Armazenamento',specs.armazenamento],['Câmera tras.',specs.camera_principal],['Câmera front.',specs.camera_frontal],['Bateria',specs.bateria],['Sistema',specs.sistema]].filter(([,v])=>v).map(([k,v])=>`<div><div class="field-label">${k}</div><div style="font-size:8.5pt;font-weight:600">${v}</div></div>`).join('')}
  </div></div>
</section>` : ''}

${cTipo==='usado'&&Object.keys(cChecklist).length>0?`<section>
  <div class="stitle">Checklist de estado do aparelho</div>
  <div class="checklist-grid">
    ${CHECKLIST_ITENS.filter(i=>cChecklist[i.key]).map(i=>{const v=cChecklist[i.key];const cls=v==='Bom'?'ci-bom':v==='Regular'?'ci-regular':v==='Ruim'?'ci-ruim':'ci-na';return`<div class="ci ${cls}"><span>${i.label}</span><b>${v}</b></div>`}).join('')}
  </div>
  ${cObs?`<div style="margin-top:5pt;font-size:8pt;background:#f8fafc;padding:5pt;border-radius:3pt"><b>Obs:</b> ${cObs}</div>`:''}
</section>`:''}

<section>
  <div class="stitle">Condições da compra</div>
  <div class="grid3">
    <div><div class="field-label">Valor pago</div><div class="valor-d">R$ ${parseFloat(cValor||'0').toFixed(2).replace('.',',')}</div></div>
    <div><div class="field-label">Forma de pagamento</div><div class="field-value">${cForma}</div></div>
    <div><div class="field-label">Data</div><div class="field-value">${hoje}</div></div>
  </div>
</section>

<div class="legal">
  <p><strong>DECLARAÇÃO E RESPONSABILIDADE DO VENDEDOR</strong></p>
  <p>Eu, <strong>${vNome}</strong>, portador(a) do CPF <strong>${formatCPF(vCPF)}</strong>${vRG?`, RG <strong>${vRG}</strong>`:''}${vEnd?`, residente em <strong>${endCompleto||vEnd}</strong>`:''},  declaro para todos os fins de direito que:</p>
  <p><strong>I.</strong> Sou o(a) legítimo(a) proprietário(a) do aparelho <strong>${specs?.marca||''} ${specs?.modelo||modeloInput}</strong>, IMEI <strong>${cIMEI||'—'}</strong>, e tenho plena capacidade legal para alienar o bem descrito neste instrumento.</p>
  <p><strong>II.</strong> O aparelho <strong>não possui origem ilícita</strong>, não foi obtido mediante furto (art. 155 CP), roubo (art. 157 CP), estelionato (art. 171 CP) ou qualquer conduta criminosa, e está livre de bloqueios, financiamentos, penhoras ou restrições que impeçam sua comercialização.</p>
  <p><strong>III.</strong> Assumo total responsabilidade civil e criminal por eventuais irregularidades, inclusive pelo crime de receptação (art. 180 CP), respondendo pessoalmente por quaisquer prejuízos causados a terceiros em decorrência de falsidade das informações ora prestadas.</p>
  <p><strong>IV.</strong> A loja <strong>SOS Celulares</strong> age de boa-fé, confiando nas declarações acima, sendo expressamente eximida de qualquer responsabilidade em caso de falsidade das informações prestadas pelo declarante.</p>
</div>

<div class="sig-row">
  <div class="sig-box">
    ${assVendHtml}
    <div class="sig-line"></div>
    <div class="sig-name">${vNome}</div>
    <div style="font-size:7.5pt;color:#64748b">CPF: ${formatCPF(vCPF)}</div>
    <div class="sig-role">Vendedor</div>
  </div>
  <div class="sig-box">
    ${assLojaHtml}
    <div class="sig-line"></div>
    <div class="sig-name">SOS Celulares</div>
    <div class="sig-role">Representante da Loja</div>
  </div>
</div>

<div class="footer-doc">Documento emitido em ${hoje} · SOS Celulares · Em conformidade com o Código Penal Brasileiro e CDC (Lei 8.078/90)</div>

<script>window.onload = () => window.print();<\/script>
</body></html>` : `<html><body><p>Termo de venda em construção</p><script>window.onload=()=>window.print()<\/script></body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank'); if (w) w.onload = () => URL.revokeObjectURL(url)
  }

  // ─── Filtros estoque
  const aparelhosFiltrados = aparelhos.filter(a => {
    if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false
    if (search && !`${a.marca} ${a.modelo}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ─── Handlers de canvas compartilhados ───────────────────
  const vendHandlers = makeCanvasHandlers(vendCanvasRef, setAssinaturaVendedor)
  const comprHandlers = makeCanvasHandlers(comprCanvasRef, setAssinaturaComprador)

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', width: '100%' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Compra & Venda de Aparelhos</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
            {aparelhos.filter(a => a.status === 'disponivel').length} disponíveis · {aparelhos.filter(a => a.status === 'vendido').length} vendidos
          </p>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        {([['estoque','📱 Estoque'],['comprar','⬇ Registrar compra'],['vender','⬆ Registrar venda']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba===k?600:400, border: 'none', background: 'none', cursor: 'pointer', color: aba===k?'#6366f1':'#64748b', borderBottom: aba===k?'2px solid #6366f1':'2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {/* ═══ ESTOQUE ═══ */}
      {aba === 'estoque' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo ou IMEI..." style={{ ...inp, flex: 1, minWidth: 180 }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="todos">Todos</option><option value="disponivel">Disponíveis</option><option value="vendido">Vendidos</option>
            </select>
          </div>
          {loading ? <div style={{ textAlign:'center',padding:60,color:'#94a3b8' }}>Carregando...</div> :
          aparelhosFiltrados.length === 0 ? (
            <div style={{ textAlign:'center',padding:60 }}>
              <div style={{ fontSize:40,marginBottom:12 }}>📱</div>
              <p style={{ fontSize:14,fontWeight:500,color:'#374151',marginBottom:12 }}>Nenhum aparelho no estoque</p>
              <button onClick={() => setAba('comprar')} style={{ padding:'9px 18px',background:'#6366f1',color:'#fff',border:'none',borderRadius:8,fontSize:13,cursor:'pointer' }}>+ Registrar compra</button>
            </div>
          ) : (
            <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
                  {['Aparelho','IMEI','Estado','Compra','Venda','Lucro','Status',''].map(h => <th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {aparelhosFiltrados.map(a => {
                    const st = STATUS_CFG[a.status] ?? STATUS_CFG.disponivel
                    const lucro = a.preco_venda && a.preco_compra ? a.preco_venda - a.preco_compra : null
                    return (
                      <tr key={a.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'10px 14px' }}>
                          <p style={{ fontWeight:500,color:'#0f172a' }}>{a.marca} {a.modelo}</p>
                          {a.capacidade && <p style={{ fontSize:11,color:'#94a3b8' }}>{a.capacidade}{a.cor?` · ${a.cor}`:''}</p>}
                        </td>
                        <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:'#64748b' }}>
                          {a.imei ? <a href={`https://www.aparelhoslegais.com.br/consulta?imei=${a.imei}`} target="_blank" rel="noopener noreferrer" style={{ color:'#6366f1',textDecoration:'none' }}>{a.imei} 🔍</a> : '—'}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          {a.checklist_nota ? <span style={{ fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:20,background:a.checklist_nota==='Bom'?'#ecfdf5':a.checklist_nota==='Regular'?'#fef3c7':'#fef2f2',color:a.checklist_nota==='Bom'?'#065f46':a.checklist_nota==='Regular'?'#92400e':'#991b1b' }}>{a.checklist_nota}</span> : '—'}
                        </td>
                        <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:'#374151' }}>{a.preco_compra?fm(a.preco_compra):'—'}</td>
                        <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:'#374151' }}>{a.preco_venda?fm(a.preco_venda):'—'}</td>
                        <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,fontWeight:lucro&&lucro>0?600:400,color:lucro&&lucro>0?'#065f46':lucro&&lucro<0?'#991b1b':'#94a3b8' }}>{lucro!==null?fm(lucro):'—'}</td>
                        <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:20,background:st.bg,color:st.color }}>{st.label}</span></td>
                        <td style={{ padding:'10px 14px' }}>
                          {a.status==='disponivel' && <button onClick={() => { setAparelhoVenda(a); setAba('vender') }} style={{ fontSize:12,padding:'5px 12px',border:'1px solid #e0e7ff',borderRadius:7,background:'#eef2ff',cursor:'pointer',color:'#4338ca',fontWeight:500 }}>Vender →</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ COMPRAR ═══ */}
      {aba === 'comprar' && (
        <div style={{ maxWidth: 820 }}>
          {compraSalva && (
            <div style={{ background:'#ecfdf5',border:'1px solid #bbf7d0',borderRadius:12,padding:'20px 24px',marginBottom:20 }}>
              <p style={{ fontSize:15,fontWeight:600,color:'#065f46',marginBottom:12 }}>✅ Compra #{compraSalva.numero} registrada!</p>
              <div style={{ display:'flex',gap:10 }}>
                <button onClick={() => gerarDocumento('compra')} style={{ padding:'9px 18px',border:'1px solid #86efac',borderRadius:8,fontSize:13,background:'#fff',cursor:'pointer',color:'#065f46',fontWeight:500 }}>🖨 Imprimir termo</button>
                <button onClick={() => { setCompraSalva(null); setModeloInput(''); setModeloSelecionado(null); setCIMEI(''); setCIMEI2(''); setCCor(''); setCCapacidade(''); setCObs(''); setCChecklist({}); setCValor(''); setVNome(''); setVCPF(''); setVRG(''); setVTel(''); setVEmail(''); setVCEP(''); setVEnd(''); setVBairro(''); setVCidade(''); setVEstado(''); setAssinaturaVendedor(''); setFotoVendedor(''); limparCanvas(vendCanvasRef, setAssinaturaVendedor) }} style={{ padding:'9px 18px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,background:'#fff',cursor:'pointer',color:'#374151' }}>Nova compra</button>
              </div>
            </div>
          )}

          {/* Tipo */}
          <div style={card}>
            <p style={sec}>Tipo de aparelho</p>
            <div style={{ display:'flex',gap:10 }}>
              {(['usado','novo'] as const).map(t => (
                <button key={t} onClick={() => setCTipo(t)} style={{ flex:1,padding:'12px',borderRadius:10,border:`2px solid ${cTipo===t?'#6366f1':'#e2e8f0'}`,background:cTipo===t?'#eef2ff':'#fff',cursor:'pointer',fontSize:13,fontWeight:cTipo===t?600:400,color:cTipo===t?'#3730a3':'#374151' }}>
                  {t==='usado'?'📱 Aparelho usado':'🆕 Aparelho novo'}
                </button>
              ))}
            </div>
          </div>

          {/* Modelo — busca no banco */}
          <div style={card}>
            <p style={sec}>Identificação do aparelho</p>
            <div style={{ position:'relative',marginBottom:14 }}>
              <label style={lbl}>Modelo do aparelho *</label>
              <div style={{ display:'flex',gap:10 }}>
                <div style={{ flex:1,position:'relative' }}>
                  <input style={inp} value={modeloInput} onChange={e => onModeloChange(e.target.value)} placeholder="Ex: Samsung Galaxy A55, iPhone 15 Pro, Redmi 13C..." autoComplete="off" />
                  {showSugestoes && modeloSugestoes.length > 0 && (
                    <div style={{ position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:'#fff',border:'1px solid #e2e8f0',borderRadius:9,boxShadow:'0 8px 24px rgba(0,0,0,0.1)',marginTop:4,overflow:'hidden' }}>
                      {modeloSugestoes.map(d => (
                        <div key={d.id} onClick={() => selecionarModelo(d)} style={{ padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center' }}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f5f3ff'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff'}}>
                          <div>
                            <p style={{ fontSize:13,fontWeight:500,color:'#0f172a' }}>{d.marca} {d.modelo}</p>
                            <p style={{ fontSize:11,color:'#94a3b8' }}>{[d.ram,d.armazenamento,d.tela].filter(Boolean).join(' · ')}</p>
                          </div>
                          {d.lancamento && <span style={{ fontSize:11,color:'#94a3b8' }}>{d.lancamento}</span>}
                        </div>
                      ))}
                      <div onClick={buscarSpecs} style={{ padding:'9px 14px',cursor:'pointer',background:'#f0f4ff',fontSize:12,color:'#4338ca',fontWeight:500,display:'flex',alignItems:'center',gap:6 }}>
                        🔍 Não encontrado — buscar online
                      </div>
                    </div>
                  )}
                </div>
                {!showSugestoes && (
                  <button onClick={buscarSpecs} disabled={buscandoSpecs || !modeloInput.trim()} style={{ padding:'9px 16px',background:buscandoSpecs?'#a5b4fc':'#6366f1',color:'#fff',border:'none',borderRadius:8,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',fontWeight:500 }}>
                    {buscandoSpecs?'⏳ Buscando...':'🔍 Buscar specs'}
                  </button>
                )}
              </div>
            </div>

            {modeloSelecionado && (
              <div style={{ background:'#f0f4ff',border:'1px solid #c7d2fe',borderRadius:10,padding:'12px 16px',marginBottom:14 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                  <p style={{ fontSize:13,fontWeight:600,color:'#3730a3' }}>✓ {modeloSelecionado.marca} {modeloSelecionado.modelo}</p>
                  {modeloSelecionado.lancamento && <span style={{ fontSize:11,color:'#6366f1' }}>{modeloSelecionado.lancamento}</span>}
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8 }}>
                  {[['Tela',modeloSelecionado.tela],['RAM',modeloSelecionado.ram],['Armazenamento',modeloSelecionado.armazenamento],['Processador',modeloSelecionado.processador],['Câmera tras.',modeloSelecionado.camera_principal],['Câmera front.',modeloSelecionado.camera_frontal],['Bateria',modeloSelecionado.bateria],['Sistema',modeloSelecionado.sistema]].filter(([,v])=>v).map(([k,v]) => (
                    <div key={k as string}><p style={{ fontSize:10,color:'#6366f1',fontWeight:500 }}>{k}</p><p style={{ fontSize:12,color:'#1e293b',fontWeight:500 }}>{v}</p></div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12 }}>
              <div><label style={lbl}>Capacidade</label><input style={inp} value={cCapacidade} onChange={e => setCCapacidade(e.target.value)} placeholder="Ex: 128GB / 64GB/128GB" /></div>
              <div><label style={lbl}>Cor</label><input style={inp} value={cCor} onChange={e => setCCor(e.target.value)} placeholder="Ex: Midnight Black" /></div>
              <div><label style={lbl}>Senha do aparelho</label><input style={inp} value={cSenha} onChange={e => setCScenha(e.target.value)} placeholder="PIN, senha, padrão..." /></div>
              <div>
                <label style={lbl}>IMEI 1</label>
                <input style={inp} value={cIMEI} onChange={e => setCIMEI(e.target.value)} placeholder="15 dígitos" maxLength={15} />
                {cIMEI.length===15 && <a href={`https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:11,color:'#6366f1',textDecoration:'none',display:'block',marginTop:3 }}>🔍 Consultar Aparelhos Legais →</a>}
              </div>
              <div><label style={lbl}>IMEI 2 (dual SIM)</label><input style={inp} value={cIMEI2} onChange={e => setCIMEI2(e.target.value)} placeholder="Opcional" maxLength={15} /></div>
            </div>
          </div>

          {/* Checklist */}
          {cTipo === 'usado' && (
            <div style={card}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                <p style={sec}>Checklist de estado</p>
                {Object.keys(cChecklist).length > 0 && (
                  <span style={{ fontSize:12,fontWeight:600,padding:'3px 12px',borderRadius:20,background:notaGeral(cChecklist)==='Bom'?'#ecfdf5':notaGeral(cChecklist)==='Regular'?'#fef3c7':'#fef2f2',color:notaGeral(cChecklist)==='Bom'?'#065f46':notaGeral(cChecklist)==='Regular'?'#92400e':'#991b1b' }}>
                    Geral: {notaGeral(cChecklist)}
                  </span>
                )}
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8 }}>
                {CHECKLIST_ITENS.map(item => (
                  <div key={item.key} style={{ border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 10px' }}>
                    <p style={{ fontSize:12,fontWeight:500,color:'#374151',marginBottom:6 }}>{item.label}</p>
                    <div style={{ display:'flex',gap:4 }}>
                      {ESTADOS.map(e => (
                        <button key={e.v} onClick={() => setChecklistItem(item.key, e.v)} style={{ flex:1,padding:'4px 2px',borderRadius:5,border:`1px solid ${cChecklist[item.key]===e.v?e.border:'#e2e8f0'}`,background:cChecklist[item.key]===e.v?e.bg:'#fff',color:cChecklist[item.key]===e.v?e.color:'#94a3b8',fontSize:10,fontWeight:cChecklist[item.key]===e.v?600:400,cursor:'pointer' }}>{e.v}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:12 }}>
                <label style={lbl}>Observações</label>
                <textarea style={{ ...inp,minHeight:60,resize:'vertical' }} value={cObs} onChange={e => setCObs(e.target.value)} placeholder="Arranhões, detalhes relevantes..." />
              </div>
            </div>
          )}

          {/* Dados do vendedor */}
          <div style={card}>
            <p style={sec}>Dados do vendedor</p>

            {/* Foto do vendedor */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Foto do vendedor / documento</label>
              <div style={{ display:'flex',gap:10,alignItems:'flex-start' }}>
                {fotoVendedor ? (
                  <div style={{ position:'relative' }}>
                    <img src={fotoVendedor} style={{ width:80,height:80,objectFit:'cover',borderRadius:8,border:'1px solid #e2e8f0' }} alt="Foto" />
                    <button onClick={() => setFotoVendedor('')} style={{ position:'absolute',top:-6,right:-6,width:20,height:20,borderRadius:'50%',background:'#ef4444',color:'#fff',border:'none',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
                  </div>
                ) : null}
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  <button onClick={abrirCamera} style={{ padding:'8px 14px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,cursor:'pointer',background:'#f8fafc',color:'#374151',display:'flex',alignItems:'center',gap:6 }}>
                    <i className="ti ti-camera" style={{ fontSize:14 }} /> Câmera / Webcam
                  </button>
                  <label style={{ padding:'8px 14px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,cursor:'pointer',background:'#f8fafc',color:'#374151',display:'flex',alignItems:'center',gap:6 }}>
                    <i className="ti ti-upload" style={{ fontSize:14 }} /> Upload de arquivo
                    <input type="file" accept="image/*" style={{ display:'none' }} onChange={uploadFoto} />
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Nome completo *</label><input style={inp} value={vNome} onChange={e => setVNome(e.target.value)} /></div>
              <div><label style={lbl}>CPF *</label><input style={inp} value={vCPF} onChange={e => setVCPF(formatCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} /></div>
              <div><label style={lbl}>RG</label><input style={inp} value={vRG} onChange={e => setVRG(e.target.value)} /></div>
              <div><label style={lbl}>Telefone</label><input style={inp} value={vTel} onChange={e => setVTel(formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} /></div>
              <div><label style={lbl}>E-mail</label><input style={inp} value={vEmail} onChange={e => setVEmail(e.target.value)} /></div>
            </div>
            {/* CEP com busca automática */}
            <div style={{ marginTop:12 }}>
              <label style={lbl}>CEP</label>
              <div style={{ display:'flex',gap:8 }}>
                <input style={{ ...inp,maxWidth:150 }} value={vCEP} onChange={e => { setVCEP(formatCEP(e.target.value)); if (e.target.value.replace(/\D/g,'').length===8) buscarCEP(e.target.value) }} placeholder="00000-000" maxLength={9} />
                {buscandoCEP && <span style={{ fontSize:12,color:'#6366f1',alignSelf:'center' }}>⏳ Buscando...</span>}
              </div>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12 }}>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Logradouro *</label><input style={inp} value={vEnd} onChange={e => setVEnd(e.target.value)} placeholder="Rua, Av..." /></div>
              <div><label style={lbl}>Bairro</label><input style={inp} value={vBairro} onChange={e => setVBairro(e.target.value)} /></div>
              <div><label style={lbl}>Cidade</label><input style={inp} value={vCidade} onChange={e => setVCidade(e.target.value)} /></div>
              <div><label style={lbl}>Estado</label><input style={{ ...inp,maxWidth:80 }} value={vEstado} onChange={e => setVEstado(e.target.value)} maxLength={2} /></div>
            </div>
          </div>

          {/* Pagamento */}
          <div style={card}>
            <p style={sec}>Condições de pagamento</p>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div><label style={lbl}>Valor pago (R$) *</label><input style={{ ...inp,fontSize:18,fontWeight:600 }} type="number" step="0.01" value={cValor} onChange={e => setCValor(e.target.value)} placeholder="0,00" /></div>
              <div><label style={lbl}>Forma de pagamento</label><select style={inp} value={cForma} onChange={e => setCForma(e.target.value)}>{FORMAS_PGTO.map(f=><option key={f}>{f}</option>)}</select></div>
            </div>
          </div>

          {/* Assinaturas */}
          <div style={card}>
            <p style={sec}>Assinatura do vendedor</p>
            <p style={{ fontSize:12,color:'#64748b',marginBottom:10 }}>O vendedor deve assinar para confirmar as declarações do termo.</p>
            <div style={{ border:'1px solid #e2e8f0',borderRadius:8,background:'#fafafa',display:'inline-block',position:'relative' }}>
              <canvas ref={vendCanvasRef} width={480} height={110} style={{ display:'block',cursor:'crosshair',borderRadius:8 }}
                onMouseDown={vendHandlers.onMouseDown} onMouseMove={vendHandlers.onMouseMove} onMouseUp={vendHandlers.onMouseUp} onMouseLeave={vendHandlers.onMouseLeave} />
              {!assinaturaVendedor && <p style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',color:'#cbd5e1',fontSize:12,pointerEvents:'none',userSelect:'none' }}>Assinar aqui...</p>}
            </div>
            {assinaturaVendedor && <button onClick={() => limparCanvas(vendCanvasRef, setAssinaturaVendedor)} style={{ marginLeft:10,fontSize:12,color:'#ef4444',background:'none',border:'none',cursor:'pointer' }}>Limpar</button>}
            {assinaturaLoja && (
              <div style={{ marginTop:12 }}>
                <p style={{ fontSize:11,color:'#64748b',marginBottom:6 }}>Assinatura do responsável da loja (configurada em Configurações):</p>
                <img src={assinaturaLoja} style={{ height:50,border:'1px solid #e2e8f0',borderRadius:6,background:'#fafafa',padding:4 }} alt="Assinatura loja" />
              </div>
            )}
          </div>

          <button onClick={salvarCompra} disabled={salvando || !modeloSelecionado || !vNome.trim() || !vCPF.trim() || !cValor} style={{ width:'100%',padding:'14px',background:salvando||!modeloSelecionado||!vNome.trim()||!vCPF.trim()||!cValor?'#e2e8f0':'#6366f1',color:salvando||!modeloSelecionado||!vNome.trim()||!vCPF.trim()||!cValor?'#94a3b8':'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer' }}>
            {!modeloSelecionado ? '⬆ Selecione o aparelho' : salvando ? 'Salvando...' : '✓ Registrar compra'}
          </button>
        </div>
      )}

      {/* ═══ VENDER ═══ */}
      {aba === 'vender' && (
        <div style={{ maxWidth: 820 }}>
          {vendaSalva ? (
            <div style={{ background:'#ecfdf5',border:'1px solid #bbf7d0',borderRadius:12,padding:'20px 24px',marginBottom:20 }}>
              <p style={{ fontSize:15,fontWeight:600,color:'#065f46',marginBottom:12 }}>✅ Venda #{vendaSalva.numero} registrada!</p>
              <div style={{ display:'flex',gap:10 }}>
                <button onClick={() => setVendaSalva(null)} style={{ padding:'9px 18px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,background:'#fff',cursor:'pointer',color:'#374151' }}>Nova venda</button>
              </div>
            </div>
          ) : null}
          {!aparelhoVenda ? (
            <div style={card}>
              <p style={sec}>Selecionar aparelho para venda</p>
              {aparelhos.filter(a=>a.status==='disponivel').length === 0 ? <p style={{ textAlign:'center',padding:30,color:'#94a3b8' }}>Nenhum disponível.</p> :
                aparelhos.filter(a=>a.status==='disponivel').map(a => (
                  <div key={a.id} onClick={() => setAparelhoVenda(a)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',border:'1px solid #e2e8f0',borderRadius:10,cursor:'pointer',marginBottom:8,background:'#fff' }}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f5f3ff'}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff'}}>
                    <div><p style={{ fontWeight:500,color:'#0f172a' }}>{a.marca} {a.modelo}</p><p style={{ fontSize:12,color:'#94a3b8' }}>{a.capacidade}{a.cor?` · ${a.cor}`:''}{a.imei?` · ${a.imei}`:''}</p></div>
                    <p style={{ fontSize:13,fontWeight:600,color:'#6366f1' }}>Comprado por {a.preco_compra?fm(a.preco_compra):'—'}</p>
                  </div>
                ))
              }
            </div>
          ) : (
            <>
              <div style={{ ...card,background:'#f0f4ff',border:'1px solid #c7d2fe' }}>
                <div style={{ display:'flex',justifyContent:'space-between' }}>
                  <div><p style={{ fontSize:15,fontWeight:600,color:'#3730a3' }}>{aparelhoVenda.marca} {aparelhoVenda.modelo}</p><p style={{ fontSize:12,color:'#6366f1',marginTop:2 }}>{aparelhoVenda.capacidade}{aparelhoVenda.cor?` · ${aparelhoVenda.cor}`:''}</p></div>
                  <button onClick={() => setAparelhoVenda(null)} style={{ fontSize:12,color:'#6366f1',background:'none',border:'none',cursor:'pointer' }}>Trocar →</button>
                </div>
              </div>
              <div style={card}>
                <p style={sec}>Dados do comprador</p>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                  <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Nome completo *</label><input style={inp} value={bNome} onChange={e => setBNome(e.target.value)} /></div>
                  <div><label style={lbl}>CPF *</label><input style={inp} value={bCPF} onChange={e => setBCPF(formatCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} /></div>
                  <div><label style={lbl}>Telefone</label><input style={inp} value={bTel} onChange={e => setBTel(formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} /></div>
                  <div><label style={lbl}>E-mail</label><input style={inp} value={bEmail} onChange={e => setBEmail(e.target.value)} /></div>
                  <div><label style={lbl}>Endereço</label><input style={inp} value={bEnd} onChange={e => setBEnd(e.target.value)} /></div>
                </div>
              </div>
              <div style={card}>
                <p style={sec}>Condições de venda</p>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12 }}>
                  <div><label style={lbl}>Valor de venda (R$) *</label>
                    <input style={{ ...inp,fontSize:18,fontWeight:600 }} type="number" step="0.01" value={bValor} onChange={e => setBValor(e.target.value)} placeholder="0,00" />
                    {bValor && aparelhoVenda.preco_compra && <p style={{ fontSize:11,marginTop:4,fontWeight:500,color:parseFloat(bValor)>aparelhoVenda.preco_compra?'#065f46':'#991b1b' }}>{parseFloat(bValor)>aparelhoVenda.preco_compra?`✓ Lucro: ${fm(parseFloat(bValor)-aparelhoVenda.preco_compra)}`:`⚠ Prejuízo: ${fm(aparelhoVenda.preco_compra-parseFloat(bValor))}`}</p>}
                  </div>
                  <div><label style={lbl}>Forma de pagamento</label><select style={inp} value={bForma} onChange={e => setBForma(e.target.value)}>{FORMAS_PGTO.map(f=><option key={f}>{f}</option>)}</select></div>
                  <div><label style={lbl}>Garantia (dias)</label><input style={inp} type="number" value={bGarantia} onChange={e => setBGarantia(e.target.value)} /></div>
                </div>
              </div>
              <div style={card}>
                <p style={sec}>Assinatura do comprador</p>
                <div style={{ border:'1px solid #e2e8f0',borderRadius:8,background:'#fafafa',display:'inline-block',position:'relative' }}>
                  <canvas ref={comprCanvasRef} width={480} height={110} style={{ display:'block',cursor:'crosshair',borderRadius:8 }}
                    onMouseDown={comprHandlers.onMouseDown} onMouseMove={comprHandlers.onMouseMove} onMouseUp={comprHandlers.onMouseUp} onMouseLeave={comprHandlers.onMouseLeave} />
                  {!assinaturaComprador && <p style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',color:'#cbd5e1',fontSize:12,pointerEvents:'none' }}>Assinar aqui...</p>}
                </div>
                {assinaturaComprador && <button onClick={() => limparCanvas(comprCanvasRef, setAssinaturaComprador)} style={{ marginLeft:10,fontSize:12,color:'#ef4444',background:'none',border:'none',cursor:'pointer' }}>Limpar</button>}
                {assinaturaLoja && <div style={{ marginTop:12 }}><p style={{ fontSize:11,color:'#64748b',marginBottom:6 }}>Assinatura da loja:</p><img src={assinaturaLoja} style={{ height:50,border:'1px solid #e2e8f0',borderRadius:6,padding:4 }} alt="Assinatura loja" /></div>}
              </div>
              <button onClick={salvarVenda} disabled={salvando||!bNome.trim()||!bCPF.trim()||!bValor} style={{ width:'100%',padding:'14px',background:salvando||!bNome.trim()||!bCPF.trim()||!bValor?'#e2e8f0':'#6366f1',color:salvando||!bNome.trim()||!bCPF.trim()||!bValor?'#94a3b8':'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer' }}>
                {salvando?'Salvando...':'✓ Registrar venda'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal câmera */}
      {showCamera && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:200 }}>
          <video ref={videoRef} autoPlay playsInline style={{ maxWidth:'90vw',maxHeight:'70vh',borderRadius:12 }} />
          <canvas ref={fotoCanvasRef} style={{ display:'none' }} />
          <div style={{ display:'flex',gap:12,marginTop:20 }}>
            <button onClick={tirarFoto} style={{ padding:'12px 28px',background:'#fff',color:'#0f172a',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer' }}>📸 Tirar foto</button>
            <button onClick={fecharCamera} style={{ padding:'12px 28px',background:'rgba(255,255,255,0.15)',color:'#fff',border:'1px solid rgba(255,255,255,0.3)',borderRadius:10,fontSize:14,cursor:'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Função auxiliar — deve estar fora do componente
function makeCanvasHandlers(ref: React.RefObject<HTMLCanvasElement>, setter: (v: string) => void) {
  let drawing = false
  return {
    onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => {
      drawing = true; const c = ref.current; if (!c) return
      const r = c.getBoundingClientRect(); const ctx = c.getContext('2d')!
      ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
    },
    onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawing) return; const c = ref.current; if (!c) return
      const r = c.getBoundingClientRect(); const ctx = c.getContext('2d')!
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke()
    },
    onMouseUp: () => { drawing = false; setter(ref.current?.toDataURL() ?? '') },
    onMouseLeave: () => { if (drawing) { drawing = false; setter(ref.current?.toDataURL() ?? '') } },
  }
}
