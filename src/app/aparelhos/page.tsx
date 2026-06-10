'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Tipos ───────────────────────────────────────────────
type Aparelho = {
  id: string; tipo: string; status: string
  marca: string; modelo: string; capacidade: string | null; cor: string | null
  imei: string | null; imei2: string | null
  aparelho_legal_url: string | null; aparelho_legal_status: string | null
  specs_json: Record<string, any>
  preco_compra: number | null; preco_venda: number | null
  data_compra: string | null; data_venda: string | null
  checklist_json: Record<string, string>; checklist_nota: string | null
  observacoes: string | null; created_at: string
  aparelho_compras: { vendedor_nome: string; valor_pago: number } | null
}

type DeviceSpec = {
  marca: string; modelo: string; tela: string; resolucao: string
  processador: string; ram: string; armazenamento: string
  camera_principal: string; camera_frontal: string
  bateria: string; sistema: string; dimensoes: string; peso: string
}

// ─── Checklist ────────────────────────────────────────────
const CHECKLIST_ITENS = [
  { key: 'tela',         label: 'Tela / Display' },
  { key: 'touch',        label: 'Touch / Resposta tátil' },
  { key: 'bateria',      label: 'Bateria / Autonomia' },
  { key: 'carregamento', label: 'Carregamento / Conector' },
  { key: 'camera_tras',  label: 'Câmera traseira' },
  { key: 'camera_front', label: 'Câmera frontal' },
  { key: 'alto_falante', label: 'Alto-falante / Som' },
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

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }
const sec: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em' }

function formatCPF(v: string) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2') }
function formatPhone(v: string) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4,5})(\d{4})$/,'$1-$2') }

// ─── Busca specs via API pública ───────────────────────────
async function buscarSpecs(modelo: string): Promise<DeviceSpec | null> {
  try {
    const response = await fetch(
      `https://api.anthropic.com/v1/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Retorne as especificações técnicas do aparelho "${modelo}" em JSON puro, sem markdown, sem explicação. Formato exato:
{"marca":"","modelo":"","tela":"","resolucao":"","processador":"","ram":"","armazenamento":"","camera_principal":"","camera_frontal":"","bateria":"","sistema":"","dimensoes":"","peso":""}
Se houver variantes de armazenamento (ex: 64GB/128GB), coloque separadas por barra. Se não encontrar o modelo, retorne null.`
          }]
        })
      }
    )
    const data = await response.json()
    const text = data.content?.[0]?.text?.trim()
    if (!text || text === 'null') return null
    return JSON.parse(text)
  } catch { return null }
}

// ─── Componente principal ─────────────────────────────────
export default function AparelhoPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'estoque'|'comprar'|'vender'>('estoque')
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [search, setSearch] = useState('')

  // Form compra
  const [cTipo, setCTipo] = useState<'novo'|'usado'>('usado')
  const [cModelo, setCModelo] = useState('')
  const [cSpecs, setCSpecs] = useState<DeviceSpec | null>(null)
  const [buscandoSpecs, setBuscandoSpecs] = useState(false)
  const [cIMEI, setCIMEI] = useState('')
  const [cIMEI2, setCIMEI2] = useState('')
  const [cCor, setCCor] = useState('')
  const [cCapacidade, setCCapacidade] = useState('')
  const [cSenha, setCSenha] = useState('')
  const [cChecklist, setCChecklist] = useState<Record<string,string>>({})
  const [cObs, setCObs] = useState('')
  const [cValor, setCValor] = useState('')
  const [cForma, setCForma] = useState('Dinheiro')
  // Vendedor
  const [vNome, setVNome] = useState('')
  const [vCPF, setVCPF] = useState('')
  const [vRG, setVRG] = useState('')
  const [vTel, setVTel] = useState('')
  const [vEmail, setVEmail] = useState('')
  const [vEnd, setVEnd] = useState('')
  const [vCEP, setVCEP] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [compraSalva, setCompraSalva] = useState<{id:string;numero:number;aparelhoId:string}|null>(null)

  // Venda
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

  // Assinatura canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [desenhando, setDesenhando] = useState(false)
  const [assinatura, setAssinatura] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('aparelhos')
      .select('*,aparelho_compras(vendedor_nome,valor_pago)')
      .is('deleted_at', null).order('created_at', { ascending: false })
    setAparelhos((data ?? []) as unknown as Aparelho[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleBuscarSpecs() {
    if (!cModelo.trim()) return
    setBuscandoSpecs(true)
    const specs = await buscarSpecs(cModelo)
    setCSpecs(specs)
    if (specs) { setCCapacidade(specs.armazenamento) }
    setBuscandoSpecs(false)
  }

  function setChecklistItem(key: string, val: string) {
    setCChecklist(prev => ({ ...prev, [key]: val }))
  }

  function notaGeral(cl: Record<string,string>): string {
    const vals = Object.values(cl).filter(v => v && v !== 'N/A')
    if (vals.length === 0) return 'Não avaliado'
    const ruim = vals.filter(v => v === 'Ruim').length
    const regular = vals.filter(v => v === 'Regular').length
    if (ruim > 2) return 'Ruim'
    if (ruim > 0 || regular > 3) return 'Regular'
    return 'Bom'
  }

  async function salvarCompra() {
    if (!cModelo.trim() || !vNome.trim() || !vCPF.trim() || !vEnd.trim() || !cValor) return
    setSalvando(true)

    // Criar aparelho
    const { data: ap } = await supabase.from('aparelhos').insert({
      tipo: cTipo, status: 'disponivel',
      marca: cSpecs?.marca || cModelo.split(' ')[0],
      modelo: cSpecs?.modelo || cModelo,
      capacidade: cCapacidade || null,
      cor: cCor || null,
      imei: cIMEI || null, imei2: cIMEI2 || null,
      aparelho_legal_url: cIMEI ? `https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}` : null,
      specs_json: cSpecs || {},
      preco_compra: parseFloat(cValor),
      data_compra: new Date().toISOString().split('T')[0],
      checklist_json: cChecklist,
      checklist_nota: notaGeral(cChecklist),
      observacoes: cObs || null,
    }).select('id').single()

    if (!ap) { setSalvando(false); return }

    // Criar compra
    const { data: compra } = await supabase.from('aparelho_compras').insert({
      aparelho_id: ap.id,
      vendedor_nome: vNome, vendedor_cpf: vCPF, vendedor_rg: vRG || null,
      vendedor_tel: vTel || null, vendedor_email: vEmail || null,
      vendedor_end: vEnd, vendedor_cep: vCEP || null,
      valor_pago: parseFloat(cValor), forma_pagamento: cForma,
      assinatura_vendedor: assinatura || null,
    }).select('id,numero').single()

    if (compra) {
      await supabase.from('aparelhos').update({ compra_id: compra.id }).eq('id', ap.id)
      setCompraSalva({ id: compra.id, numero: compra.numero, aparelhoId: ap.id })
    }
    setSalvando(false); fetchAll()
  }

  async function salvarVenda() {
    if (!aparelhoVenda || !bNome.trim() || !bCPF.trim() || !bValor) return
    setSalvando(true)

    const { data: venda } = await supabase.from('aparelho_vendas').insert({
      aparelho_id: aparelhoVenda.id,
      comprador_nome: bNome, comprador_cpf: bCPF,
      comprador_tel: bTel || null, comprador_email: bEmail || null,
      comprador_end: bEnd || null,
      valor_venda: parseFloat(bValor),
      forma_pagamento: bForma,
      garantia_dias: parseInt(bGarantia),
      assinatura_comprador: assinatura || null,
    }).select('id,numero').single()

    if (venda) {
      await supabase.from('aparelhos').update({ status: 'vendido', venda_id: venda.id, preco_venda: parseFloat(bValor), data_venda: new Date().toISOString().split('T')[0] }).eq('id', aparelhoVenda.id)
      setVendaSalva({ id: venda.id, numero: venda.numero })
    }
    setSalvando(false); fetchAll()
  }

  function gerarDocumento(tipo: 'compra' | 'venda') {
    const cfgLoja = { nome: 'SOS Celulares', cnpj: '', end: '', tel: '' }
    const hoje = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })
    const specs = cSpecs

    let html = ''
    if (tipo === 'compra') {
      html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de Compra</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@page { size: A4 portrait; margin: 18mm 20mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', Arial, sans-serif; font-size: 9pt; color: #1e293b; line-height: 1.6; }
.header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12pt; border-bottom: 2pt solid #0f172a; margin-bottom: 14pt; }
.logo-area h1 { font-size: 18pt; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; }
.logo-area p { font-size: 8pt; color: #64748b; margin-top: 2pt; }
.doc-info { text-align: right; }
.doc-title { font-size: 14pt; font-weight: 700; color: #1e293b; }
.doc-num { font-size: 9pt; color: #6366f1; font-weight: 600; margin-top: 2pt; }
.doc-date { font-size: 8pt; color: #94a3b8; margin-top: 2pt; }
.section { margin-bottom: 14pt; }
.section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6366f1; border-bottom: 1pt solid #e0e7ff; padding-bottom: 3pt; margin-bottom: 8pt; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 16pt; }
.grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6pt 12pt; }
.field { margin-bottom: 4pt; }
.field-label { font-size: 7.5pt; color: #94a3b8; font-weight: 500; }
.field-value { font-size: 9pt; font-weight: 600; color: #0f172a; border-bottom: 0.5pt solid #e2e8f0; padding-bottom: 1.5pt; }
.specs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4pt 12pt; background: #f8fafc; border-radius: 4pt; padding: 8pt; }
.checklist-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4pt 8pt; }
.check-item { display: flex; justify-content: space-between; align-items: center; padding: 3pt 6pt; border-radius: 3pt; font-size: 8pt; }
.check-bom     { background: #ecfdf5; color: #065f46; }
.check-regular { background: #fef3c7; color: #92400e; }
.check-ruim    { background: #fef2f2; color: #991b1b; }
.check-na      { background: #f8fafc; color: #94a3b8; }
.legal-box { background: #f8fafc; border-left: 3pt solid #0f172a; padding: 10pt 12pt; font-size: 8.5pt; line-height: 1.7; margin-bottom: 12pt; }
.legal-box p { margin-bottom: 6pt; }
.legal-box p:last-child { margin-bottom: 0; }
.sign-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16pt; margin-top: 14pt; }
.sign-box { }
.sign-line { border-top: 1pt solid #0f172a; margin-bottom: 4pt; margin-top: 24pt; }
.sign-name { font-size: 8.5pt; font-weight: 600; }
.sign-cpf { font-size: 7.5pt; color: #64748b; }
.sign-role { font-size: 7pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 1pt; }
.footer { border-top: 0.5pt solid #e2e8f0; padding-top: 8pt; font-size: 7pt; color: #94a3b8; text-align: center; margin-top: 14pt; }
.nota-geral { display: inline-block; padding: 2pt 10pt; border-radius: 20pt; font-size: 8pt; font-weight: 700; ${notaGeral(cChecklist) === 'Bom' ? 'background:#ecfdf5;color:#065f46' : notaGeral(cChecklist) === 'Regular' ? 'background:#fef3c7;color:#92400e' : 'background:#fef2f2;color:#991b1b'}; }
.imei-link { color: #6366f1; font-size: 8pt; }
.valor-destaque { font-size: 14pt; font-weight: 700; color: #065f46; }
</style></head><body>

<div class="header">
  <div class="logo-area">
    <h1>📱 ${cfgLoja.nome}</h1>
    <p>${cfgLoja.end ? cfgLoja.end + ' · ' : ''}${cfgLoja.tel}</p>
    ${cfgLoja.cnpj ? `<p>CNPJ: ${cfgLoja.cnpj}</p>` : ''}
  </div>
  <div class="doc-info">
    <div class="doc-title">TERMO DE COMPRA</div>
    <div class="doc-num">Nº ${compraSalva?.numero ?? '—'}</div>
    <div class="doc-date">${hoje}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Vendedor — Dados pessoais</div>
  <div class="grid2">
    <div class="field"><div class="field-label">Nome completo</div><div class="field-value">${vNome}</div></div>
    <div class="field"><div class="field-label">CPF</div><div class="field-value">${formatCPF(vCPF)}</div></div>
    <div class="field"><div class="field-label">RG</div><div class="field-value">${vRG || '—'}</div></div>
    <div class="field"><div class="field-label">Telefone</div><div class="field-value">${vTel ? formatPhone(vTel) : '—'}</div></div>
    <div class="field"><div class="field-label">E-mail</div><div class="field-value">${vEmail || '—'}</div></div>
    <div class="field"><div class="field-label">CEP</div><div class="field-value">${vCEP || '—'}</div></div>
  </div>
  <div class="field" style="margin-top:4pt"><div class="field-label">Endereço completo</div><div class="field-value">${vEnd}</div></div>
</div>

<div class="section">
  <div class="section-title">Aparelho — Identificação</div>
  <div class="grid3">
    <div class="field"><div class="field-label">Marca / Modelo</div><div class="field-value">${specs?.marca || ''} ${specs?.modelo || cModelo}</div></div>
    <div class="field"><div class="field-label">Capacidade</div><div class="field-value">${cCapacidade || '—'}</div></div>
    <div class="field"><div class="field-label">Cor</div><div class="field-value">${cCor || '—'}</div></div>
    <div class="field"><div class="field-label">IMEI 1</div><div class="field-value">${cIMEI || '—'}</div></div>
    <div class="field"><div class="field-label">IMEI 2</div><div class="field-value">${cIMEI2 || '—'}</div></div>
    <div class="field"><div class="field-label">Estado geral</div><div class="field-value"><span class="nota-geral">${notaGeral(cChecklist)}</span></div></div>
  </div>
  ${cIMEI ? `<div style="margin-top:6pt;font-size:8pt;color:#374151">🔍 Consulta Aparelhos Legais: <a class="imei-link" href="https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}">aparelhoslegais.com.br/consulta?imei=${cIMEI}</a></div>` : ''}
</div>

${specs ? `<div class="section">
  <div class="section-title">Especificações técnicas</div>
  <div class="specs-grid">
    <div class="field"><div class="field-label">Tela</div><div class="field-value">${specs.tela}</div></div>
    <div class="field"><div class="field-label">Resolução</div><div class="field-value">${specs.resolucao}</div></div>
    <div class="field"><div class="field-label">Processador</div><div class="field-value">${specs.processador}</div></div>
    <div class="field"><div class="field-label">RAM</div><div class="field-value">${specs.ram}</div></div>
    <div class="field"><div class="field-label">Armazenamento</div><div class="field-value">${specs.armazenamento}</div></div>
    <div class="field"><div class="field-label">Câmera principal</div><div class="field-value">${specs.camera_principal}</div></div>
    <div class="field"><div class="field-label">Câmera frontal</div><div class="field-value">${specs.camera_frontal}</div></div>
    <div class="field"><div class="field-label">Bateria</div><div class="field-value">${specs.bateria}</div></div>
    <div class="field"><div class="field-label">Sistema</div><div class="field-value">${specs.sistema}</div></div>
  </div>
</div>` : ''}

${cTipo === 'usado' && Object.keys(cChecklist).length > 0 ? `<div class="section">
  <div class="section-title">Checklist de estado do aparelho</div>
  <div class="checklist-grid">
    ${CHECKLIST_ITENS.filter(i => cChecklist[i.key]).map(i => {
      const v = cChecklist[i.key] || 'N/A'
      const cls = v === 'Bom' ? 'check-bom' : v === 'Regular' ? 'check-regular' : v === 'Ruim' ? 'check-ruim' : 'check-na'
      return `<div class="check-item ${cls}"><span>${i.label}</span><b>${v}</b></div>`
    }).join('')}
  </div>
  ${cObs ? `<div style="margin-top:6pt;font-size:8pt;background:#f8fafc;padding:6pt;border-radius:3pt"><b>Observações:</b> ${cObs}</div>` : ''}
</div>` : ''}

<div class="section">
  <div class="section-title">Condições da compra</div>
  <div class="grid3">
    <div class="field"><div class="field-label">Valor pago</div><div class="valor-destaque">R$ ${parseFloat(cValor||'0').toFixed(2).replace('.',',')}</div></div>
    <div class="field"><div class="field-label">Forma de pagamento</div><div class="field-value">${cForma}</div></div>
    <div class="field"><div class="field-label">Data da operação</div><div class="field-value">${hoje}</div></div>
  </div>
</div>

<div class="legal-box">
  <p><strong>DECLARAÇÃO DO VENDEDOR</strong></p>
  <p>Eu, <strong>${vNome}</strong>, portador(a) do CPF <strong>${formatCPF(vCPF)}</strong>, declaro para todos os fins de direito que:</p>
  <p><strong>I.</strong> Sou o(a) legítimo(a) proprietário(a) do aparelho descrito neste documento, marca <strong>${specs?.marca || cModelo.split(' ')[0]}</strong>, modelo <strong>${specs?.modelo || cModelo}</strong>, IMEI <strong>${cIMEI || '—'}</strong>, e tenho plena capacidade legal para vendê-lo.</p>
  <p><strong>II.</strong> O aparelho objeto desta transação <strong>não possui origem ilícita</strong>, não foi obtido mediante furto, roubo, estelionato ou qualquer outro crime, e não possui restrição, bloqueio, financiamento ou gravame de qualquer natureza que impeça sua livre comercialização.</p>
  <p><strong>III.</strong> As informações prestadas neste documento são verdadeiras, assumindo total responsabilidade civil e criminal por eventuais irregularidades, nos termos dos artigos 155, 157, 171 e 180 do Código Penal Brasileiro.</p>
  <p><strong>IV.</strong> Estou ciente de que a venda de produto com origem ilícita configura crime de receptação (art. 180 do CP), sujeitando-me às penas previstas em lei.</p>
  <p>A loja <strong>${cfgLoja.nome}</strong> atua de boa-fé, confiando nas declarações do vendedor, sendo eximida de qualquer responsabilidade em caso de falsidade das informações prestadas.</p>
</div>

<div class="sign-row">
  <div class="sign-box">
    ${assinatura ? `<img src="${assinatura}" style="max-height:50pt;max-width:160pt;display:block;margin-bottom:4pt" alt="Assinatura" />` : ''}
    <div class="sign-line"></div>
    <div class="sign-name">${vNome}</div>
    <div class="sign-cpf">CPF: ${formatCPF(vCPF)}</div>
    <div class="sign-role">Vendedor</div>
  </div>
  <div class="sign-box">
    <div class="sign-line"></div>
    <div class="sign-name">${cfgLoja.nome}</div>
    <div class="sign-role">Representante da loja</div>
  </div>
</div>

<div class="footer">
  Documento gerado em ${hoje} · ${cfgLoja.nome}${cfgLoja.cnpj ? ' · CNPJ ' + cfgLoja.cnpj : ''} · Em conformidade com o Código Penal Brasileiro e CDC (Lei 8.078/90)
</div>

<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) w.onload = () => URL.revokeObjectURL(url)
  }

  // Canvas de assinatura
  function iniciarDesenho(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    setDesenhando(true)
    const rect = canvas.getBoundingClientRect()
    ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }
  function desenhar(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!desenhando) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx.stroke()
  }
  function pararDesenho() {
    setDesenhando(false)
    const canvas = canvasRef.current; if (!canvas) return
    setAssinatura(canvas.toDataURL())
  }
  function limparAssinatura() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height); setAssinatura('')
  }

  const aparelhosFiltrados = aparelhos.filter(a => {
    if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false
    if (filtroTipo !== 'todos' && a.tipo !== filtroTipo) return false
    if (search && !`${a.marca} ${a.modelo}`.toLowerCase().includes(search.toLowerCase()) && a.imei?.includes(search) === false) return false
    return true
  })

  const STATUS_CFG: Record<string, {label:string;bg:string;color:string}> = {
    disponivel: { label: 'Disponível', bg: '#ecfdf5', color: '#065f46' },
    reservado:  { label: 'Reservado',  bg: '#fef3c7', color: '#92400e' },
    vendido:    { label: 'Vendido',    bg: '#f1f5f9', color: '#64748b' },
  }

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', width: '100%' }}>

      {/* Header */}
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
        {([['estoque','📱 Estoque'], ['comprar','⬇ Registrar compra'], ['vender','⬆ Registrar venda']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba===k?600:400, border: 'none', background: 'none', cursor: 'pointer', color: aba===k?'#6366f1':'#64748b', borderBottom: aba===k?'2px solid #6366f1':'2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {/* ═══ ESTOQUE ═══ */}
      {aba === 'estoque' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo ou IMEI..." style={{ ...inp, flex: 1, minWidth: 180, background: '#f8fafc' }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="todos">Todos os status</option>
              <option value="disponivel">Disponíveis</option>
              <option value="vendido">Vendidos</option>
            </select>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="todos">Novo e usado</option>
              <option value="novo">Apenas novos</option>
              <option value="usado">Apenas usados</option>
            </select>
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div> :
          aparelhosFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Nenhum aparelho no estoque</p>
              <button onClick={() => setAba('comprar')} style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ Registrar compra</button>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Aparelho','Tipo','IMEI','Estado','Compra','Venda','Lucro','Status',''].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aparelhosFiltrados.map(a => {
                    const st = STATUS_CFG[a.status] ?? STATUS_CFG.disponivel
                    const lucro = a.preco_venda && a.preco_compra ? a.preco_venda - a.preco_compra : null
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <p style={{ fontWeight: 500, color: '#0f172a' }}>{a.marca} {a.modelo}</p>
                          {a.capacidade && <p style={{ fontSize: 11, color: '#94a3b8' }}>{a.capacidade}{a.cor ? ` · ${a.cor}` : ''}</p>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: a.tipo === 'novo' ? '#eff6ff' : '#faf5ff', color: a.tipo === 'novo' ? '#1d4ed8' : '#6b21a8' }}>
                            {a.tipo === 'novo' ? 'Novo' : 'Usado'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                          {a.imei ? (
                            <a href={`https://www.aparelhoslegais.com.br/consulta?imei=${a.imei}`} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none' }} title="Consultar Aparelhos Legais">
                              {a.imei} 🔍
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {a.checklist_nota ? (
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: a.checklist_nota === 'Bom' ? '#ecfdf5' : a.checklist_nota === 'Regular' ? '#fef3c7' : '#fef2f2', color: a.checklist_nota === 'Bom' ? '#065f46' : a.checklist_nota === 'Regular' ? '#92400e' : '#991b1b' }}>
                              {a.checklist_nota}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>
                          {a.preco_compra ? `R$ ${a.preco_compra.toFixed(2).replace('.',',')}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>
                          {a.preco_venda ? `R$ ${a.preco_venda.toFixed(2).replace('.',',')}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: lucro && lucro > 0 ? 600 : 400, color: lucro && lucro > 0 ? '#065f46' : lucro && lucro < 0 ? '#991b1b' : '#94a3b8' }}>
                          {lucro !== null ? `R$ ${lucro.toFixed(2).replace('.',',')}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {a.status === 'disponivel' && (
                            <button onClick={() => { setAparelhoVenda(a); setAba('vender') }} style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #e0e7ff', borderRadius: 7, background: '#eef2ff', cursor: 'pointer', color: '#4338ca', fontWeight: 500 }}>
                              Vender →
                            </button>
                          )}
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
        <div style={{ maxWidth: 800 }}>
          {compraSalva ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#065f46', marginBottom: 12 }}>✅ Compra #{compraSalva.numero} registrada!</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => gerarDocumento('compra')} style={{ padding: '9px 18px', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#065f46', fontWeight: 500 }}>
                  🖨 Imprimir termo de compra
                </button>
                <button onClick={() => { setCompraSalva(null); setCModelo(''); setCSpecs(null); setCIMEI(''); setCIMEI2(''); setCCor(''); setCCapacidade(''); setCObs(''); setCChecklist({}); setCValor(''); setVNome(''); setVCPF(''); setVRG(''); setVTel(''); setVEmail(''); setVEnd(''); setVCEP(''); setAssinatura(''); limparAssinatura() }} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                  Nova compra
                </button>
              </div>
            </div>
          ) : null}

          {/* Tipo */}
          <div style={card}>
            <p style={sec}>Tipo de aparelho</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['usado','novo'] as const).map(t => (
                <button key={t} onClick={() => setCTipo(t)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: `2px solid ${cTipo===t?'#6366f1':'#e2e8f0'}`, background: cTipo===t?'#eef2ff':'#fff', cursor: 'pointer', fontSize: 13, fontWeight: cTipo===t?600:400, color: cTipo===t?'#3730a3':'#374151' }}>
                  {t === 'usado' ? '📱 Aparelho usado' : '🆕 Aparelho novo'}
                </button>
              ))}
            </div>
          </div>

          {/* Modelo + specs */}
          <div style={card}>
            <p style={sec}>Identificação do aparelho</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Modelo do aparelho *</label>
                <input style={inp} value={cModelo} onChange={e => setCModelo(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleBuscarSpecs()} placeholder="Ex: Xiaomi Redmi 13C, Samsung Galaxy A54..." />
              </div>
              <div style={{ paddingTop: 18 }}>
                <button onClick={handleBuscarSpecs} disabled={buscandoSpecs || !cModelo.trim()} style={{ padding: '9px 18px', background: buscandoSpecs?'#a5b4fc':'#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  {buscandoSpecs ? '⏳ Buscando...' : '🔍 Buscar specs'}
                </button>
              </div>
            </div>

            {cSpecs && (
              <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#3730a3' }}>✓ {cSpecs.marca} {cSpecs.modelo}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                  {[['Tela', cSpecs.tela], ['Resolução', cSpecs.resolucao], ['Processador', cSpecs.processador], ['RAM', cSpecs.ram], ['Armazenamento', cSpecs.armazenamento], ['Câmera traseira', cSpecs.camera_principal], ['Câmera frontal', cSpecs.camera_frontal], ['Bateria', cSpecs.bateria], ['Sistema', cSpecs.sistema]].map(([k, v]) => (
                    <div key={k}>
                      <p style={{ fontSize: 10, color: '#6366f1', fontWeight: 500 }}>{k}</p>
                      <p style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{v || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div><label style={lbl}>Capacidade</label><input style={inp} value={cCapacidade} onChange={e => setCCapacidade(e.target.value)} placeholder="Ex: 128GB ou 64GB/128GB" /></div>
              <div><label style={lbl}>Cor</label><input style={inp} value={cCor} onChange={e => setCCor(e.target.value)} placeholder="Ex: Midnight Black" /></div>
              <div><label style={lbl}>Senha do aparelho</label><input style={inp} value={cSenha} onChange={e => setCSenha(e.target.value)} placeholder="PIN, senha ou padrão" /></div>
              <div>
                <label style={lbl}>IMEI 1</label>
                <input style={inp} value={cIMEI} onChange={e => setCIMEI(e.target.value)} placeholder="15 dígitos" />
                {cIMEI && cIMEI.length === 15 && <a href={`https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6366f1', textDecoration: 'none', display: 'block', marginTop: 3 }}>🔍 Consultar Aparelhos Legais →</a>}
              </div>
              <div><label style={lbl}>IMEI 2 (dual SIM)</label><input style={inp} value={cIMEI2} onChange={e => setCIMEI2(e.target.value)} placeholder="15 dígitos (opcional)" /></div>
            </div>
          </div>

          {/* Checklist (apenas usado) */}
          {cTipo === 'usado' && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={sec}>Checklist de estado</p>
                {Object.keys(cChecklist).length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 20, background: notaGeral(cChecklist)==='Bom'?'#ecfdf5':notaGeral(cChecklist)==='Regular'?'#fef3c7':'#fef2f2', color: notaGeral(cChecklist)==='Bom'?'#065f46':notaGeral(cChecklist)==='Regular'?'#92400e':'#991b1b' }}>
                    Geral: {notaGeral(cChecklist)}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {CHECKLIST_ITENS.map(item => (
                  <div key={item.key} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', background: '#fafafa' }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>{item.label}</p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {ESTADOS.map(e => (
                        <button key={e.v} onClick={() => setChecklistItem(item.key, e.v)} style={{ flex: 1, padding: '4px 2px', borderRadius: 5, border: `1px solid ${cChecklist[item.key]===e.v?e.border:'#e2e8f0'}`, background: cChecklist[item.key]===e.v?e.bg:'#fff', color: cChecklist[item.key]===e.v?e.color:'#94a3b8', fontSize: 10, fontWeight: cChecklist[item.key]===e.v?600:400, cursor: 'pointer' }}>
                          {e.v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={lbl}>Observações sobre o estado</label>
                <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={cObs} onChange={e => setCObs(e.target.value)} placeholder="Arranhões, amassados, problemas observados..." />
              </div>
            </div>
          )}

          {/* Dados do vendedor */}
          <div style={card}>
            <p style={sec}>Dados do vendedor (pessoa física)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Nome completo *</label><input style={inp} value={vNome} onChange={e => setVNome(e.target.value)} placeholder="Nome completo conforme documento" /></div>
              <div><label style={lbl}>CPF *</label><input style={inp} value={vCPF} onChange={e => setVCPF(formatCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} /></div>
              <div><label style={lbl}>RG</label><input style={inp} value={vRG} onChange={e => setVRG(e.target.value)} placeholder="Número do RG" /></div>
              <div><label style={lbl}>Telefone</label><input style={inp} value={vTel} onChange={e => setVTel(formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} /></div>
              <div><label style={lbl}>E-mail</label><input style={inp} value={vEmail} onChange={e => setVEmail(e.target.value)} placeholder="email@exemplo.com" /></div>
              <div><label style={lbl}>CEP</label><input style={inp} value={vCEP} onChange={e => setVCEP(e.target.value)} placeholder="00000-000" maxLength={9} /></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={lbl}>Endereço completo *</label>
              <input style={inp} value={vEnd} onChange={e => setVEnd(e.target.value)} placeholder="Rua, número, complemento, bairro, cidade — UF" />
            </div>
          </div>

          {/* Pagamento */}
          <div style={card}>
            <p style={sec}>Condições de pagamento</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Valor pago ao vendedor (R$) *</label>
                <input style={{ ...inp, fontSize: 18, fontWeight: 600 }} type="number" step="0.01" value={cValor} onChange={e => setCValor(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label style={lbl}>Forma de pagamento</label>
                <select style={inp} value={cForma} onChange={e => setCForma(e.target.value)}>
                  {FORMAS_PGTO.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Assinatura */}
          <div style={card}>
            <p style={sec}>Assinatura digital do vendedor</p>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>O vendedor deve assinar abaixo confirmando as declarações do termo.</p>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fafafa', display: 'inline-block' }}>
              <canvas ref={canvasRef} width={500} height={120} style={{ display: 'block', cursor: 'crosshair', borderRadius: 8 }}
                onMouseDown={iniciarDesenho} onMouseMove={desenhar} onMouseUp={pararDesenho} onMouseLeave={pararDesenho} />
            </div>
            {assinatura && <button onClick={limparAssinatura} style={{ marginLeft: 10, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Limpar</button>}
          </div>

          <button onClick={salvarCompra} disabled={salvando || !cModelo.trim() || !vNome.trim() || !vCPF.trim() || !vEnd.trim() || !cValor} style={{ width: '100%', padding: '14px', background: salvando||!cModelo.trim()||!vNome.trim()||!vCPF.trim()||!vEnd.trim()||!cValor ? '#e2e8f0' : '#6366f1', color: salvando||!cModelo.trim()||!vNome.trim()||!vCPF.trim()||!vEnd.trim()||!cValor ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {salvando ? 'Salvando...' : '✓ Registrar compra e gerar termo'}
          </button>
        </div>
      )}

      {/* ═══ VENDER ═══ */}
      {aba === 'vender' && (
        <div style={{ maxWidth: 800 }}>
          {vendaSalva ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#065f46', marginBottom: 12 }}>✅ Venda #{vendaSalva.numero} registrada!</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => gerarDocumento('venda')} style={{ padding: '9px 18px', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#065f46', fontWeight: 500 }}>
                  🖨 Imprimir termo de venda
                </button>
                <button onClick={() => { setVendaSalva(null); setAparelhoVenda(null); setBNome(''); setBCPF(''); setBTel(''); setBEmail(''); setBEnd(''); setBValor(''); setAssinatura(''); limparAssinatura() }} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                  Nova venda
                </button>
              </div>
            </div>
          ) : null}

          {/* Selecionar aparelho */}
          {!aparelhoVenda ? (
            <div style={card}>
              <p style={sec}>Selecione o aparelho para venda</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {aparelhos.filter(a => a.status === 'disponivel').map(a => (
                  <div key={a.id} onClick={() => setAparelhoVenda(a)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', background: '#fff' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f3ff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}>
                    <div>
                      <p style={{ fontWeight: 500, color: '#0f172a' }}>{a.marca} {a.modelo}</p>
                      <p style={{ fontSize: 12, color: '#94a3b8' }}>{a.capacidade}{a.cor ? ` · ${a.cor}` : ''}{a.imei ? ` · IMEI: ${a.imei}` : ''}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>Comprado por R$ {a.preco_compra?.toFixed(2).replace('.',',')}</p>
                      {a.checklist_nota && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, background: a.checklist_nota==='Bom'?'#ecfdf5':'#fef3c7', color: a.checklist_nota==='Bom'?'#065f46':'#92400e' }}>{a.checklist_nota}</span>}
                    </div>
                  </div>
                ))}
                {aparelhos.filter(a => a.status === 'disponivel').length === 0 && (
                  <p style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Nenhum aparelho disponível para venda.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Aparelho selecionado */}
              <div style={{ ...card, background: '#f0f4ff', border: '1px solid #c7d2fe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#3730a3' }}>{aparelhoVenda.marca} {aparelhoVenda.modelo}</p>
                    <p style={{ fontSize: 12, color: '#6366f1', marginTop: 2 }}>{aparelhoVenda.capacidade}{aparelhoVenda.cor ? ` · ${aparelhoVenda.cor}` : ''}</p>
                    {aparelhoVenda.imei && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>IMEI: {aparelhoVenda.imei}</p>}
                  </div>
                  <button onClick={() => setAparelhoVenda(null)} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>Trocar →</button>
                </div>
              </div>

              {/* Dados comprador */}
              <div style={card}>
                <p style={sec}>Dados do comprador</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Nome completo *</label><input style={inp} value={bNome} onChange={e => setBNome(e.target.value)} placeholder="Nome conforme documento" /></div>
                  <div><label style={lbl}>CPF *</label><input style={inp} value={bCPF} onChange={e => setBCPF(formatCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} /></div>
                  <div><label style={lbl}>Telefone</label><input style={inp} value={bTel} onChange={e => setBTel(formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} /></div>
                  <div><label style={lbl}>E-mail</label><input style={inp} value={bEmail} onChange={e => setBEmail(e.target.value)} placeholder="email@exemplo.com" /></div>
                  <div><label style={lbl}>Endereço</label><input style={inp} value={bEnd} onChange={e => setBEnd(e.target.value)} placeholder="Rua, número, cidade" /></div>
                </div>
              </div>

              {/* Pagamento */}
              <div style={card}>
                <p style={sec}>Condições de venda</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div>
                    <label style={lbl}>Valor de venda (R$) *</label>
                    <input style={{ ...inp, fontSize: 18, fontWeight: 600 }} type="number" step="0.01" value={bValor} onChange={e => setBValor(e.target.value)} placeholder="0,00" />
                    {bValor && aparelhoVenda.preco_compra && (
                      <p style={{ fontSize: 11, color: parseFloat(bValor) > aparelhoVenda.preco_compra ? '#065f46' : '#991b1b', marginTop: 4, fontWeight: 500 }}>
                        {parseFloat(bValor) > aparelhoVenda.preco_compra
                          ? `✓ Lucro: R$ ${(parseFloat(bValor) - aparelhoVenda.preco_compra).toFixed(2).replace('.',',')}`
                          : `⚠ Prejuízo: R$ ${(aparelhoVenda.preco_compra - parseFloat(bValor)).toFixed(2).replace('.',',')}`
                        }
                      </p>
                    )}
                  </div>
                  <div><label style={lbl}>Forma de pagamento</label><select style={inp} value={bForma} onChange={e => setBForma(e.target.value)}>{FORMAS_PGTO.map(f => <option key={f}>{f}</option>)}</select></div>
                  <div><label style={lbl}>Garantia (dias)</label><input style={inp} type="number" value={bGarantia} onChange={e => setBGarantia(e.target.value)} /></div>
                </div>
              </div>

              {/* Assinatura comprador */}
              <div style={card}>
                <p style={sec}>Assinatura do comprador</p>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fafafa', display: 'inline-block' }}>
                  <canvas ref={canvasRef} width={500} height={120} style={{ display: 'block', cursor: 'crosshair', borderRadius: 8 }}
                    onMouseDown={iniciarDesenho} onMouseMove={desenhar} onMouseUp={pararDesenho} onMouseLeave={pararDesenho} />
                </div>
                {assinatura && <button onClick={limparAssinatura} style={{ marginLeft: 10, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Limpar</button>}
              </div>

              <button onClick={salvarVenda} disabled={salvando || !bNome.trim() || !bCPF.trim() || !bValor} style={{ width: '100%', padding: '14px', background: salvando||!bNome.trim()||!bCPF.trim()||!bValor ? '#e2e8f0' : '#6366f1', color: salvando||!bNome.trim()||!bCPF.trim()||!bValor ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {salvando ? 'Salvando...' : '✓ Registrar venda e gerar contrato'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
