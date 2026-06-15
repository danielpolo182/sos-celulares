'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, use, useRef, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import ModalPixRemoto from '@/components/pix/ModalPixRemoto'

type OS = {
  id: string; numero: number; status: string; marca: string | null; modelo: string | null
  imei: string | null; cor: string | null; acessorios: string[] | null; senha_aparelho: string | null
  defeito_relatado: string; defeito_tecnico: string | null; solucao: string | null
  valor_orcamento: number | null; valor_final: number | null; desconto: number | null
  forma_pagamento: string | null; pago: boolean; observacoes: string | null
  created_at: string; updated_at: string
  clientes: { id: string; nome: string; telefone: string | null; cpf: string | null } | null
}

type ItemOrc = {
  id?: string; produto_id: string | null; fornecedor_id: string | null
  descricao: string; qualidade: string; quantidade: number
  custo_unit: number; preco_unit: number; subtotal: number; tipo: 'peca' | 'servico'
}

type ProdutoOrc = {
  id: string; nome: string; qualidade: string; preco_venda: number
  custo_medio: number; estoque_atual: number; categoria: string | null; modelos_compat: string[] | null
}

type FornecedorOrc = { id: string; nome: string }

type Contrato = {
  id: string; titulo: string; conteudo: string | null
  requer_assinatura_cliente: boolean; requer_assinatura_gestor: boolean
}

const STATUS_FLOW = ['aberta', 'em_andamento', 'pronta', 'entregue']
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string; waMensagem: string }> = {
  aberta:       { label: 'Aberta',       bg: '#eff6ff', color: '#1d4ed8', icon: '📋', waMensagem: 'Olá, {nome}! 😊 Seu aparelho *{modelo}* foi recebido em nossa assistência técnica.\n\n🔧 *OS Nº {numero}*\n📱 Aparelho: {modelo}\n🛠 Defeito: {defeito}\n\nAssim que tivermos novidades, entraremos em contato. Obrigado pela confiança!' },
  em_andamento: { label: 'Em andamento', bg: '#fef3c7', color: '#92400e', icon: '🔧', waMensagem: 'Olá, {nome}! 👋 Sua *OS Nº {numero}* está em andamento.\n\n📱 Aparelho: {modelo}\n🔧 Nosso técnico já está trabalhando no seu dispositivo.\n\nEm breve teremos mais informações!' },
  pronta:       { label: 'Pronta',       bg: '#ecfdf5', color: '#065f46', icon: '✅', waMensagem: 'Olá, {nome}! 🎉 Ótima notícia!\n\nSua *OS Nº {numero}* está *PRONTA* para retirada!\n\n📱 Aparelho: {modelo}\n💰 Valor: R$ {valor}\n\nPasse em nossa loja para retirar. Aguardamos você! 😊' },
  entregue:     { label: 'Entregue',     bg: '#f0fdf4', color: '#14532d', icon: '📦', waMensagem: 'Olá, {nome}! Confirmando a entrega do seu *{modelo}*. Obrigado pela preferência! 🙏\n\n*OS Nº {numero}* finalizada.' },
  cancelada:    { label: 'Cancelada',    bg: '#fef2f2', color: '#991b1b', icon: '❌', waMensagem: '' },
  aguardando_diagnostico: { label: 'Aguard. diagnóstico', bg: '#f3e8ff', color: '#7c3aed', icon: '🔬', waMensagem: '' },
  em_orcamento:           { label: 'Em orçamento',        bg: '#fef3c7', color: '#d97706', icon: '💰', waMensagem: '' },
  em_reparo:              { label: 'Em reparo',            bg: '#fef3c7', color: '#92400e', icon: '🔧', waMensagem: 'Olá, {nome}! 👋 Sua *OS Nº {numero}* está em reparo!' },
  aguardando_peca:        { label: 'Aguard. peça',         bg: '#fff7ed', color: '#c2410c', icon: '📦', waMensagem: '' },
}

const PAGAMENTOS = ['Dinheiro', 'PIX', 'Cartão débito', 'Cartão crédito', 'Transferência']

const CHECKLIST_ITEMS = [
  { key: 'tela', label: 'Tela / Display', icon: '🖥' }, { key: 'touch', label: 'Touch screen', icon: '👆' },
  { key: 'microfone', label: 'Microfone', icon: '🎤' }, { key: 'alto_falante', label: 'Alto-falante', icon: '🔊' },
  { key: 'fone', label: 'Entrada de fone', icon: '🎧' }, { key: 'camera_tras', label: 'Câmera traseira', icon: '📷' },
  { key: 'camera_fron', label: 'Câmera frontal', icon: '🤳' }, { key: 'chip', label: 'Leitor de chip', icon: '📶' },
  { key: 'wifi', label: 'Wi-Fi', icon: '📡' }, { key: 'bluetooth', label: 'Bluetooth', icon: '🦷' },
  { key: 'gps', label: 'GPS', icon: '📍' }, { key: 'bateria', label: 'Bateria', icon: '🔋' },
  { key: 'botao_power', label: 'Botão power', icon: '⏻' }, { key: 'botao_vol', label: 'Botões de volume', icon: '🔈' },
  { key: 'biometria', label: 'Biometria / Face ID', icon: '👁' }, { key: 'carregamento', label: 'Carregamento', icon: '⚡' },
  { key: 'usb', label: 'Porta USB / dados', icon: '🔌' }, { key: 'vibracao', label: 'Vibração', icon: '📳' },
]

type ChecklistState = Record<string, 'ok' | 'falha' | 'nao_testado'>

type CategoriaItens = Record<string, boolean>

type DiagnosticoForm = {
  tela: { selecionada: boolean; tipoDisplay: string; itens: CategoriaItens }
  bateria: { selecionada: boolean; itens: CategoriaItens }
  camera: { selecionada: boolean; itens: CategoriaItens }
  placa: { selecionada: boolean; itens: CategoriaItens }
  conector: { selecionada: boolean; itens: CategoriaItens }
  estrutura: { selecionada: boolean; itens: CategoriaItens }
}

const QUALIDADE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  original:       { label: 'Original',   bg: '#E1F5EE', color: '#085041' },
  premium:        { label: 'Premium',    bg: '#E6F1FB', color: '#0C447C' },
  compativel:     { label: 'Compatível', bg: '#FAEEDA', color: '#633806' },
  recondicionado: { label: 'Recon.',     bg: '#FAECE7', color: '#712B13' },
}

function formatPhone(v: string) { return v.replace(/\D/g, '').slice(0, 11).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2') }
function parseSenha(raw: string | null) { if (!raw) return null; try { return JSON.parse(raw) } catch { return null } }
function gerarMensagemWA(template: string, os: OS, valor: string) {
  const nome = os.clientes?.nome?.split(' ')[0] ?? 'cliente'
  return template.replace('{nome}', nome).replace(/{numero}/g, String(os.numero)).replace(/{modelo}/g, os.modelo ?? 'aparelho').replace('{defeito}', os.defeito_relatado).replace('{valor}', valor || (os.valor_orcamento ? os.valor_orcamento.toFixed(2).replace('.', ',') : 'a combinar'))
}
function abrirWhatsApp(telefone: string | null, mensagem: string) {
  const num = telefone?.replace(/\D/g, '') ?? ''
  window.open(`https://wa.me/55${num}?text=${encodeURIComponent(mensagem)}`, '_blank')
}

function PatternDisplay({ sequencia }: { sequencia: number[] }) {
  const SIZE = 100, PAD = 18, STEP = (SIZE - PAD * 2) / 2
  function dotPos(i: number) { return { x: PAD + (i % 3) * STEP, y: PAD + Math.floor(i / 3) * STEP } }
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ background: '#0f172a', borderRadius: 8 }}>
      {sequencia.map((dot, idx) => { if (idx === 0) return null; const from = dotPos(sequencia[idx - 1]), to = dotPos(dot); return <line key={idx} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6366f1" strokeWidth="1.5" opacity="0.8" /> })}
      {Array.from({ length: 9 }, (_, i) => { const p = dotPos(i), drawn = sequencia.includes(i); return (<g key={i}><circle cx={p.x} cy={p.y} r={7} fill={drawn ? '#6366f1' : '#1e293b'} stroke={drawn ? '#818cf8' : '#334155'} strokeWidth="1" /><circle cx={p.x} cy={p.y} r={2.5} fill={drawn ? '#fff' : '#475569'} /></g>) })}
    </svg>
  )
}

// Wrapper com Suspense — obrigatório no Next.js 15 para useSearchParams
export default function OSDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando...</div>}>
      <OSDetailInner params={params} />
    </Suspense>
  )
}

function OSDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [os, setOs] = useState<OS | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [aba, setAba] = useState<'os' | 'orcamento' | 'checklist'>('os')

  const [status, setStatus] = useState('')
  const [defeitoTecnico, setDefeitoTecnico] = useState('')
  const [solucao, setSolucao] = useState('')
  const [valorFinal, setValorFinal] = useState('')
  const [desconto, setDesconto] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [pago, setPago] = useState(false)
  const [pixCriando, setPixCriando] = useState(false)
  const [pixModal, setPixModal] = useState<{ cobrancaId: string; pixCopiaCola: string; valor: number; expiraEm: string; temTelefone: boolean } | null>(null)
  const [observacoes, setObservacoes] = useState('')
  const [checklist, setChecklist] = useState<ChecklistState>({})

  const [showDiagnostico, setShowDiagnostico] = useState(false)
  const [savingDiagnostico, setSavingDiagnostico] = useState(false)
  const [valorOrcamento, setValorOrcamento] = useState('')
  const [obsTecnica, setObsTecnica] = useState('')
  const [diagForm, setDiagForm] = useState<DiagnosticoForm>({
    tela:     { selecionada: false, tipoDisplay: '', itens: { toque: false, imagem: false, quebrado: false } },
    bateria:  { selecionada: false, itens: { autonomia: false, naoCarrega: false, inchada: false } },
    camera:   { selecionada: false, itens: { frontal: false, traseira: false, foco: false } },
    placa:    { selecionada: false, itens: { naoLiga: false, travamentos: false, semSinal: false } },
    conector: { selecionada: false, itens: { usb: false, audio: false } },
    estrutura:{ selecionada: false, itens: { carcaca: false, botoes: false } },
  })

  const [cfgLoja, setCfgLoja] = useState<Record<string, string>>({
    loja_nome: 'SOS Celulares', loja_telefone: '', loja_email: '',
    loja_endereco: '', loja_cnpj: '', recibo_os_formato: 'a4',
    garantia_dias: '90', retirada_prazo_dias: '90', retirada_taxa_mensal: '10',
  })
  const [assinaturaLoja, setAssinaturaLoja] = useState('')
  const [contratos, setContratos] = useState<Contrato[]>([])

  const [itensOrc, setItensOrc] = useState<ItemOrc[]>([])
  const [produtosCompat, setProdutosCompat] = useState<ProdutoOrc[]>([])
  const [fornecedoresOrc, setFornecedoresOrc] = useState<FornecedorOrc[]>([])
  const [searchOrc, setSearchOrc] = useState('')
  const [prodResultsOrc, setProdResultsOrc] = useState<ProdutoOrc[]>([])
  const [salvandoOrc, setSalvandoOrc] = useState(false)
  const orcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Flag para auto-imprimir quando vem de ?imprimir=1
  const autoImprimirRef = useRef(false)

  const loadOS = useCallback(async () => {
    const { data, error } = await supabase.from('ordens_servico').select('*,clientes(id,nome,telefone,cpf)').eq('id', id).single()
    if (error) setLoadError(`${error.message} (${error.code})`)
    if (data) {
      const d = data as unknown as OS
      setOs(d); setStatus(d.status); setDefeitoTecnico(d.defeito_tecnico ?? ''); setSolucao(d.solucao ?? '')
      setValorFinal(d.valor_final ? String(d.valor_final) : d.valor_orcamento ? String(d.valor_orcamento) : '')
      setDesconto(d.desconto ? String(d.desconto) : ''); setFormaPagamento(d.forma_pagamento ?? ''); setPago(d.pago ?? false)
      try { const obs = JSON.parse(d.observacoes ?? '{}'); setObservacoes(obs.texto ?? d.observacoes ?? ''); if (obs.__checklist) setChecklist(obs.__checklist) } catch { setObservacoes(d.observacoes ?? '') }
    }
  }, [id, supabase])

  const loadOrcamento = useCallback(async () => {
    const [{ data: itens }, { data: forn }] = await Promise.all([
      supabase.from('os_orcamento_itens').select('*').eq('os_id', id).order('created_at'),
      supabase.from('fornecedores').select('id,nome').eq('ativo', true).order('nome'),
    ])
    setItensOrc((itens ?? []) as ItemOrc[])
    setFornecedoresOrc((forn ?? []) as FornecedorOrc[])
  }, [id, supabase])

  const loadProdutosCompat = useCallback(async (modelo: string | null) => {
    if (!modelo) return
    const { data } = await supabase.from('produtos').select('*').is('deleted_at', null).eq('ativo', true)
      .or(`modelos_compat.cs.{"${modelo}"},nome.ilike.%${modelo.split(' ').pop()}%`)
      .order('nome').limit(20)
    setProdutosCompat((data ?? []) as ProdutoOrc[])
  }, [supabase])

  useEffect(() => {
    loadOS().finally(() => setLoading(false))

    supabase.from('sistema_config').select('chave,valor')
      .in('chave', ['loja_nome', 'loja_telefone', 'loja_email', 'loja_endereco', 'loja_cnpj', 'recibo_os_formato', 'garantia_dias', 'retirada_prazo_dias', 'retirada_taxa_mensal'])
      .then(({ data }) => {
        if (data) { const m: Record<string, string> = {}; data.forEach((c: { chave: string; valor: string }) => { m[c.chave] = c.valor }); setCfgLoja(prev => ({ ...prev, ...m })) }
      })

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuario_assinaturas').select('assinatura').eq('usuario_id', user.id).maybeSingle()
        .then(({ data }) => { if (data?.assinatura) setAssinaturaLoja(data.assinatura) })
    })

    // Carregar contratos ativos com imprimir_na_os=true
    supabase.from('contratos').select('id,titulo,conteudo,requer_assinatura_cliente,requer_assinatura_gestor')
      .eq('ativo', true).eq('imprimir_na_os', true)
      .then(({ data }) => { if (data) setContratos(data as Contrato[]) })

    // Auto-imprimir se veio de ?imprimir=1
    if (searchParams.get('imprimir') === '1') autoImprimirRef.current = true
  }, [loadOS, supabase, searchParams])

  useEffect(() => {
    if (os) {
      loadOrcamento(); loadProdutosCompat(os.modelo)
      // Disparar impressão automática após carregar tudo
      if (autoImprimirRef.current) {
        autoImprimirRef.current = false
        setTimeout(() => imprimir(), 800)
      }
    }
  }, [os, loadOrcamento, loadProdutosCompat])

  function buscarProdOrc(q: string) {
    setSearchOrc(q)
    if (orcTimer.current) clearTimeout(orcTimer.current)
    orcTimer.current = setTimeout(async () => {
      if (!q.trim()) { setProdResultsOrc([]); return }
      const { data } = await supabase.from('produtos').select('*').is('deleted_at', null).eq('ativo', true).ilike('nome', `%${q}%`).limit(8)
      setProdResultsOrc((data ?? []) as ProdutoOrc[])
    }, 250)
  }

  function adicionarProdOrc(p: ProdutoOrc) {
    const exist = itensOrc.findIndex(i => i.produto_id === p.id)
    if (exist >= 0) {
      const novo = [...itensOrc]; novo[exist].quantidade++; novo[exist].subtotal = novo[exist].quantidade * novo[exist].preco_unit; setItensOrc(novo)
    } else {
      setItensOrc(prev => [...prev, { produto_id: p.id, fornecedor_id: null, descricao: p.nome, qualidade: p.qualidade, quantidade: 1, custo_unit: p.custo_medio, preco_unit: p.preco_venda, subtotal: p.preco_venda, tipo: 'peca' }])
    }
    setSearchOrc(''); setProdResultsOrc([])
  }

  function adicionarAvulsoOrc() { setItensOrc(prev => [...prev, { produto_id: null, fornecedor_id: null, descricao: '', qualidade: 'compativel', quantidade: 1, custo_unit: 0, preco_unit: 0, subtotal: 0, tipo: 'peca' }]) }

  function atualizarItemOrc(i: number, field: keyof ItemOrc, value: string | number | null) {
    const novo = [...itensOrc]; const item = { ...novo[i], [field]: value }
    if (field === 'quantidade' || field === 'preco_unit') item.subtotal = (field === 'quantidade' ? Number(value) : item.quantidade) * (field === 'preco_unit' ? Number(value) : item.preco_unit)
    novo[i] = item; setItensOrc(novo)
  }

  function removerItemOrc(i: number) { setItensOrc(prev => prev.filter((_, idx) => idx !== i)) }

  async function salvarOrcamento() {
    setSalvandoOrc(true)
    await supabase.from('os_orcamento_itens').delete().eq('os_id', id)
    if (itensOrc.length > 0) await supabase.from('os_orcamento_itens').insert(itensOrc.map(i => ({ os_id: id, produto_id: i.produto_id, fornecedor_id: i.fornecedor_id, descricao: i.descricao, qualidade: i.qualidade, quantidade: i.quantidade, custo_unit: i.custo_unit, preco_unit: i.preco_unit, tipo: i.tipo })))
    const totalOrc = itensOrc.reduce((s, i) => s + i.subtotal, 0)
    await supabase.from('ordens_servico').update({ valor_orcamento: totalOrc }).eq('id', id)
    setValorFinal(String(totalOrc)); setSalvandoOrc(false); loadOrcamento()
  }

  async function baixarEstoque() {
    for (const item of itensOrc) {
      if (!item.produto_id) continue
      const { data: prod } = await supabase.from('produtos').select('estoque_atual').eq('id', item.produto_id).single()
      if (prod) await supabase.from('produtos').update({ estoque_atual: Math.max(0, prod.estoque_atual - item.quantidade) }).eq('id', item.produto_id)
    }
  }

  async function salvar() {
    setSaving(true)
    const obsPayload = JSON.stringify({ texto: observacoes, __checklist: checklist })
    const fechandoOS = status === 'entregue' && os?.status !== 'entregue'
    await supabase.from('ordens_servico').update({
      status, defeito_tecnico: defeitoTecnico || null, solucao: solucao || null,
      valor_final: valorFinal ? parseFloat(valorFinal) : null,
      desconto: desconto ? parseFloat(desconto) : 0,
      forma_pagamento: formaPagamento || null, pago, observacoes: obsPayload,
      ...(fechandoOS ? { entregue_em: new Date().toISOString() } : {}),
    }).eq('id', id)
    if (fechandoOS && itensOrc.length > 0) await baixarEstoque()
    try { await supabase.from('events').insert({ type: 'OS_ATUALIZADA', entity: 'os', entity_id: id, payload: { status, pago } }) } catch { /* non-critical */ }
    if (status !== os?.status) {
      fetch('/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId: id, newStatus: status }),
      }).catch(() => {})
    }
    const { data } = await supabase.from('ordens_servico').select('*,clientes(id,nome,telefone,cpf)').eq('id', id).single()
    if (data) setOs(data as unknown as OS)
    setSaving(false)
  }

  async function salvarDiagnostico() {
    if (!os) return
    setSavingDiagnostico(true)
    const { error } = await supabase.from('ordens_servico').update({
      diagnostico: diagForm,
      obs_tecnica: obsTecnica || null,
      tipo_display: diagForm.tela.selecionada && diagForm.tela.tipoDisplay
        ? diagForm.tela.tipoDisplay
        : null,
      valor_orcamento: valorOrcamento ? parseFloat(valorOrcamento) : null,
      status: 'em_orcamento',
      updated_at: new Date().toISOString(),
    }).eq('id', os.id)

    if (error) {
      alert(`Erro ao salvar diagnóstico: ${error.message}`)
      setSavingDiagnostico(false)
      return
    }

    setShowDiagnostico(false)
    // Recarregar OS
    const { data } = await supabase
      .from('ordens_servico')
      .select('*, clientes(id,nome,telefone,cpf)')
      .eq('id', os.id)
      .single()
    if (data) setOs(data as OS)
    setSavingDiagnostico(false)
  }

  function toggleChecklist(key: string, val: 'ok' | 'falha' | 'nao_testado') { setChecklist(c => ({ ...c, [key]: val })) }

  // ─── IMPRESSÃO — sem document.write, sem noopener, usa Blob URL ───────────
  function imprimir() {
    if (!os) return
    const html = gerarHTMLOS()
    abrirJanelaImpressao(html)
  }

  function imprimirContrato(contrato: Contrato) {
    if (!os) return
    const html = gerarHTMLContrato(contrato)
    abrirJanelaImpressao(html)
  }

  // FIX: usa onafterprint para fechar a janela automaticamente e não travar
  function abrirJanelaImpressao(html: string) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) {
      w.onafterprint = () => { w.close(); URL.revokeObjectURL(url) }
      // fallback: revogar URL após 30s mesmo sem imprimir
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
  }

  function gerarHTMLContrato(contrato: Contrato): string {
    if (!os) return ''
    const nomeLoja = cfgLoja.loja_nome || 'SOS Celulares'
    const cnpjLoja = cfgLoja.loja_cnpj || ''
    const garantiaDias = cfgLoja.garantia_dias || '90'
    const prazoRetirada = cfgLoja.retirada_prazo_dias || '90'
    const taxaMensal = cfgLoja.retirada_taxa_mensal || '10'
    const vFinal = valorFinal ? parseFloat(valorFinal) : (os.valor_orcamento ?? 0)
    const vDesc = desconto ? parseFloat(desconto) : 0

    const conteudoPreenchido = (contrato.conteudo ?? '')
      .replace(/{nome}/g, os.clientes?.nome ?? '—')
      .replace(/{cpf}/g, os.clientes?.cpf ?? '—')
      .replace(/{modelo}/g, os.modelo ?? '—')
      .replace(/{imei}/g, os.imei ?? '—')
      .replace(/{valor}/g, `R$ ${(vFinal - vDesc).toFixed(2).replace('.', ',')}`)
      .replace(/{garantia_dias}/g, garantiaDias)
      .replace(/{prazo_retirada}/g, prazoRetirada)
      .replace(/{taxa_armazenagem}/g, taxaMensal)
      .replace(/{empresa_nome}/g, nomeLoja)
      .replace(/{data}/g, new Date().toLocaleDateString('pt-BR'))

    return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<title>${contrato.titulo} — OS #${os.numero}</title>
<style>
  @page { size: A4; margin: 20mm 15mm; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.7; }
  .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a; }
  .logo-nome { font-size: 18pt; font-weight: 700; color: #0f172a; }
  .sub { font-size: 9pt; color: #64748b; margin-top: 4px; }
  h1 { font-size: 14pt; font-weight: 700; text-align: center; margin: 20px 0; color: #0f172a; }
  .os-ref { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; margin-bottom: 20px; font-size: 10pt; color: #64748b; display: flex; gap: 24px; }
  .os-ref strong { color: #0f172a; }
  .conteudo { font-size: 10.5pt; line-height: 1.8; white-space: pre-wrap; margin-bottom: 32px; }
  .assinaturas { display: flex; gap: 48px; margin-top: 48px; }
  .ass-box { flex: 1; text-align: center; }
  .ass-img { max-height: 48px; max-width: 160px; display: block; margin: 0 auto 4px; }
  .ass-linha { border-top: 1px solid #0f172a; margin-bottom: 6px; }
  .ass-label { font-size: 9pt; color: #374151; }
  .footer { margin-top: 32px; text-align: center; font-size: 8pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
</style></head><body>
<div class="header">
  <div class="logo-nome">${nomeLoja}</div>
  ${cnpjLoja ? `<div class="sub">CNPJ: ${cnpjLoja}</div>` : ''}
</div>
<h1>${contrato.titulo}</h1>
<div class="os-ref">
  <span><strong>OS:</strong> #${os.numero}</span>
  <span><strong>Cliente:</strong> ${os.clientes?.nome ?? '—'}</span>
  <span><strong>Aparelho:</strong> ${os.modelo ?? '—'}</span>
  <span><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</span>
</div>
<div class="conteudo">${conteudoPreenchido}</div>
<div class="assinaturas">
  ${contrato.requer_assinatura_cliente ? `<div class="ass-box"><div style="height:48px"></div><div class="ass-linha"></div><div class="ass-label">Assinatura do cliente<br>${os.clientes?.nome ?? ''}</div></div>` : ''}
  ${contrato.requer_assinatura_gestor ? `<div class="ass-box">${assinaturaLoja ? `<img src="${assinaturaLoja}" class="ass-img" />` : '<div style="height:48px"></div>'}<div class="ass-linha"></div><div class="ass-label">Responsável técnico<br>${nomeLoja}</div></div>` : ''}
</div>
<div class="footer">${nomeLoja}${cnpjLoja ? ` · CNPJ ${cnpjLoja}` : ''} · OS #${os.numero} · ${new Date().toLocaleDateString('pt-BR')}</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
  }

  function gerarHTMLOS(): string {
    if (!os) return ''
    const formato = cfgLoja.recibo_os_formato || 'a4'
    const nomeLoja = cfgLoja.loja_nome || 'SOS Celulares'
    const telLoja = cfgLoja.loja_telefone || ''
    const emailLoja = cfgLoja.loja_email || ''
    const endLoja = cfgLoja.loja_endereco || ''
    const cnpjLoja = cfgLoja.loja_cnpj || ''
    const prazoRetirada = cfgLoja.retirada_prazo_dias || '90'
    const taxaMensal = cfgLoja.retirada_taxa_mensal || '10'
    const garantiaDias = cfgLoja.garantia_dias || '90'
    const senha = parseSenha(os.senha_aparelho)
    let senhaTexto = 'Não informada'
    if (senha) {
      if (senha.tipo === 'pin') senhaTexto = `PIN: ${senha.valor}`
      else if (senha.tipo === 'senha') senhaTexto = `Senha: ${senha.valor}`
      else if (senha.tipo === 'padrao') senhaTexto = `Padrão: ${senha.sequencia.map((n: number) => n + 1).join('-')}`
    }
    const vFinal = valorFinal ? parseFloat(valorFinal) : (os.valor_orcamento ?? 0)
    const vDesc = desconto ? parseFloat(desconto) : 0
    const vTotal = (vFinal - vDesc).toFixed(2).replace('.', ',')
    const dataOS = new Date(os.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const horaOS = new Date(os.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const dataLimite = new Date(new Date(os.created_at).getTime() + parseInt(prazoRetirada) * 86400000).toLocaleDateString('pt-BR')
    const itensRows = itensOrc.map(i =>
      `<tr><td>${i.descricao}</td><td class="c">${i.quantidade}</td><td class="r">R$&nbsp;${i.preco_unit.toFixed(2).replace('.', ',')}</td><td class="r">R$&nbsp;${i.subtotal.toFixed(2).replace('.', ',')}</td></tr>`
    ).join('')

    if (formato === '58mm') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: 58mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 9pt; width: 54mm; padding: 3mm 2mm; color: #000; background: #fff; }
  .center { text-align: center; } .bold { font-weight: bold; }
  .nome-loja { font-size: 12pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .sub-loja { font-size: 7.5pt; text-align: center; color: #444; margin-bottom: 1mm; }
  .dashed { border-top: 1px dashed #000; margin: 2mm 0; }
  .solid { border-top: 1px solid #000; margin: 2mm 0; }
  .os-numero { font-size: 16pt; font-weight: bold; text-align: center; }
  .section-title { font-size: 7pt; text-transform: uppercase; font-weight: bold; color: #333; margin-bottom: 1mm; }
  .row { display: flex; justify-content: space-between; margin-bottom: 0.5mm; }
  .row span:first-child { color: #555; font-size: 8pt; }
  .row span:last-child { font-weight: bold; font-size: 8pt; text-align: right; max-width: 32mm; }
  .item-row { display: flex; justify-content: space-between; padding: 1mm 0; border-bottom: 1px dotted #ccc; font-size: 8pt; }
  .total-row { display: flex; justify-content: space-between; padding: 1mm 0; font-size: 10pt; font-weight: bold; }
  .aviso { font-size: 7pt; line-height: 1.6; color: #333; }
  .ass-line { border-top: 1px solid #000; margin-top: 8mm; margin-bottom: 1mm; }
  .ass-label { font-size: 7pt; text-align: center; color: #555; }
  .footer { font-size: 6.5pt; text-align: center; color: #777; margin-top: 2mm; }
</style></head><body>
<div class="nome-loja">${nomeLoja}</div>
${endLoja ? `<div class="sub-loja">${endLoja}</div>` : ''}
${telLoja ? `<div class="sub-loja">${telLoja}</div>` : ''}
${cnpjLoja ? `<div class="sub-loja">CNPJ: ${cnpjLoja}</div>` : ''}
<div class="solid"></div>
<div style="text-align:center;margin:2mm 0"><div style="font-size:7pt;text-transform:uppercase;color:#555">Ordem de Serviço</div>
<div class="os-numero">#${os.numero}</div>
<div class="sub-loja">${dataOS} às ${horaOS}</div></div>
<div class="dashed"></div>
<div class="section-title">▸ Cliente</div>
<div class="row"><span>Nome</span><span>${os.clientes?.nome ?? '—'}</span></div>
${os.clientes?.telefone ? `<div class="row"><span>Tel.</span><span>${formatPhone(os.clientes.telefone)}</span></div>` : ''}
<div class="dashed"></div>
<div class="section-title">▸ Aparelho</div>
<div class="row"><span>Modelo</span><span>${os.modelo ?? '—'}</span></div>
${os.imei ? `<div class="row"><span>IMEI</span><span>${os.imei}</span></div>` : ''}
${os.cor ? `<div class="row"><span>Cor</span><span>${os.cor}</span></div>` : ''}
<div class="row"><span>Senha</span><span>${senhaTexto}</span></div>
<div class="dashed"></div>
<div class="section-title">▸ Defeito</div>
<div style="font-size:8pt;line-height:1.5;margin-bottom:1mm">${os.defeito_relatado}</div>
<div class="dashed"></div>
<div class="section-title">▸ Financeiro</div>
${itensOrc.map(i => `<div class="item-row"><span>${i.descricao} x${i.quantidade}</span><span>R$ ${i.subtotal.toFixed(2).replace('.', ',')}</span></div>`).join('')}
<div class="total-row"><span>TOTAL</span><span>R$ ${vTotal}</span></div>
<div class="row"><span>Pagamento</span><span>${formaPagamento || '—'}</span></div>
<div class="row"><span>Status</span><span>${pago ? '✓ PAGO' : 'PENDENTE'}</span></div>
<div class="dashed"></div>
<div class="aviso">Prazo retirada: <b>${prazoRetirada}d</b> (${dataLimite})<br>Após prazo: R$ ${taxaMensal},00/mês<br>Garantia: <b>${garantiaDias} dias</b></div>
<div class="dashed"></div>
<div class="ass-line"></div><div class="ass-label">Assinatura do cliente</div>
<div class="footer">CDC (Lei 8.078/90) · ${nomeLoja}</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
    }

    if (formato === '80mm') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 9.5pt; width: 76mm; padding: 3mm 3mm; color: #000; background: #fff; }
  .nome-loja { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .sub-loja { font-size: 8pt; text-align: center; color: #444; line-height: 1.6; }
  .dashed { border-top: 1px dashed #000; margin: 2.5mm 0; }
  .solid { border-top: 2px solid #000; margin: 2mm 0; }
  .os-badge { text-align: center; padding: 2mm 0; border: 1px solid #000; border-radius: 2mm; margin: 2mm 0; }
  .os-numero { font-size: 20pt; font-weight: bold; }
  .section-title { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 0.5mm; margin-bottom: 1.5mm; }
  .row { display: flex; justify-content: space-between; margin-bottom: 0.7mm; font-size: 8.5pt; }
  .row .label { color: #555; } .row .value { font-weight: bold; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  table th { border-bottom: 1px solid #000; padding: 1mm 0.5mm; text-align: left; }
  table th:last-child, table td:last-child { text-align: right; }
  table td { padding: 1mm 0.5mm; border-bottom: 1px dotted #ccc; }
  .total-row { display: flex; justify-content: space-between; padding: 1.5mm 0; font-size: 12pt; font-weight: bold; border-top: 2px solid #000; }
  .aviso-box { border: 1px solid #555; padding: 1.5mm 2mm; margin: 1mm 0; }
  .ass-line { display: flex; gap: 5mm; margin-top: 3mm; }
  .ass-box { flex: 1; } .ass-l { border-top: 1px solid #000; margin-bottom: 1mm; }
  .ass-label { font-size: 7pt; text-align: center; color: #555; }
  .footer { font-size: 6.5pt; text-align: center; color: #777; margin-top: 3mm; border-top: 1px dashed #ccc; padding-top: 1.5mm; }
</style></head><body>
<div class="nome-loja">${nomeLoja}</div>
<div class="sub-loja">${endLoja ? endLoja + '<br>' : ''}${telLoja}${emailLoja ? ' · ' + emailLoja : ''}${cnpjLoja ? '<br>CNPJ: ' + cnpjLoja : ''}</div>
<div class="solid"></div>
<div class="os-badge"><div style="font-size:7.5pt;text-transform:uppercase;color:#555">Ordem de Serviço</div><div class="os-numero">#${os.numero}</div><div class="sub-loja">${dataOS} · ${horaOS}</div></div>
<div class="section-title">Cliente</div>
<div class="row"><span class="label">Nome</span><span class="value">${os.clientes?.nome ?? '—'}</span></div>
${os.clientes?.telefone ? `<div class="row"><span class="label">Telefone</span><span class="value">${formatPhone(os.clientes.telefone)}</span></div>` : ''}
<div class="dashed"></div>
<div class="section-title">Aparelho</div>
<div class="row"><span class="label">Modelo</span><span class="value">${os.modelo ?? '—'}</span></div>
${os.imei ? `<div class="row"><span class="label">IMEI</span><span class="value">${os.imei}</span></div>` : ''}
${os.cor ? `<div class="row"><span class="label">Cor</span><span class="value">${os.cor}</span></div>` : ''}
<div class="row"><span class="label">Senha</span><span class="value">${senhaTexto}</span></div>
<div class="dashed"></div>
<div class="section-title">Defeito</div>
<div style="font-size:8.5pt;line-height:1.6;background:#f5f5f5;padding:1.5mm 2mm;border-left:2px solid #000;margin-bottom:1mm">${os.defeito_relatado}</div>
<div class="dashed"></div>
<div class="section-title">Orçamento</div>
${itensOrc.length > 0 ? `<table><thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${itensRows}</tbody></table>` : ''}
<div class="total-row"><span>TOTAL</span><span>R$ ${vTotal}</span></div>
<div class="row" style="margin-top:1mm"><span class="label">Pagamento</span><span class="value">${formaPagamento || '—'} — ${pago ? '✓ PAGO' : 'PENDENTE'}</span></div>
<div class="aviso-box"><b>Retirada:</b> ${prazoRetirada}d · Até ${dataLimite}<br><b>Armazenamento:</b> R$ ${taxaMensal},00/mês<br><b>Garantia:</b> ${garantiaDias} dias</div>
<div class="ass-line">
  <div class="ass-box"><div style="height:20mm"></div><div class="ass-l"></div><div class="ass-label">Assinatura do cliente</div></div>
  <div class="ass-box">${assinaturaLoja ? `<img src="${assinaturaLoja}" style="max-height:20mm;max-width:80pt;display:block;margin-bottom:1pt" />` : '<div style="height:20mm"></div>'}<div class="ass-l"></div><div class="ass-label">Técnico responsável</div></div>
</div>
<div class="footer">CDC (Lei 8.078/90) · ${nomeLoja}${cnpjLoja ? ' · CNPJ ' + cnpjLoja : ''}</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
    }

    // ── A4 PORTRAIT — cada via ocupa metade da folha (148mm) ──
    const via = (titulo: string, accentColor: string, isCliente: boolean) => `
<div class="via">
  <div class="via-header">
    <div class="header-left">
      <div class="loja-nome">${nomeLoja}</div>
      <div class="loja-sub">${[endLoja, telLoja, emailLoja, cnpjLoja ? 'CNPJ: ' + cnpjLoja : ''].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="header-right">
      <div class="via-tag" style="color:${accentColor}">${titulo}</div>
      <div class="os-num" style="color:${accentColor}">#${os.numero}</div>
      <div class="os-meta">${dataOS} · ${horaOS}</div>
    </div>
  </div>

  <div class="grid-3">
    <div class="bloco">
      <div class="bloco-title" style="color:${accentColor}">CLIENTE</div>
      <div class="field"><span>Nome</span><strong>${os.clientes?.nome ?? '—'}</strong></div>
      <div class="field"><span>Telefone</span><strong>${os.clientes?.telefone ? formatPhone(os.clientes.telefone) : '—'}</strong></div>
      <div class="field"><span>CPF</span><strong>${os.clientes?.cpf ?? '—'}</strong></div>
    </div>
    <div class="bloco">
      <div class="bloco-title" style="color:${accentColor}">APARELHO</div>
      <div class="field"><span>Modelo</span><strong>${os.modelo ?? '—'}</strong></div>
      <div class="field"><span>IMEI</span><strong style="font-family:monospace;font-size:9pt">${os.imei ?? '—'}</strong></div>
      <div class="field"><span>Cor</span><strong>${os.cor ?? '—'}</strong></div>
      ${!isCliente ? `<div class="field"><span>Senha</span><strong>${senhaTexto}</strong></div>` : ''}
      ${os.acessorios?.length ? `<div class="field"><span>Acessórios</span><strong>${os.acessorios.join(', ')}</strong></div>` : ''}
    </div>
    <div class="bloco">
      <div class="bloco-title" style="color:${accentColor}">FINANCEIRO</div>
      ${itensOrc.length > 0 ? `
      <table class="items-table">
        <thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
        <tbody>${itensRows}</tbody>
      </table>` : ''}
      <div class="total-block" style="border-color:${accentColor}">
        <span>Total</span>
        <span class="total-val" style="color:${accentColor}">R$ ${vTotal}</span>
      </div>
      <div class="field" style="margin-top:4pt">
        <span>Pagamento</span>
        <strong>${formaPagamento || '—'} <span class="badge ${pago ? 'badge-pago' : 'badge-pend'}">${pago ? '✓ PAGO' : 'PENDENTE'}</span></strong>
      </div>
    </div>
  </div>

  <div class="defeito-row">
    <div class="bloco-title" style="color:${accentColor}">DEFEITO RELATADO</div>
    <div class="defeito-text">${os.defeito_relatado}</div>
  </div>

  <div class="grid-2">
    <div class="policy-box" style="border-color:#dc2626">
      <div class="bloco-title" style="color:#dc2626">PRAZO DE RETIRADA</div>
      <p>Prazo: <strong>${prazoRetirada} dias</strong> · Limite: <strong>${dataLimite}</strong></p>
      <p>Após o prazo: <strong>R$ ${taxaMensal},00/mês</strong> de armazenamento.</p>
    </div>
    <div class="policy-box" style="border-color:#d97706">
      <div class="bloco-title" style="color:#d97706">GARANTIA — ${garantiaDias} DIAS</div>
      <p><strong>Cobre:</strong> defeito de mão de obra e peças com vício de fabricação.</p>
      <p><strong>Não cobre:</strong> queda, umidade, mau uso, danos elétricos, tentativa de reparo por terceiros, danos externos ou por software.</p>
      <p style="margin-top:2pt;font-size:6.5pt;color:#92400e">A garantia é anulada caso qualquer uma das condições acima seja identificada.</p>
    </div>
  </div>

  <div class="sig-area">
    <p class="sig-note">Declaro estar ciente e de acordo com todas as condições acima.</p>
    <div class="sig-row">
      <div class="sig-box">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div class="sig-label">Assinatura do cliente<br>${os.clientes?.nome ?? ''}</div>
      </div>
      <div class="sig-box">
        ${assinaturaLoja ? `<img src="${assinaturaLoja}" class="sig-img" />` : '<div class="sig-space"></div>'}
        <div class="sig-line"></div>
        <div class="sig-label">Técnico responsável<br>${nomeLoja}</div>
      </div>
    </div>
  </div>

  <div class="via-footer">Em conformidade com o CDC (Lei 8.078/90) · ${nomeLoja}${cnpjLoja ? ' · CNPJ ' + cnpjLoja : ''}</div>
</div>`

    return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<title>OS #${os.numero} — ${nomeLoja}</title>
<style>
  @page { size: A4 landscape; margin: 5mm 6mm; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 8pt; color: #1e293b; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; height: 100vh; overflow: hidden; }
  .page { width: 100%; height: 100vh; display: flex; flex-direction: row; gap: 0; align-items: stretch; }

  /* Separador */
  .sep { display: flex; flex-direction: column; align-items: center; gap: 4pt; padding: 0 4pt; flex-shrink: 0; }
  .sep-line { flex: 1; border-left: 1.5px dashed #cbd5e1; }
  .sep-text { writing-mode: vertical-rl; font-size: 5.5pt; color: #94a3b8; letter-spacing: 3px; text-transform: uppercase; white-space: nowrap; }

  /* Via — cada uma ocupa exatamente metade da folha landscape */
  .via { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4pt; border: 1px solid #e2e8f0; border-radius: 4pt; overflow: hidden; }

  /* Header */
  .via-header { background: #0f172a; padding: 7pt 9pt; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
  .loja-nome { font-size: 11pt; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px; }
  .loja-sub { font-size: 6pt; color: #94a3b8; margin-top: 1pt; line-height: 1.5; }
  .via-tag { font-size: 5.5pt; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; }
  .os-num { font-size: 18pt; font-weight: 700; letter-spacing: -1px; line-height: 1.1; }
  .os-meta { font-size: 6pt; color: #94a3b8; margin-top: 1pt; }
  .header-right { text-align: right; }

  /* Conteúdo */
  .grid-3 { display: flex; gap: 5pt; padding: 6pt 7pt 0; flex-shrink: 0; }
  .grid-2 { display: flex; gap: 5pt; padding: 0 7pt; flex-shrink: 0; }
  .bloco { flex: 1; }
  .bloco-title { font-size: 5.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 3pt; padding-bottom: 2pt; border-bottom: 1px solid currentColor; opacity: 0.8; }
  .field { display: flex; justify-content: space-between; align-items: baseline; padding: 1pt 0; border-bottom: 1px solid #f8fafc; gap: 4pt; }
  .field span { font-size: 7pt; color: #64748b; flex-shrink: 0; }
  .field strong { font-size: 7pt; font-weight: 600; text-align: right; }

  /* Tabela itens */
  .items-table { width: 100%; border-collapse: collapse; font-size: 6.5pt; margin-bottom: 2pt; }
  .items-table th { background: #f8fafc; padding: 1.5pt 2pt; text-align: left; font-size: 6pt; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
  .items-table th:nth-child(n+2), .items-table td:nth-child(n+2) { text-align: right; }
  .items-table td { padding: 1.5pt 2pt; border-bottom: 1px dotted #e2e8f0; }
  .total-block { display: flex; justify-content: space-between; align-items: center; padding: 3pt 3pt; background: #f8fafc; border-radius: 3pt; border-left: 3pt solid; margin-top: 2pt; }
  .total-val { font-size: 10pt; font-weight: 700; }
  .badge { font-size: 6pt; font-weight: 700; padding: 1pt 4pt; border-radius: 20pt; }
  .badge-pago { background: #dcfce7; color: #166534; }
  .badge-pend { background: #fef9c3; color: #854d0e; }

  /* Defeito */
  .defeito-row { padding: 0 7pt; flex-shrink: 0; }
  .defeito-text { font-size: 7pt; color: #374151; line-height: 1.5; background: #f8fafc; padding: 3pt 5pt; border-radius: 3pt; border-left: 2pt solid #e2e8f0; margin-top: 2pt; }

  /* Políticas */
  .policy-box { flex: 1; padding: 4pt 6pt; border-left: 2.5pt solid; }
  .policy-box p { font-size: 6.5pt; color: #374151; line-height: 1.6; margin-top: 1pt; }

  /* Assinaturas */
  .sig-area { padding: 3pt 7pt 4pt; border-top: 1px solid #e2e8f0; margin-top: auto; flex-shrink: 0; }
  .sig-note { font-size: 6pt; color: #64748b; font-style: italic; margin-bottom: 5pt; }
  .sig-row { display: flex; gap: 6pt; }
  .sig-box { flex: 1; }
  .sig-space { height: 14pt; }
  .sig-img { max-height: 22pt; max-width: 80pt; display: block; margin-bottom: 2pt; }
  .sig-line { border-top: 1px solid #1e293b; margin-bottom: 2pt; }
  .sig-label { font-size: 6pt; color: #64748b; text-align: center; line-height: 1.4; }

  /* Footer */
  .via-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 2pt 7pt; font-size: 5.5pt; color: #94a3b8; flex-shrink: 0; }
</style></head><body>
<div class="page">
  ${via('VIA DA ASSISTÊNCIA', '#818cf8', false)}
  <div class="sep">
    <div class="sep-line"></div>
    <div class="sep-text">✂ recortar aqui</div>
    <div class="sep-line"></div>
  </div>
  ${via('VIA DO CLIENTE', '#10b981', true)}
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando...</div>
  if (!os) return (
    <div style={{ padding: 60, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
      <p style={{ color: '#94a3b8' }}>OS não encontrada.</p>
      {loadError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8, fontFamily: 'monospace' }}>Erro: {loadError}</p>}
      <button onClick={() => router.back()} style={{ marginTop: 16, padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>← Voltar</button>
    </div>
  )

  async function criarPixPresencial() {
    const valor = valorFinal ? parseFloat(valorFinal) : (os?.valor_orcamento ?? 0)
    if (!valor || valor <= 0) return
    setPixCriando(true)
    try {
      const res = await fetch('/api/pix/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenciaId: id, tipoReferencia: 'os', valor, modalidade: 'presencial', descricao: `OS #${os?.numero} — ${os?.modelo ?? 'aparelho'}` }),
      })
      const data = await res.json() as { cobrancaId?: string; qrCodeBase64?: string; pixCopiaCola?: string; expiraEm?: string; error?: string }
      if (!res.ok || !data.cobrancaId) { alert(data.error ?? 'Erro ao gerar PIX'); return }
      sessionStorage.setItem(`pix_${data.cobrancaId}`, JSON.stringify({ qrCodeBase64: data.qrCodeBase64, pixCopiaCola: data.pixCopiaCola, expiraEm: data.expiraEm, valor, tipoReferencia: 'os', referenciaId: id }))
      router.push(`/pagamento/${data.cobrancaId}`)
    } finally {
      setPixCriando(false)
    }
  }

  async function criarPixRemoto() {
    const valor = valorFinal ? parseFloat(valorFinal) : (os?.valor_orcamento ?? 0)
    if (!valor || valor <= 0) return
    setPixCriando(true)
    try {
      const res = await fetch('/api/pix/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenciaId: id, tipoReferencia: 'os', valor, modalidade: 'remoto', descricao: `OS #${os?.numero} — ${os?.modelo ?? 'aparelho'}` }),
      })
      const data = await res.json() as { cobrancaId?: string; pixCopiaCola?: string; expiraEm?: string; error?: string }
      if (!res.ok || !data.cobrancaId) { alert(data.error ?? 'Erro ao gerar PIX'); return }
      setPixModal({ cobrancaId: data.cobrancaId, pixCopiaCola: data.pixCopiaCola!, valor, expiraEm: data.expiraEm!, temTelefone: !!(os?.clientes?.telefone) })
    } finally {
      setPixCriando(false)
    }
  }

  const st = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.aberta
  const senha = parseSenha(os.senha_aparelho)
  const valorTotal = valorFinal ? (parseFloat(valorFinal) - (parseFloat(desconto) || 0)) : null
  const totalOrc = itensOrc.reduce((s, i) => s + i.subtotal, 0)
  const lucroOrc = itensOrc.reduce((s, i) => s + (i.preco_unit - i.custo_unit) * i.quantidade, 0)

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', width: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>←</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em' }}>OS #{os.numero}</h1>
              <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.icon} {st.label}</span>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{new Date(os.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>

        {/* Botões de impressão */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={imprimir} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            🖨 Imprimir OS
          </button>
          {contratos.map(c => (
            <button key={c.id} onClick={() => imprimirContrato(c)} style={{ padding: '9px 16px', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#eef2ff', cursor: 'pointer', color: '#3730a3', display: 'flex', alignItems: 'center', gap: 6 }}>
              📄 {c.titulo}
            </button>
          ))}
          <button onClick={salvar} disabled={saving} style={{ padding: '9px 20px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#713f12', lineHeight: 1.6 }}>
        <strong>📋 Políticas:</strong> prazo de retirada {cfgLoja.retirada_prazo_dias || 90} dias · taxa R$ {cfgLoja.retirada_taxa_mensal || 10},00/mês após o prazo · garantia cobre apenas o serviço realizado.
      </div>

      {os.status === 'aguardando_diagnostico' && !showDiagnostico && (
        <button
          onClick={() => setShowDiagnostico(true)}
          style={{
            padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 16,
          }}
        >
          🔬 Iniciar Diagnóstico
        </button>
      )}

      {showDiagnostico && (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: '20px 24px', marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            🔬 Diagnóstico Técnico
          </h3>

          {([
            {
              key: 'tela' as const,
              label: 'Tela / Display',
              itens: [
                { key: 'toque', label: 'Toque com problema' },
                { key: 'imagem', label: 'Imagem com problema' },
                { key: 'quebrado', label: 'Display quebrado' },
              ],
            },
            {
              key: 'bateria' as const,
              label: 'Bateria',
              itens: [
                { key: 'autonomia', label: 'Autonomia ruim' },
                { key: 'naoCarrega', label: 'Não carrega' },
                { key: 'inchada', label: 'Bateria inchada' },
              ],
            },
            {
              key: 'camera' as const,
              label: 'Câmera',
              itens: [
                { key: 'frontal', label: 'Câmera frontal' },
                { key: 'traseira', label: 'Câmera traseira' },
                { key: 'foco', label: 'Problema de foco' },
              ],
            },
            {
              key: 'placa' as const,
              label: 'Placa',
              itens: [
                { key: 'naoLiga', label: 'Não liga' },
                { key: 'travamentos', label: 'Travamentos' },
                { key: 'semSinal', label: 'Sem sinal de rede' },
              ],
            },
            {
              key: 'conector' as const,
              label: 'Conector',
              itens: [
                { key: 'usb', label: 'USB / Carregamento' },
                { key: 'audio', label: 'Áudio / P2' },
              ],
            },
            {
              key: 'estrutura' as const,
              label: 'Estrutura',
              itens: [
                { key: 'carcaca', label: 'Carcaça danificada' },
                { key: 'botoes', label: 'Botões físicos' },
              ],
            },
          ] as const).map(cat => (
            <div key={cat.key} style={{ marginBottom: 12, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div
                onClick={() => setDiagForm(f => ({
                  ...f,
                  [cat.key]: { ...f[cat.key], selecionada: !f[cat.key].selecionada },
                }))}
                style={{
                  padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  background: diagForm[cat.key].selecionada ? '#f5f3ff' : '#f8fafc',
                  borderBottom: diagForm[cat.key].selecionada ? '1px solid #e2e8f0' : 'none',
                }}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={diagForm[cat.key].selecionada}
                  style={{ width: 16, height: 16, accentColor: '#6366f1', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{cat.label}</span>
              </div>
              {diagForm[cat.key].selecionada && (
                <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {cat.itens.map(item => (
                    <button
                      key={item.key}
                      onClick={() => setDiagForm(f => ({
                        ...f,
                        [cat.key]: {
                          ...f[cat.key],
                          itens: {
                            ...f[cat.key].itens,
                            [item.key]: !f[cat.key].itens[item.key],
                          },
                        },
                      }))}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid',
                        background: diagForm[cat.key].itens[item.key] ? '#fee2e2' : '#f8fafc',
                        color: diagForm[cat.key].itens[item.key] ? '#dc2626' : '#64748b',
                        borderColor: diagForm[cat.key].itens[item.key] ? '#fecaca' : '#e2e8f0',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                  {cat.key === 'tela' && (
                    <div style={{ width: '100%', marginTop: 8 }}>
                      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                        Tipo de display para o reparo
                      </label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['original', 'incell', 'oled', 'amoled'] as const).map(tipo => (
                          <button
                            key={tipo}
                            onClick={() => setDiagForm(f => ({
                              ...f,
                              tela: { ...f.tela, tipoDisplay: tipo },
                            }))}
                            style={{
                              padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid',
                              background: diagForm.tela.tipoDisplay === tipo ? '#e0e7ff' : '#fff',
                              color: diagForm.tela.tipoDisplay === tipo ? '#3730a3' : '#64748b',
                              borderColor: diagForm.tela.tipoDisplay === tipo ? '#818cf8' : '#e2e8f0',
                              textTransform: 'capitalize',
                            }}
                          >
                            {tipo}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Valor e observações */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Valor do orçamento (R$)
              </label>
              <input
                type="number"
                value={valorOrcamento}
                onChange={e => setValorOrcamento(e.target.value)}
                placeholder="0,00"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Observações técnicas
              </label>
              <input
                value={obsTecnica}
                onChange={e => setObsTecnica(e.target.value)}
                placeholder="Notas para o técnico..."
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* Botões */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => setShowDiagnostico(false)}
              style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}
            >
              Cancelar
            </button>
            <button
              onClick={salvarDiagnostico}
              disabled={savingDiagnostico}
              style={{
                padding: '9px 20px',
                background: savingDiagnostico ? '#a5b4fc' : '#6366f1',
                color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
                cursor: savingDiagnostico ? 'not-allowed' : 'pointer',
              }}
            >
              {savingDiagnostico ? 'Salvando...' : 'Salvar Diagnóstico'}
            </button>
          </div>
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {([['os', '📋 OS'], ['orcamento', `🧾 Orçamento${itensOrc.length > 0 ? ` (${itensOrc.length})` : ''}`], ['checklist', '✅ Checklist']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setAba(key)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === key ? '#6366f1' : '#64748b', borderBottom: aba === key ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -1 }}>{label}</button>
        ))}
      </div>

      {/* ═══ ABA OS ═══ */}
      {aba === 'os' && (
        <>
          <div style={card}>
            <div style={cardTitle}><span>📊</span> Status da OS</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_FLOW.map((s) => {
                const cfg = STATUS_CONFIG[s]; const current = status === s; const past = STATUS_FLOW.indexOf(status) > STATUS_FLOW.indexOf(s)
                const mensagem = gerarMensagemWA(cfg.waMensagem, os, valorFinal)
                return (
                  <div key={s} style={{ flex: 1, minWidth: 140 }}>
                    <button onClick={() => setStatus(s)} style={{ width: '100%', padding: '10px 8px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: current ? 600 : 400, background: current ? cfg.bg : past ? '#f0fdf4' : '#f8fafc', color: current ? cfg.color : past ? '#065f46' : '#94a3b8', borderColor: current ? cfg.color : past ? '#86efac' : '#e2e8f0', textAlign: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 16 }}>{cfg.icon}</div><div style={{ marginTop: 2 }}>{cfg.label}</div>
                    </button>
                    {os.clientes?.telefone && (
                      <button onClick={() => abrirWhatsApp(os.clientes!.telefone, mensagem)} style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid #86efac', background: '#f0fdf4', color: '#065f46', cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <span style={{ fontSize: 13 }}>💬</span> WhatsApp
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={card}>
              <div style={cardTitle}><span>👤</span> Cliente</div>
              {os.clientes ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600 }}>{os.clientes.nome.charAt(0).toUpperCase()}</div>
                  <div><div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{os.clientes.nome}</div>{os.clientes.telefone && <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatPhone(os.clientes.telefone)}</div>}</div>
                </div>
              ) : <p style={{ fontSize: 13, color: '#94a3b8' }}>Cliente não identificado</p>}
            </div>

            <div style={card}>
              <div style={cardTitle}><span>📱</span> Aparelho</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[{ label: 'Modelo', value: os.modelo }, { label: 'IMEI', value: os.imei }, { label: 'Cor', value: os.cor }, { label: 'Acessórios', value: os.acessorios?.join(', ') }].map(r => r.value ? (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{r.value}</span>
                  </div>
                ) : null)}
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Senha</span>
                  {senha ? (senha.tipo === 'padrao' ? <PatternDisplay sequencia={senha.sequencia} /> : <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', background: '#f1f5f9', padding: '4px 10px', borderRadius: 6 }}>{senha.tipo === 'pin' ? 'PIN: ' : ''}{senha.valor}</span>) : <span style={{ fontSize: 12, color: '#ef4444', fontStyle: 'italic' }}>Não fornecida pelo cliente</span>}
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={cardTitle}><span>🔬</span> Defeito e diagnóstico</div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Defeito relatado pelo cliente</label><div style={{ fontSize: 13, color: '#1e293b', background: '#f8fafc', padding: '9px 12px', borderRadius: 7 }}>{os.defeito_relatado}</div></div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Defeito técnico</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={defeitoTecnico} onChange={e => setDefeitoTecnico(e.target.value)} placeholder="Diagnóstico técnico..." /></div>
              <div><label style={lbl}>Solução aplicada</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={solucao} onChange={e => setSolucao(e.target.value)} placeholder="O que foi feito..." /></div>
            </div>

            <div style={card}>
              <div style={cardTitle}><span>💰</span> Financeiro</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label style={lbl}>Orçamento inicial</label><div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', padding: '9px 12px', borderRadius: 7 }}>{os.valor_orcamento ? `R$ ${os.valor_orcamento.toFixed(2).replace('.', ',')}` : 'Não informado'}</div></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={lbl}>Valor final (R$)</label><input style={inp} type="number" value={valorFinal} onChange={e => setValorFinal(e.target.value)} placeholder="0,00" /></div>
                  <div><label style={lbl}>Desconto (R$)</label><input style={inp} type="number" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" /></div>
                </div>
                {valorTotal !== null && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 13, color: '#065f46' }}>Total a cobrar</span><span style={{ fontSize: 18, fontWeight: 700, color: '#065f46' }}>R$ {valorTotal.toFixed(2).replace('.', ',')}</span></div>}
                <div><label style={lbl}>Forma de pagamento</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{PAGAMENTOS.map(p => <button key={p} onClick={() => setFormaPagamento(p)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid', background: formaPagamento === p ? '#e0e7ff' : '#f8fafc', color: formaPagamento === p ? '#3730a3' : '#64748b', borderColor: formaPagamento === p ? '#818cf8' : '#e2e8f0' }}>{p}</button>)}</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div onClick={() => setPago(!pago)} style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: pago ? '#6366f1' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}><div style={{ position: 'absolute', top: 3, left: pago ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} /></div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: pago ? '#065f46' : '#64748b' }}>{pago ? '✅ Pagamento confirmado' : 'Aguardando pagamento'}</span>
                </div>
                {!pago && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button onClick={criarPixPresencial} disabled={pixCriando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: pixCriando ? 'not-allowed' : 'pointer', opacity: pixCriando ? 0.7 : 1 }}>
                      📱 Cobrar via PIX
                    </button>
                    <button onClick={criarPixRemoto} disabled={pixCriando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: pixCriando ? 'not-allowed' : 'pointer' }}>
                      📲 Enviar cobrança remota
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {pixModal && (
            <ModalPixRemoto
              cobrancaId={pixModal.cobrancaId}
              pixCopiaCola={pixModal.pixCopiaCola}
              valor={pixModal.valor}
              expiraEm={pixModal.expiraEm}
              temTelefone={pixModal.temTelefone}
              onClose={() => setPixModal(null)}
              onPago={() => { setPago(true); setPixModal(null) }}
            />
          )}

          <div style={card}><div style={cardTitle}><span>📝</span> Observações internas</div><textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Anotações internas..." /></div>
        </>
      )}

      {/* ═══ ABA ORÇAMENTO ═══ */}
      {aba === 'orcamento' && (
        <div>
          {itensOrc.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '14px 16px' }}><p style={{ fontSize: 11, color: '#4338ca', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total orçamento</p><p style={{ fontSize: 22, fontWeight: 700, color: '#3730a3' }}>R$ {totalOrc.toFixed(2).replace('.', ',')}</p></div>
              <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px' }}><p style={{ fontSize: 11, color: '#065f46', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lucro bruto estimado</p><p style={{ fontSize: 22, fontWeight: 700, color: '#065f46' }}>R$ {lucroOrc.toFixed(2).replace('.', ',')}</p></div>
              <div style={{ background: lucroOrc / totalOrc >= 0.3 ? '#ecfdf5' : '#fef3c7', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}><p style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Margem</p><p style={{ fontSize: 22, fontWeight: 700, color: lucroOrc / totalOrc >= 0.3 ? '#065f46' : '#92400e' }}>{totalOrc > 0 ? Math.round(lucroOrc / totalOrc * 100) : 0}%</p></div>
            </div>
          )}

          <div style={card}>
            <div style={cardTitle}><span>🔍</span> Adicionar peça ou serviço</div>
            {produtosCompat.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 8 }}>Peças compatíveis com <strong style={{ color: '#0f172a' }}>{os.modelo}</strong></p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {produtosCompat.map(p => {
                    const qc = QUALIDADE_CONFIG[p.qualidade] ?? QUALIDADE_CONFIG.compativel
                    const jaAdicionado = itensOrc.some(i => i.produto_id === p.id)
                    return (
                      <button key={p.id} onClick={() => adicionarProdOrc(p)} disabled={p.estoque_atual === 0} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid', cursor: p.estoque_atual === 0 ? 'not-allowed' : 'pointer', background: jaAdicionado ? '#e0e7ff' : p.estoque_atual === 0 ? '#f8fafc' : '#fff', borderColor: jaAdicionado ? '#818cf8' : '#e2e8f0', opacity: p.estoque_atual === 0 ? 0.5 : 1, fontSize: 12, textAlign: 'left' as const }}>
                        <div style={{ fontWeight: 500, color: jaAdicionado ? '#3730a3' : '#0f172a' }}>{p.nome}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 20, background: qc.bg, color: qc.color }}>{qc.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#6366f1' }}>R$ {p.preco_venda.toFixed(2).replace('.', ',')}</span>
                          <span style={{ fontSize: 10, color: p.estoque_atual === 0 ? '#ef4444' : '#94a3b8' }}>{p.estoque_atual === 0 ? 'Sem estoque' : `${p.estoque_atual} un`}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input style={inp} value={searchOrc} onChange={e => buscarProdOrc(e.target.value)} placeholder="Buscar qualquer produto pelo nome..." autoComplete="off" />
              {prodResultsOrc.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 4, overflow: 'hidden' }}>
                  {prodResultsOrc.map(p => (
                    <div key={p.id} onClick={() => adicionarProdOrc(p)} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', fontSize: 13 }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff' }} onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                      <div><p style={{ fontWeight: 500, color: '#0f172a' }}>{p.nome}</p><p style={{ fontSize: 11, color: '#94a3b8' }}>Estoque: {p.estoque_atual}</p></div>
                      <p style={{ fontWeight: 600, color: '#6366f1' }}>R$ {p.preco_venda.toFixed(2).replace('.', ',')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={adicionarAvulsoOrc} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Adicionar item avulso (serviço ou peça sem estoque)</button>
          </div>

          {itensOrc.length > 0 && (
            <div style={card}>
              <div style={cardTitle}><span>📋</span> Itens do orçamento</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Descrição', 'Qualidade', 'Fornecedor', 'Qtd', 'Custo unit', 'Preço unit', 'Subtotal', ''].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {itensOrc.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px' }}>{item.produto_id ? <span style={{ fontSize: 13, color: '#0f172a' }}>{item.descricao}</span> : <input style={{ ...inp, fontSize: 12 }} value={item.descricao} onChange={e => atualizarItemOrc(i, 'descricao', e.target.value)} placeholder="Descrição..." />}</td>
                      <td style={{ padding: '8px 10px' }}><select style={{ ...inp, fontSize: 11, padding: '4px 8px' }} value={item.qualidade} onChange={e => atualizarItemOrc(i, 'qualidade', e.target.value)}>{Object.entries(QUALIDADE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></td>
                      <td style={{ padding: '8px 10px' }}><select style={{ ...inp, fontSize: 11, padding: '4px 8px' }} value={item.fornecedor_id ?? ''} onChange={e => atualizarItemOrc(i, 'fornecedor_id', e.target.value || null)}><option value="">—</option>{fornecedoresOrc.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></td>
                      <td style={{ padding: '8px 10px' }}><input style={{ ...inp, width: 60, padding: '4px 8px', fontSize: 12, textAlign: 'center' }} type="number" min="1" value={item.quantidade} onChange={e => atualizarItemOrc(i, 'quantidade', parseInt(e.target.value) || 1)} /></td>
                      <td style={{ padding: '8px 10px' }}><input style={{ ...inp, width: 80, padding: '4px 8px', fontSize: 12 }} type="number" step="0.01" value={item.custo_unit} onChange={e => atualizarItemOrc(i, 'custo_unit', parseFloat(e.target.value) || 0)} /></td>
                      <td style={{ padding: '8px 10px' }}><input style={{ ...inp, width: 80, padding: '4px 8px', fontSize: 12 }} type="number" step="0.01" value={item.preco_unit} onChange={e => atualizarItemOrc(i, 'preco_unit', parseFloat(e.target.value) || 0)} /></td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap' }}>R$ {item.subtotal.toFixed(2).replace('.', ',')}</td>
                      <td style={{ padding: '8px 10px' }}><button onClick={() => removerItemOrc(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                <button onClick={salvarOrcamento} disabled={salvandoOrc} style={{ padding: '10px 24px', background: salvandoOrc ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvandoOrc ? 'not-allowed' : 'pointer' }}>{salvandoOrc ? 'Salvando...' : '💾 Salvar orçamento'}</button>
              </div>
              {status !== 'entregue' && <div style={{ marginTop: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>⚠ O estoque será baixado automaticamente quando o status for alterado para <strong>Entregue</strong>.</div>}
            </div>
          )}
        </div>
      )}

      {/* ═══ ABA CHECKLIST ═══ */}
      {aba === 'checklist' && (
        <div style={card}>
          <div style={cardTitle}><span>✅</span> Checklist de testes do aparelho</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {CHECKLIST_ITEMS.map(item => {
              const val = checklist[item.key] ?? 'nao_testado'
              return (
                <div key={item.key} style={{ background: val === 'ok' ? '#f0fdf4' : val === 'falha' ? '#fef2f2' : '#f8fafc', border: `1px solid ${val === 'ok' ? '#bbf7d0' : val === 'falha' ? '#fecaca' : '#e2e8f0'}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{item.icon}</span><span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{item.label}</span></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([['ok', '✅'], ['falha', '❌'], ['nao_testado', '—']] as const).map(([v, emoji]) => (
                      <button key={v} onClick={() => toggleChecklist(item.key, v)} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: val === v ? (v === 'ok' ? '#dcfce7' : v === 'falha' ? '#fee2e2' : '#e2e8f0') : '#fff', borderColor: val === v ? (v === 'ok' ? '#86efac' : v === 'falha' ? '#fca5a5' : '#94a3b8') : '#e2e8f0' }}>{emoji}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[{ label: 'OK', val: 'ok', color: '#065f46', bg: '#ecfdf5', emoji: '✅' }, { label: 'Com falha', val: 'falha', color: '#991b1b', bg: '#fef2f2', emoji: '❌' }, { label: 'Não testado', val: 'nao_testado', color: '#64748b', bg: '#f8fafc', emoji: '—' }].map(s => {
              const count = CHECKLIST_ITEMS.filter(i => (checklist[i.key] ?? 'nao_testado') === s.val).length
              return <div key={s.val} style={{ background: s.bg, borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}><span>{s.emoji}</span><span style={{ fontSize: 13, color: s.color, fontWeight: 500 }}>{s.label}: {count}</span></div>
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={salvar} disabled={saving} style={{ padding: '11px 28px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
