'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validarCPF, formatarCPF } from '@/lib/validators'

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Aparelho = {
  id: string; tipo: string; status: string
  marca: string; modelo: string; capacidade: string | null; cor: string | null
  imei: string | null; imei2: string | null; specs_json: Record<string, any>
  preco_compra: number | null; preco_venda: number | null
  checklist_json: Record<string, string>; checklist_nota: string | null
  observacoes: string | null; created_at: string
  senha_tipo: string | null; senha_valor: string | null
}

type ModalSucesso = {
  tipo: 'compra' | 'venda'
  numero: number
  aparelho: { marca: string; modelo: string; capacidade: string | null }
}

type AparelhoPC = {
  id: string; aparelho_id: string; item_key: string | null
  peca_nome: string; preco: number; chegou: boolean; trocada: boolean; created_at: string
}

type Dispositivo = {
  id: string; marca: string; modelo: string
  ram: string | null; armazenamento: string | null; tela: string | null
  resolucao: string | null; processador: string | null
  camera_principal: string | null; camera_frontal: string | null
  bateria: string | null; sistema: string | null
  dimensoes: string | null; peso: string | null; lancamento: string | null
}

// â”€â”€â”€ Checklist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CHECKLIST_ESTETICO = [
  { key: 'est_tela',      label: 'Tela (arranhÃµes/trincas)' },
  { key: 'est_carcaca',   label: 'CarcaÃ§a / Estrutura' },
  { key: 'est_aro',       label: 'Aro / Lateral' },
  { key: 'est_tampa',     label: 'Tampa traseira' },
  { key: 'est_lente_cam', label: 'Lente da cÃ¢mera' },
  { key: 'est_botoes',    label: 'BotÃµes (aparÃªncia)' },
  { key: 'est_conector',  label: 'Conector (aparÃªncia)' },
]
const CHECKLIST_FUNCIONAL = [
  { key: 'fn_liga',      label: 'Liga normalmente' },
  { key: 'fn_touch',     label: 'Touch / Toque' },
  { key: 'fn_cam_front', label: 'CÃ¢mera frontal' },
  { key: 'fn_cam_tras',  label: 'CÃ¢mera traseira' },
  { key: 'fn_bateria',   label: 'Bateria / Autonomia' },
  { key: 'fn_wifi_bt',   label: 'Wi-Fi / Bluetooth / GPS' },
  { key: 'fn_biometria', label: 'Biometria / Face ID' },
  { key: 'fn_falante',   label: 'Alto-falante' },
  { key: 'fn_microfone', label: 'Microfone' },
  { key: 'fn_conector',  label: 'Conector de carga' },
  { key: 'fn_imei',      label: 'IMEI verificado' },
  { key: 'fn_conta',     label: 'Conta Google/Apple removida' },
  { key: 'fn_reset',     label: 'Reset de fÃ¡brica feito' },
]
const CHECKLIST_ITENS = [...CHECKLIST_ESTETICO, ...CHECKLIST_FUNCIONAL]

const PART_MAP: Record<string,{peca:string; preco:number}> = {
  est_tela:      { peca:'Tela / Display',             preco:0 },
  est_carcaca:   { peca:'CarcaÃ§a / Chassi',           preco:0 },
  est_aro:       { peca:'Aro / Frame lateral',        preco:0 },
  est_tampa:     { peca:'Tampa traseira',             preco:0 },
  est_lente_cam: { peca:'Lente da cÃ¢mera',            preco:0 },
  est_botoes:    { peca:'Flex de botÃµes',             preco:0 },
  est_conector:  { peca:'Conector de carga',          preco:0 },
  fn_liga:       { peca:'DiagnÃ³stico placa / serviÃ§o',preco:0 },
  fn_touch:      { peca:'Touch / Digitalizador',      preco:0 },
  fn_cam_front:  { peca:'CÃ¢mera frontal',             preco:0 },
  fn_cam_tras:   { peca:'CÃ¢mera traseira',            preco:0 },
  fn_bateria:    { peca:'Bateria',                    preco:0 },
  fn_wifi_bt:    { peca:'Antena Wi-Fi/BT',            preco:0 },
  fn_biometria:  { peca:'Sensor biomÃ©trico',          preco:0 },
  fn_falante:    { peca:'Alto-falante',               preco:0 },
  fn_microfone:  { peca:'Microfone',                  preco:0 },
  fn_conector:   { peca:'Flex conector de carga',     preco:0 },
  fn_imei:       { peca:'ServiÃ§o (verificaÃ§Ã£o)',      preco:0 },
  fn_conta:      { peca:'ServiÃ§o (remoÃ§Ã£o conta)',    preco:0 },
  fn_reset:      { peca:'ServiÃ§o (reset)',            preco:0 },
}

const ESTADOS = [
  { v: 'Bom',     bg: '#ecfdf5', color: '#065f46', border: '#86efac' },
  { v: 'Regular', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  { v: 'Ruim',    bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  { v: 'N/A',     bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
]

const FORMAS_PGTO = ['Dinheiro','PIX','TransferÃªncia','CartÃ£o dÃ©bito','CartÃ£o crÃ©dito Ã  vista','CartÃ£o crÃ©dito parcelado']
const STATUS_CFG: Record<string, {label:string;bg:string;color:string}> = {
  sem_revisao:     { label: 'Sem revisÃ£o',      bg: '#fef3c7', color: '#92400e' },
  aguardando_pecas:{ label: 'Aguard. peÃ§as',    bg: '#fef2f2', color: '#991b1b' },
  em_reparo:       { label: 'Em reparo',        bg: '#fff7ed', color: '#c2410c' },
  checklist:       { label: 'Checklist',        bg: '#eff6ff', color: '#1d4ed8' },
  disponivel:      { label: 'DisponÃ­vel',       bg: '#ecfdf5', color: '#065f46' },
  vendido:         { label: 'Vendido',          bg: '#f1f5f9', color: '#64748b' },
}

const CHECKLIST_APROVACAO = [
  { key: 'liga',       label: 'Liga normalmente' },
  { key: 'touch',      label: 'Touch / Tela funcionando' },
  { key: 'cam_front',  label: 'CÃ¢mera frontal OK' },
  { key: 'cam_tras',   label: 'CÃ¢mera traseira OK' },
  { key: 'bateria',    label: 'Bateria (saÃºde OK)' },
  { key: 'wifi_bt',    label: 'Wifi / Bluetooth / GPS' },
  { key: 'biometria',  label: 'Biometria / Face ID' },
  { key: 'botoes',     label: 'BotÃµes fÃ­sicos (vol, power)' },
  { key: 'falante',    label: 'Alto-falante e microfone' },
  { key: 'conector',   label: 'Conector de carga' },
  { key: 'imei',       label: 'IMEI verificado' },
  { key: 'conta',      label: 'Conta Google/Apple removida' },
  { key: 'reset',      label: 'Reset de fÃ¡brica feito' },
]

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }
const sec: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em' }

// formatarCPF imported from @/lib/validators
function formatPhone(v: string) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4,5})(\d{4})$/,'$1-$2') }
function formatCEP(v: string) { return v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2') }
function fm(v: number) { return `R$ ${v.toFixed(2).replace('.',',')}` }

function notaGeral(cl: Record<string,string>): string {
  const vals = Object.values(cl).filter(v => v && v !== 'N/A')
  if (vals.length === 0) return 'NÃ£o avaliado'
  const ruim = vals.filter(v => v === 'Ruim').length
  const regular = vals.filter(v => v === 'Regular').length
  if (ruim > 2) return 'Ruim'
  if (ruim > 0 || regular > 3) return 'Regular'
  return 'Bom'
}

// â”€â”€â”€ Componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AparelhoPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'estoque'|'sem_revisao'|'aguardando_pecas'|'em_reparo'|'checklist'|'historico'|'comprar'|'vender'>('estoque')
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [search, setSearch] = useState('')

  // â”€â”€ Busca de modelo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [modeloInput, setModeloInput] = useState('')
  const [modeloSugestoes, setModeloSugestoes] = useState<Dispositivo[]>([])
  const [modeloSelecionado, setModeloSelecionado] = useState<Dispositivo | null>(null)
  const [buscandoSpecs, setBuscandoSpecs] = useState(false)
  const [showSugestoes, setShowSugestoes] = useState(false)
  const modeloTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // â”€â”€ Dados do aparelho â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [cTipo, setCTipo] = useState<'novo'|'usado'>('usado')
  const [cCapacidade, setCCapacidade] = useState('')
  const [cCor, setCCor] = useState('')
  const [cIMEI, setCIMEI] = useState('')
  const [cIMEI2, setCIMEI2] = useState('')
  const [cSenha, setCScenha] = useState('')
  const [cTipoSenha, setCTipoSenha] = useState<'nenhuma'|'pin'|'padrao'>('nenhuma')
  const [cPadrao, setCPadrao] = useState<number[]>([])
  const padCanvasRef = useRef<HTMLCanvasElement>(null)
  const [cChecklist, setCChecklist] = useState<Record<string,string>>({})
  const [cObs, setCObs] = useState('')

  // â”€â”€ Vendedor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [vNome, setVNome] = useState('')
  const [vCPF, setVCPF] = useState('')
  const [vCpfErro, setVCpfErro] = useState('')
  const [vRG, setVRG] = useState('')
  const [vTel, setVTel] = useState('')
  const [vEmail, setVEmail] = useState('')
  const [vCEP, setVCEP] = useState('')
  const [vEnd, setVEnd] = useState('')
  const [vBairro, setVBairro] = useState('')
  const [vCidade, setVCidade] = useState('')
  const [vEstado, setVEstado] = useState('')
  const [buscandoCEP, setBuscandoCEP] = useState(false)

  // â”€â”€ Pagamento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [cValor, setCValor] = useState('')
  const [cForma, setCForma] = useState('Dinheiro')
  const [cParcelas, setCParcelas] = useState(2)
  const [salvando, setSalvando] = useState(false)
  const [compraSalva, setCompraSalva] = useState<{id:string;numero:number}|null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [modalSucesso, setModalSucesso] = useState<ModalSucesso | null>(null)

  // â”€â”€ Refs para scroll/foco em campos obrigatÃ³rios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const modeloRef = useRef<HTMLInputElement>(null)
  const vNomeRef = useRef<HTMLInputElement>(null)
  const vCPFRef = useRef<HTMLInputElement>(null)
  const cValorRef = useRef<HTMLInputElement>(null)

  // â”€â”€ Foto do vendedor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [fotoVendedor, setFotoVendedor] = useState<string>('')
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fotoCanvasRef = useRef<HTMLCanvasElement>(null)
  const [streamAtivo, setStreamAtivo] = useState<MediaStream|null>(null)

  // â”€â”€ Assinaturas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const vendCanvasRef = useRef<HTMLCanvasElement>(null)
  const [desenhando, setDesenhando] = useState(false)
  const [assinaturaVendedor, setAssinaturaVendedor] = useState('')
  const [assinaturaLoja, setAssinaturaLoja] = useState('')

  // â”€â”€ Venda â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [aparelhoVenda, setAparelhoVenda] = useState<Aparelho|null>(null)
  const [bNome, setBNome] = useState('')
  const [bCPF, setBCPF] = useState('')
  const [bCpfErro, setBCpfErro] = useState('')
  const [bTel, setBTel] = useState('')
  const [bEmail, setBEmail] = useState('')
  const [bEnd, setBEnd] = useState('')
  const [bValor, setBValor] = useState('')
  const [bForma, setBForma] = useState('Dinheiro')
  const [bParcelas, setBParcelas] = useState(2)
  const [bGarantia, setBGarantia] = useState('90')
  const [vendaSalva, setVendaSalva] = useState<{id:string;numero:number}|null>(null)
  const comprCanvasRef = useRef<HTMLCanvasElement>(null)
  const [assinaturaComprador, setAssinaturaComprador] = useState('')

  // â”€â”€ Detail modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [detalhes, setDetalhes] = useState<Aparelho | null>(null)
  const [detalheEditando, setDetalheEditando] = useState(false)
  const [detalhePrecoVenda, setDetalhePrecoVenda] = useState('')
  const [detalheObs, setDetalheObs] = useState('')
  const [aprovacao, setAprovacao] = useState<Record<string, boolean>>({})
  const [salvandoStatus, setSalvandoStatus] = useState(false)

  // â”€â”€ MÃ¡quina de estados â€” modal peÃ§as â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [modalPecas, setModalPecas] = useState<AparelhoPC[]>([])
  const [novasPecas, setNovasPecas] = useState<{key:string;nome:string;preco:string;marcado:boolean}[]>([])
  const [semTodasPecas, setSemTodasPecas] = useState(false)
  const [liberarSemChecklist, setLiberarSemChecklist] = useState(false)
  const [checklistFinal, setChecklistFinal] = useState<Record<string,string>>({})
  const [pecaExtraNome, setPecaExtraNome] = useState('')
  const [loadingPecas, setLoadingPecas] = useState(false)

  async function atualizarStatus(id: string, novoStatus: string) {
    setSalvandoStatus(true)
    const { error } = await supabase.from('aparelhos').update({ status: novoStatus }).eq('id', id)
    setSalvandoStatus(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setAparelhos(prev => prev.map(a => a.id === id ? { ...a, status: novoStatus } : a))
    setDetalhes(d => d?.id === id ? { ...d, status: novoStatus } : d)
  }

  async function salvarEdicaoDetalhe() {
    if (!detalhes) return
    setSalvandoStatus(true)
    const payload: Record<string,unknown> = {}
    if (detalhePrecoVenda) payload.preco_venda = parseFloat(detalhePrecoVenda)
    if (detalheObs !== detalhes.observacoes) payload.observacoes = detalheObs || null
    await supabase.from('aparelhos').update(payload).eq('id', detalhes.id)
    const updated = { ...detalhes, ...payload }
    setDetalhes(updated as Aparelho)
    setAparelhos(prev => prev.map(a => a.id === detalhes.id ? updated as Aparelho : a))
    setDetalheEditando(false)
    setSalvandoStatus(false)
  }

  // â”€â”€ MÃ¡quina de estados â€” funÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function carregarPecas(aparelhoId: string) {
    setLoadingPecas(true)
    const { data } = await supabase.from('aparelho_pecas')
      .select('id,aparelho_id,item_key,peca_nome,preco,chegou,trocada,created_at')
      .eq('aparelho_id', aparelhoId).order('created_at')
    setModalPecas((data ?? []) as AparelhoPC[])
    setLoadingPecas(false)
  }

  async function salvarRevisaoPecas() {
    if (!detalhes) return
    const marcadas = novasPecas.filter(p => p.marcado)
    if (marcadas.length === 0) {
      await atualizarStatus(detalhes.id, 'disponivel'); return
    }
    setSalvandoStatus(true)
    await supabase.from('aparelho_pecas').insert(
      marcadas.map(p => ({ aparelho_id: detalhes.id, item_key: p.key, peca_nome: p.nome, preco: parseFloat(p.preco)||0 }))
    )
    // Somar custo das peÃ§as ao preco_compra do aparelho
    const custoPecas = marcadas.reduce((acc,p) => acc + (parseFloat(p.preco)||0), 0)
    if (custoPecas > 0) {
      const novoTotal = (detalhes.preco_compra ?? 0) + custoPecas
      await supabase.from('aparelhos').update({ preco_compra: novoTotal }).eq('id', detalhes.id)
      setDetalhes(d => d ? { ...d, preco_compra: novoTotal } : d)
      setAparelhos(prev => prev.map(a => a.id === detalhes.id ? { ...a, preco_compra: novoTotal } : a))
    }
    await atualizarStatus(detalhes.id, 'aguardando_pecas')
    setSalvandoStatus(false)
  }

  async function marcarPecaChegou(pecaId: string, chegou: boolean) {
    await supabase.from('aparelho_pecas').update({ chegou }).eq('id', pecaId)
    setModalPecas(prev => prev.map(p => p.id === pecaId ? { ...p, chegou } : p))
  }

  async function iniciarReparo() {
    if (!detalhes) return
    const todasChegaram = modalPecas.every(p => p.chegou)
    if (!todasChegaram && !semTodasPecas) return
    await atualizarStatus(detalhes.id, 'em_reparo')
  }

  async function marcarPecaTrocada(pecaId: string, trocada: boolean) {
    await supabase.from('aparelho_pecas').update({ trocada }).eq('id', pecaId)
    setModalPecas(prev => prev.map(p => p.id === pecaId ? { ...p, trocada } : p))
  }

  async function adicionarPecaExtra() {
    if (!detalhes || !pecaExtraNome.trim()) return
    const { data } = await supabase.from('aparelho_pecas')
      .insert({ aparelho_id: detalhes.id, item_key: null, peca_nome: pecaExtraNome.trim(), preco: 0, trocada: true })
      .select('id,aparelho_id,item_key,peca_nome,preco,chegou,trocada,created_at').single()
    if (data) setModalPecas(prev => [...prev, data as AparelhoPC])
    setPecaExtraNome('')
  }

  async function confirmarReparo() {
    if (!detalhes) return
    await atualizarStatus(detalhes.id, 'checklist')
  }

  async function liberarParaVenda() {
    if (!detalhes) return
    const tudoOk = Object.values(checklistFinal).every(v => v === 'Bom' || v === 'N/A')
    if (!tudoOk && !liberarSemChecklist) return
    setSalvandoStatus(true)
    const nota = notaGeral(checklistFinal)
    await supabase.from('aparelhos').update({ checklist_json: checklistFinal, checklist_nota: nota }).eq('id', detalhes.id)
    await atualizarStatus(detalhes.id, 'disponivel')
    setSalvandoStatus(false)
  }

  // â”€â”€ Canvas padrÃ£o 3x3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function desenharPadrao(pontos: number[]) {
    const c = padCanvasRef.current; if (!c) return
    const ctx = c.getContext('2d')!; ctx.clearRect(0,0,c.width,c.height)
    const size = 120; const gap = size / 3; const r = 10; const offset = gap / 2
    ctx.fillStyle = '#e2e8f0'
    for (let i = 0; i < 9; i++) {
      const x = offset + (i % 3) * gap; const y = offset + Math.floor(i / 3) * gap
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2)
      ctx.fillStyle = pontos.includes(i+1) ? '#2563eb' : '#e2e8f0'; ctx.fill()
    }
    if (pontos.length > 1) {
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.beginPath()
      pontos.forEach((p,idx) => {
        const x = offset + ((p-1) % 3) * gap; const y = offset + Math.floor((p-1)/3) * gap
        idx === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y)
      }); ctx.stroke()
    }
  }
  function onPadCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = padCanvasRef.current; if (!c) return
    const r = c.getBoundingClientRect()
    const size = 120; const gap = size / 3; const offset = gap / 2
    const mx = e.clientX - r.left; const my = e.clientY - r.top
    for (let i = 0; i < 9; i++) {
      const x = offset + (i % 3) * gap; const y = offset + Math.floor(i / 3) * gap
      if (Math.hypot(mx-x, my-y) < 18) {
        const p = i + 1
        setCPadrao(prev => {
          if (prev.includes(p)) return prev
          const novo = [...prev, p]; desenharPadrao(novo); return novo
        }); return
      }
    }
  }
  function limparPadrao() { setCPadrao([]); const c = padCanvasRef.current; if (c) c.getContext('2d')!.clearRect(0,0,c.width,c.height); desenharPadrao([]) }

  async function salvarAprovacao(aparelho: Aparelho) {
    const aprovados = Object.values(aprovacao).filter(Boolean).length
    const total = CHECKLIST_APROVACAO.length
    if (aprovados < total) {
      if (!confirm(`Apenas ${aprovados}/${total} itens aprovados. Confirmar mesmo assim?`)) return
    }
    setSalvandoStatus(true)
    await supabase.from('aparelhos')
      .update({ checklist_json: { ...aparelho.checklist_json, aprovacao }, status: 'a_venda' })
      .eq('id', aparelho.id)
    setSalvandoStatus(false)
    fetchAll()
    setDetalhes(d => d ? { ...d, status: 'a_venda' } : null)
  }

  async function reimprimirTermoCompra(aparelhoId: string) {
    const ap = aparelhos.find(a => a.id === aparelhoId)
    if (!ap) return
    const { data: c } = await supabase.from('aparelho_compras')
      .select('*').eq('aparelho_id', aparelhoId).order('created_at', { ascending: false }).limit(1).single()
    if (!c) { alert('Dados da compra nÃ£o encontrados.'); return }
    gerarTermoCompraHTML({
      numero: c.numero, hoje: new Date(c.created_at ?? ap.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }),
      ap, vNomeP: c.vendedor_nome, vCPFP: c.vendedor_cpf, vRGP: c.vendedor_rg ?? '',
      vTelP: c.vendedor_tel ?? '', vEndP: c.vendedor_end ?? '', vCEPP: c.vendedor_cep ?? '',
      valorP: c.valor_pago, formaP: c.forma_pagamento,
      assVend: c.assinatura_vendedor ?? '', assLoja: c.assinatura_loja ?? '', foto: c.foto_vendedor ?? '',
      senhaT: ap.senha_tipo ?? '', senhaV: ap.senha_valor ?? '',
    })
  }

  async function reimprimirTermoVenda(aparelhoId: string) {
    const ap = aparelhos.find(a => a.id === aparelhoId)
    if (!ap) return
    const { data: v } = await supabase.from('aparelho_vendas')
      .select('*').eq('aparelho_id', aparelhoId).order('created_at', { ascending: false }).limit(1).single()
    if (!v) { alert('Dados da venda nÃ£o encontrados.'); return }
    gerarTermoVendaHTML({
      numero: v.numero, hoje: new Date(v.created_at ?? ap.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }),
      ap, bNomeP: v.comprador_nome, bCPFP: v.comprador_cpf,
      bTelP: v.comprador_tel ?? '', bEndP: v.comprador_end ?? '',
      valorP: v.valor_venda, formaP: v.forma_pagamento, garantiaP: v.garantia_dias,
      assCompr: v.assinatura_comprador ?? '', assLoja: v.assinatura_loja ?? '',
    })
  }

  function abrirHTML(html: string) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank'); if (w) w.onload = () => URL.revokeObjectURL(url)
  }

  function gerarTermoCompraHTML(p: {
    numero: number; hoje: string; ap: Aparelho
    vNomeP: string; vCPFP: string; vRGP: string; vTelP: string; vEndP: string; vCEPP: string
    valorP: number; formaP: string
    assVend: string; assLoja: string; foto: string
    senhaT: string; senhaV: string
  }) {
    const specs = p.ap.specs_json as Dispositivo | null
    const senhaTexto = p.senhaT === 'pin' ? `PIN: ${p.senhaV}` : p.senhaT === 'padrao' ? `PadrÃ£o: ${p.senhaV}` : ''
    const assVendHtml = p.assVend ? `<img src="${p.assVend}" class="sig-img" />` : ''
    const assLojaHtml = p.assLoja ? `<img src="${p.assLoja}" class="sig-img" />` : ''
    const fotoHtml = p.foto ? `<img src="${p.foto}" class="foto-vend" alt="Foto vendedor" />` : ''
    const cl = p.ap.checklist_json ?? {}
    const nota = p.ap.checklist_nota ?? notaGeral(cl)
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Termo de Compra #${p.numero}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@page { size: A4 portrait; margin: 9mm 12mm; }
* { margin:0;padding:0;box-sizing:border-box; }
body { font-family:'Inter',Arial,sans-serif;font-size:8pt;color:#1e293b;line-height:1.35; }
.header { display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:7pt;border-bottom:2pt solid #0f172a;margin-bottom:8pt; }
.brand h1 { font-size:15pt;font-weight:700;color:#0f172a; }
.brand p { font-size:7pt;color:#64748b; }
.doc-title { font-size:12pt;font-weight:700;text-align:right; }
.doc-num { font-size:8pt;color:#2563eb;font-weight:600;text-align:right; }
.doc-date { font-size:7pt;color:#94a3b8;text-align:right; }
section { margin-bottom:7pt; }
.stitle { font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2563eb;border-bottom:1pt solid #dbeafe;padding-bottom:2pt;margin-bottom:5pt; }
.grid2 { display:grid;grid-template-columns:1fr 1fr;gap:4pt 14pt; }
.grid3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:4pt 10pt; }
.field-label { font-size:6.5pt;color:#94a3b8;font-weight:500; }
.field-value { font-size:8pt;font-weight:600;border-bottom:0.5pt solid #e2e8f0;padding-bottom:1pt;min-height:11pt; }
.specs-box { background:#f8fafc;padding:4pt 7pt;border-radius:3pt; }
.checklist-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:2pt; }
.ci { display:flex;justify-content:space-between;padding:2pt 4pt;border-radius:3pt;font-size:7pt; }
.ci-bom { background:#ecfdf5;color:#065f46; }
.ci-regular { background:#fef3c7;color:#92400e; }
.ci-ruim { background:#fef2f2;color:#991b1b; }
.ci-na { background:#f8fafc;color:#94a3b8; }
.senha-box { background:#fef3c7;border:1pt solid #fde68a;padding:4pt 8pt;border-radius:3pt;font-size:8pt; }
.legal { background:#f8fafc;border-left:3pt solid #0f172a;padding:6pt 10pt;font-size:7pt;line-height:1.5; }
.legal p { margin-bottom:3pt; }
.legal .art { font-size:6.5pt;color:#2563eb;font-weight:500; }
.sig-row { display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-top:8pt; }
.sig-img { max-height:38pt;max-width:130pt;display:block;margin-bottom:2pt; }
.sig-line { border-top:1pt solid #0f172a;margin-bottom:2pt;margin-top:14pt; }
.sig-name { font-size:8pt;font-weight:600; }
.sig-role { font-size:6.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:1px; }
.footer-doc { border-top:0.5pt solid #e2e8f0;padding-top:5pt;font-size:6pt;color:#94a3b8;text-align:center;margin-top:7pt; }
.foto-vend { width:50pt;height:50pt;object-fit:cover;border-radius:4pt;border:1pt solid #e2e8f0;float:right;margin:0 0 5pt 10pt; }
.nota-badge { display:inline-block;padding:1pt 6pt;border-radius:20pt;font-size:7pt;font-weight:700;${nota==='Bom'?'background:#ecfdf5;color:#065f46':nota==='Regular'?'background:#fef3c7;color:#92400e':'background:#fef2f2;color:#991b1b'}; }
.valor-d { font-size:12pt;font-weight:700;color:#065f46; }
</style></head><body>

<div class="header">
  <div class="brand"><h1>ðŸ“± SOS Celulares</h1><p>AssistÃªncia TÃ©cnica</p></div>
  <div><div class="doc-title">TERMO DE COMPRA</div><div class="doc-num">NÂº ${p.numero}</div><div class="doc-date">${p.hoje}</div></div>
</div>

<section>
  <div class="stitle">Vendedor â€” Dados pessoais</div>
  ${fotoHtml}
  <div class="grid2">
    <div><div class="field-label">Nome completo</div><div class="field-value">${p.vNomeP}</div></div>
    <div><div class="field-label">CPF</div><div class="field-value">${formatarCPF(p.vCPFP)}</div></div>
    <div><div class="field-label">RG</div><div class="field-value">${p.vRGP||'â€”'}</div></div>
    <div><div class="field-label">Telefone</div><div class="field-value">${p.vTelP?formatPhone(p.vTelP):'â€”'}</div></div>
    <div><div class="field-label">CEP</div><div class="field-value">${p.vCEPP||'â€”'}</div></div>
  </div>
  <div style="margin-top:3pt"><div class="field-label">EndereÃ§o</div><div class="field-value">${p.vEndP||'â€”'}</div></div>
</section>

<section>
  <div class="stitle">Aparelho â€” IdentificaÃ§Ã£o</div>
  <div class="grid3">
    <div><div class="field-label">Marca / Modelo</div><div class="field-value">${p.ap.marca} ${p.ap.modelo}</div></div>
    <div><div class="field-label">Capacidade</div><div class="field-value">${p.ap.capacidade||'â€”'}</div></div>
    <div><div class="field-label">Cor</div><div class="field-value">${p.ap.cor||'â€”'}</div></div>
    <div><div class="field-label">IMEI 1</div><div class="field-value">${p.ap.imei||'â€”'}</div></div>
    <div><div class="field-label">IMEI 2</div><div class="field-value">${p.ap.imei2||'â€”'}</div></div>
    <div><div class="field-label">Estado geral</div><div class="field-value"><span class="nota-badge">${nota}</span></div></div>
  </div>
  ${p.ap.imei?`<div style="margin-top:3pt;font-size:7pt">ðŸ” <a href="https://www.aparelhoslegais.com.br/consulta?imei=${p.ap.imei}" style="color:#2563eb">Consultar Aparelhos Legais</a></div>`:''}
</section>

${specs?`<section>
  <div class="stitle">EspecificaÃ§Ãµes tÃ©cnicas</div>
  <div class="specs-box"><div class="grid3">
    ${[['Tela',specs.tela],['Processador',specs.processador],['RAM',specs.ram],['Armazenamento',specs.armazenamento],['CÃ¢m. traseira',specs.camera_principal],['CÃ¢m. frontal',specs.camera_frontal],['Bateria',specs.bateria],['Sistema',specs.sistema]].filter(([,v])=>v).map(([k,v])=>`<div><div class="field-label">${k}</div><div style="font-size:8.5pt;font-weight:600">${v}</div></div>`).join('')}
  </div></div>
</section>`:''}

${Object.keys(cl).length>0?`<section>
  <div class="stitle">Checklist de estado</div>
  <div class="checklist-grid">
    ${CHECKLIST_ITENS.filter(i=>cl[i.key]).map(i=>{const v=cl[i.key];const cls=v==='Bom'?'ci-bom':v==='Regular'?'ci-regular':v==='Ruim'?'ci-ruim':'ci-na';return`<div class="ci ${cls}"><span>${i.label}</span><b>${v}</b></div>`}).join('')}
  </div>
</section>`:''}

${senhaTexto?`<section>
  <div class="stitle">Senha do aparelho</div>
  <div class="senha-box">âš  ${senhaTexto} â€” InformaÃ§Ã£o confidencial, de uso exclusivo da SOS Celulares.</div>
</section>`:''}

<section>
  <div class="stitle">CondiÃ§Ãµes da compra</div>
  <div class="grid3">
    <div><div class="field-label">Valor pago</div><div class="valor-d">R$ ${p.valorP.toFixed(2).replace('.',',')}</div></div>
    <div><div class="field-label">Forma de pagamento</div><div class="field-value">${p.formaP}</div></div>
    <div><div class="field-label">Data</div><div class="field-value">${p.hoje}</div></div>
  </div>
</section>

<div class="legal">
  <p><strong>DECLARAÃ‡ÃƒO DE PROPRIEDADE E RESPONSABILIDADE DO VENDEDOR</strong></p>
  <p>Eu, <strong>${p.vNomeP}</strong>, portador(a) do CPF <strong>${formatarCPF(p.vCPFP)}</strong>${p.vRGP?`, RG <strong>${p.vRGP}</strong>`:''}${p.vEndP?`, residente em <strong>${p.vEndP}</strong>`:''},
  na qualidade de vendedor(a), declaro, sob as penas da lei, que:</p>
  <p><strong>I.</strong> Sou o(a) legÃ­timo(a) proprietÃ¡rio(a) do aparelho <strong>${p.ap.marca} ${p.ap.modelo}</strong>, IMEI <strong>${p.ap.imei||'â€”'}</strong>, possuindo plena capacidade legal e legitimidade para alienar o bem, estando o mesmo livre de Ã´nus, penhoras, alienaÃ§Ã£o fiduciÃ¡ria, financiamento ou qualquer restriÃ§Ã£o de domÃ­nio.</p>
  <p><strong>II.</strong> O aparelho <strong>nÃ£o possui origem ilÃ­cita</strong> e nÃ£o foi obtido mediante furto (<span class="art">art. 155 do CÃ³digo Penal</span>), roubo (<span class="art">art. 157 CP</span>), extorsÃ£o (<span class="art">art. 158 CP</span>), estelionato (<span class="art">art. 171 CP</span>), apropriaÃ§Ã£o indÃ©bita (<span class="art">art. 168 CP</span>) ou qualquer outro ilÃ­cito penal ou civil.</p>
  <p><strong>III.</strong> O nÃºmero de IMEI Ã© original e nÃ£o foi adulterado, clonado ou suprimido. A adulteraÃ§Ã£o de IMEI constitui crime previsto no <span class="art">art. 183 da Lei nÂº 9.472/1997 (Lei Geral de TelecomunicaÃ§Ãµes)</span>, com pena de detenÃ§Ã£o de 2 a 4 anos, alÃ©m de multa.</p>
  <p><strong>IV.</strong> Declaro ciÃªncia de que a posse, aquisiÃ§Ã£o, recebimento ou ocultaÃ§Ã£o de produto de crime configura <strong>receptaÃ§Ã£o</strong>, tipificada no <span class="art">art. 180 do CÃ³digo Penal</span> (pena: reclusÃ£o de 1 a 4 anos, e multa), podendo ser qualificada (<span class="art">art. 180 Â§1Âº CP</span>) quando praticada no exercÃ­cio de atividade comercial, com pena de reclusÃ£o de 3 a 8 anos.</p>
  <p><strong>V.</strong> Assumo <strong>integral e exclusiva responsabilidade civil e criminal</strong> pela veracidade das informaÃ§Ãµes aqui prestadas, obrigando-me a ressarcir a SOS Celulares de toda e qualquer perda, dano, custo ou despesa â€” inclusive honorÃ¡rios advocatÃ­cios e custas processuais â€” que esta venha a suportar em decorrÃªncia de falsidade, omissÃ£o ou inexatidÃ£o desta declaraÃ§Ã£o, sem prejuÃ­zo da minha responsabilizaÃ§Ã£o por falsidade ideolÃ³gica (<span class="art">art. 299 CP</span>) e do dever de indenizar previsto nos <span class="art">arts. 186, 187 e 927 do CÃ³digo Civil</span>.</p>
  <p><strong>VI.</strong> Respondo pela <strong>evicÃ§Ã£o</strong> do bem, nos termos dos <span class="art">arts. 447 a 457 do CÃ³digo Civil</span>, obrigando-me a restituir o valor recebido e a indenizar a SOS Celulares por perdas e danos (<span class="art">arts. 402 a 404 do CÃ³digo Civil</span>) caso o aparelho venha a ser reivindicado, apreendido ou subtraÃ­do da posse da empresa ou de terceiro a quem ela o transfira, em razÃ£o de vÃ­cio na origem ou na titularidade do bem.</p>
  <p><strong>VII.</strong> Declaro ciÃªncia de que a SOS Celulares <strong>contrata de boa-fÃ©</strong> (<span class="art">art. 422 do CÃ³digo Civil</span>), confiando nas declaraÃ§Ãµes acima e realizando as verificaÃ§Ãµes ordinariamente cabÃ­veis Ã  sua atividade â€” entre elas a conferÃªncia do nÃºmero de IMEI e a minha identificaÃ§Ã£o â€”, sem conhecimento de qualquer vÃ­cio quanto Ã  origem ou Ã  propriedade do aparelho.</p>
</div>

<div class="sig-row">
  <div>
    ${assVendHtml}
    <div class="sig-line"></div>
    <div class="sig-name">${p.vNomeP}</div>
    <div style="font-size:7.5pt;color:#64748b">CPF: ${formatarCPF(p.vCPFP)}</div>
    <div class="sig-role">Vendedor</div>
  </div>
  <div>
    ${assLojaHtml}
    <div class="sig-line"></div>
    <div class="sig-name">SOS Celulares</div>
    <div class="sig-role">Representante da Loja</div>
  </div>
</div>

<div class="footer-doc">Documento emitido em ${p.hoje} Â· SOS Celulares Â· Em conformidade com o CÃ³digo Penal (Decreto-Lei 2.848/40), Lei 9.472/97 e CDC (Lei 8.078/90)</div>
<script>window.onload=()=>window.print()<\/script>
</body></html>`
    abrirHTML(html)
  }

  function gerarTermoVendaHTML(p: {
    numero: number; hoje: string; ap: Aparelho
    bNomeP: string; bCPFP: string; bTelP: string; bEndP: string
    valorP: number; formaP: string; garantiaP: number
    assCompr: string; assLoja: string
  }) {
    const assComprHtml = p.assCompr ? `<img src="${p.assCompr}" class="sig-img" />` : ''
    const assLojaHtml = p.assLoja ? `<img src="${p.assLoja}" class="sig-img" />` : ''
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Termo de Venda #${p.numero}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@page { size: A4 portrait; margin: 18mm 20mm; }
* { margin:0;padding:0;box-sizing:border-box; }
body { font-family:'Inter',Arial,sans-serif;font-size:9pt;color:#1e293b;line-height:1.6; }
.header { display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12pt;border-bottom:2pt solid #0f172a;margin-bottom:14pt; }
.brand h1 { font-size:18pt;font-weight:700;color:#0f172a; }
.doc-title { font-size:14pt;font-weight:700;text-align:right;color:#065f46; }
.doc-num { font-size:9pt;color:#065f46;font-weight:600;text-align:right; }
.doc-date { font-size:8pt;color:#94a3b8;text-align:right; }
section { margin-bottom:12pt; }
.stitle { font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#065f46;border-bottom:1pt solid #bbf7d0;padding-bottom:3pt;margin-bottom:8pt; }
.grid2 { display:grid;grid-template-columns:1fr 1fr;gap:5pt 16pt; }
.grid3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:5pt 12pt; }
.field-label { font-size:7.5pt;color:#94a3b8;font-weight:500; }
.field-value { font-size:9pt;font-weight:600;border-bottom:0.5pt solid #e2e8f0;padding-bottom:1pt;min-height:13pt; }
.legal { background:#f8fafc;border-left:3pt solid #065f46;padding:9pt 12pt;font-size:8pt;line-height:1.8; }
.legal p { margin-bottom:5pt; }
.sig-row { display:grid;grid-template-columns:1fr 1fr;gap:14pt;margin-top:12pt; }
.sig-img { max-height:45pt;max-width:150pt;display:block;margin-bottom:3pt; }
.sig-line { border-top:1pt solid #0f172a;margin-bottom:3pt;margin-top:20pt; }
.sig-name { font-size:8.5pt;font-weight:600; }
.sig-role { font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:1px; }
.footer-doc { border-top:0.5pt solid #e2e8f0;padding-top:7pt;font-size:6.5pt;color:#94a3b8;text-align:center;margin-top:12pt; }
.valor-d { font-size:14pt;font-weight:700;color:#065f46; }
.garantia-box { background:#ecfdf5;border:1pt solid #86efac;padding:6pt 10pt;border-radius:4pt;font-size:9pt;font-weight:600;color:#065f46; }
</style></head><body>

<div class="header">
  <div class="brand"><h1>ðŸ“± SOS Celulares</h1><p>AssistÃªncia TÃ©cnica</p></div>
  <div><div class="doc-title">TERMO DE VENDA</div><div class="doc-num">NÂº ${p.numero}</div><div class="doc-date">${p.hoje}</div></div>
</div>

<section>
  <div class="stitle">Comprador</div>
  <div class="grid2">
    <div><div class="field-label">Nome completo</div><div class="field-value">${p.bNomeP}</div></div>
    <div><div class="field-label">CPF</div><div class="field-value">${formatarCPF(p.bCPFP)}</div></div>
    <div><div class="field-label">Telefone</div><div class="field-value">${p.bTelP||'â€”'}</div></div>
    <div><div class="field-label">EndereÃ§o</div><div class="field-value">${p.bEndP||'â€”'}</div></div>
  </div>
</section>

<section>
  <div class="stitle">Produto vendido</div>
  <div class="grid3">
    <div><div class="field-label">Modelo</div><div class="field-value">${p.ap.marca} ${p.ap.modelo}</div></div>
    <div><div class="field-label">Capacidade</div><div class="field-value">${p.ap.capacidade||'â€”'}</div></div>
    <div><div class="field-label">Cor</div><div class="field-value">${p.ap.cor||'â€”'}</div></div>
    <div><div class="field-label">IMEI</div><div class="field-value">${p.ap.imei||'â€”'}</div></div>
  </div>
</section>

<section>
  <div class="stitle">CondiÃ§Ãµes da venda</div>
  <div class="grid3">
    <div><div class="field-label">Valor</div><div class="valor-d">R$ ${p.valorP.toFixed(2).replace('.',',')}</div></div>
    <div><div class="field-label">Forma de pagamento</div><div class="field-value">${p.formaP}</div></div>
    <div><div class="field-label">Data</div><div class="field-value">${p.hoje}</div></div>
  </div>
  <div style="margin-top:8pt"><div class="garantia-box">âœ“ Garantia: ${p.garantiaP} dias a partir desta data</div></div>
</section>

<div class="legal">
  <p><strong>TERMOS E CONDIÃ‡Ã•ES DE GARANTIA</strong></p>
  <p><strong>I.</strong> A SOS Celulares garante o produto acima descrito contra defeitos de fabricaÃ§Ã£o pelo prazo de <strong>${p.garantiaP} dias</strong> a contar da data desta venda, conforme disposto no <strong>art. 26, II, do CÃ³digo de Defesa do Consumidor (Lei 8.078/90)</strong>.</p>
  <p><strong>II.</strong> A garantia <strong>nÃ£o cobre</strong>: danos fÃ­sicos por quedas, impactos ou lÃ­quidos; danos causados por uso inadequado; desgaste natural da bateria; e danos causados por software ou vÃ­rus.</p>
  <p><strong>III.</strong> O comprador declara ter inspecionado e aprovado o estado do produto no ato da compra, estando ciente de tratar-se de <strong>aparelho usado</strong> e das condiÃ§Ãµes descritas no checklist anexo.</p>
  <p><strong>IV.</strong> Declaro ter recebido o aparelho em perfeitas condiÃ§Ãµes de funcionamento, nas especificaÃ§Ãµes acima descritas, concordando integralmente com os termos desta nota de venda.</p>
</div>

<div class="sig-row">
  <div>
    ${assComprHtml}
    <div class="sig-line"></div>
    <div class="sig-name">${p.bNomeP}</div>
    <div style="font-size:7.5pt;color:#64748b">CPF: ${formatarCPF(p.bCPFP)}</div>
    <div class="sig-role">Comprador</div>
  </div>
  <div>
    ${assLojaHtml}
    <div class="sig-line"></div>
    <div class="sig-name">SOS Celulares</div>
    <div class="sig-role">Representante da Loja</div>
  </div>
</div>

<div class="footer-doc">Documento emitido em ${p.hoje} Â· SOS Celulares Â· Conforme CDC (Lei 8.078/90)</div>
<script>window.onload=()=>window.print()<\/script>
</body></html>`
    abrirHTML(html)
  }

  function imprimirCard(a: Aparelho) {
    const nota = a.checklist_nota ?? notaGeral(a.checklist_json ?? {})
    const condLabel = nota === 'Bom' ? 'Usado â€” Excelente' : nota === 'Regular' ? 'Usado â€” Bom' : 'Usado â€” Regular'
    const imeiOculto = a.imei ? a.imei.slice(0, 8) + '****' + a.imei.slice(-2) : 'â€”'
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Card ${a.marca} ${a.modelo}</title>
<style>
  @page { size: 148mm 105mm; margin: 0; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; width:148mm; height:105mm; background:#fff; color:#0f172a; overflow:hidden; display:flex; flex-direction:column; padding:8mm 10mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; border:2px solid #0f172a; }
  .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:3mm; padding-bottom:3mm; border-bottom:1.5px solid #0f172a; }
  .loja-nome { font-size:9pt; font-weight:700; color:#0f172a; letter-spacing:0.04em; text-transform:uppercase; }
  .cond-badge { font-size:7pt; font-weight:700; padding:2px 10px; border-radius:4px; background:#0f172a; color:#fff; }
  .modelo { font-size:20pt; font-weight:900; letter-spacing:-0.02em; line-height:1.1; margin-bottom:1mm; color:#0f172a; }
  .specs { font-size:9pt; color:#475569; margin-bottom:4mm; }
  .preco-row { display:flex; align-items:flex-end; gap:5mm; margin-bottom:3mm; }
  .preco { font-size:28pt; font-weight:900; color:#0f172a; letter-spacing:-0.03em; line-height:1; }
  .preco small { font-size:11pt; font-weight:700; color:#0f172a; vertical-align:top; margin-right:1px; }
  .garantia { font-size:8pt; color:#065f46; font-weight:700; background:#dcfce7; padding:3px 10px; border-radius:4px; border:1px solid #86efac; }
  .bottom { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:3mm; border-top:1px solid #e2e8f0; }
  .imei-line { font-size:7pt; color:#64748b; font-family:monospace; }
  .loja-info { font-size:7pt; color:#64748b; }
</style></head><body>
<div class="top">
  <div class="loja-nome">SOS Celulares</div>
  <span class="cond-badge">${condLabel}</span>
</div>
<div class="modelo">${a.marca} ${a.modelo}</div>
<div class="specs">${[a.capacidade, a.cor].filter(Boolean).join(' Â· ') || 'â€”'}</div>
<div class="preco-row">
  <div class="preco"><small>R$</small> ${a.preco_venda ? a.preco_venda.toFixed(2).replace('.', ',') : 'Consulte'}</div>
  <span class="garantia">âœ“ 90 dias de garantia</span>
</div>
<div class="bottom">
  <div class="imei-line">IMEI: ${imeiOculto}</div>
  <div class="loja-info">SOS Celulares</div>
</div>
<script>
  window.onload = () => window.print();
  window.onafterprint = () => window.close();
<\/script>
</body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank'); if (w) w.onload = () => URL.revokeObjectURL(url)
  }

  // â”€â”€ Carregamento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('aparelhos').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setAparelhos((data ?? []) as unknown as Aparelho[])
    // Buscar assinatura da loja (do usuÃ¡rio logado)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: ass } = await supabase.from('usuario_assinaturas').select('assinatura').eq('usuario_id', user.id).maybeSingle()
      if (ass) setAssinaturaLoja(ass.assinatura)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!detalhes) { setModalPecas([]); setNovasPecas([]); setSemTodasPecas(false); setLiberarSemChecklist(false); return }
    const s = detalhes.status
    if (s === 'sem_revisao') {
      setNovasPecas(CHECKLIST_ITENS.map(i => ({
        key: i.key, nome: PART_MAP[i.key]?.peca ?? i.label, preco: '0', marcado: false,
      })))
    }
    if (s === 'aguardando_pecas' || s === 'em_reparo' || s === 'checklist') {
      carregarPecas(detalhes.id)
    }
    if (s === 'checklist') {
      setChecklistFinal(detalhes.checklist_json ?? {})
    }
    setLiberarSemChecklist(false); setSemTodasPecas(false); setPecaExtraNome('')
  }, [detalhes?.id, detalhes?.status])

  // â”€â”€ Busca de modelo no banco â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Busca CEP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ CÃ¢mera â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function abrirCamera() {
    setShowCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      setStreamAtivo(stream)
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
    } catch { setShowCamera(false); alert('CÃ¢mera nÃ£o disponÃ­vel. Use upload de arquivo.') }
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

  // â”€â”€ Canvas de assinatura â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  function limparCanvas(ref: React.RefObject<HTMLCanvasElement | null>, setter: (v: string) => void) {
    const c = ref.current; if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height); setter('')
  }

  function setChecklistItem(key: string, val: string) { setCChecklist(prev => ({ ...prev, [key]: val })) }

  // â”€â”€ Salvar compra â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function salvarCompra() {
    setSubmitAttempted(true)

    // ValidaÃ§Ã£o com scroll para o primeiro campo invÃ¡lido
    if (!modeloSelecionado) {
      modeloRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      modeloRef.current?.focus()
      return
    }
    if (!vNome.trim()) {
      vNomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      vNomeRef.current?.focus()
      return
    }
    if (!vCPF.trim() || vCpfErro) {
      vCPFRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      vCPFRef.current?.focus()
      return
    }
    if (!cValor || parseFloat(cValor) <= 0) {
      cValorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      cValorRef.current?.focus()
      return
    }

    setSalvando(true)
    const endCompleto = [vEnd, vBairro, vCidade, vEstado].filter(Boolean).join(', ')

    console.log('[salvarCompra] Inserindo aparelho...', { marca: modeloSelecionado.marca, modelo: modeloSelecionado.modelo, status: 'sem_revisao' })

    const { data: ap, error: apErr } = await supabase.from('aparelhos').insert({
      tipo: cTipo, status: 'sem_revisao',
      marca: modeloSelecionado.marca, modelo: modeloSelecionado.modelo,
      capacidade: cCapacidade || null, cor: cCor || null,
      imei: cIMEI || null, imei2: cIMEI2 || null,
      aparelho_legal_url: cIMEI ? `https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}` : null,
      specs_json: modeloSelecionado,
      preco_compra: parseFloat(cValor), data_compra: new Date().toISOString().split('T')[0],
      checklist_json: cChecklist, checklist_nota: notaGeral(cChecklist),
      observacoes: cObs || null,
      senha_tipo: cTipoSenha !== 'nenhuma' ? cTipoSenha : null,
      senha_valor: cTipoSenha === 'pin' ? cSenha : cTipoSenha === 'padrao' && cPadrao.length > 0 ? cPadrao.join(' â†’ ') : null,
    }).select('id').single()

    if (apErr || !ap) {
      console.error('[salvarCompra] Erro ao inserir aparelho:', apErr)
      alert(`Erro ao salvar aparelho: ${apErr?.message ?? 'resposta vazia do banco'}`)
      setSalvando(false); return
    }

    console.log('[salvarCompra] Aparelho inserido, id:', ap.id, 'â€” inserindo compra...')

    const { data: compra, error: compraErr } = await supabase.from('aparelho_compras').insert({
      aparelho_id: ap.id,
      vendedor_nome: vNome, vendedor_cpf: vCPF, vendedor_rg: vRG || null,
      vendedor_tel: vTel || null, vendedor_email: vEmail || null,
      vendedor_end: endCompleto || vEnd, vendedor_cep: vCEP || null,
      valor_pago: parseFloat(cValor), forma_pagamento: cForma,
      assinatura_vendedor: assinaturaVendedor || null,
      assinatura_loja: assinaturaLoja || null,
      foto_vendedor: fotoVendedor || null,
    }).select('id,numero').single()

    if (compraErr || !compra) {
      console.error('[salvarCompra] Erro ao inserir aparelho_compras:', compraErr)
      alert(`Aparelho salvo (id: ${ap.id}), mas erro ao registrar compra: ${compraErr?.message ?? 'resposta vazia'}`)
      setSalvando(false); fetchAll(); return
    }

    console.log('[salvarCompra] Compra inserida, numero:', compra.numero)

    const { error: linkErr } = await supabase.from('aparelhos').update({ compra_id: compra.id }).eq('id', ap.id)
    if (linkErr) console.warn('[salvarCompra] Aviso: erro ao vincular compra_id:', linkErr)

    setCompraSalva({ id: compra.id, numero: compra.numero })
    setModalSucesso({ tipo: 'compra', numero: compra.numero, aparelho: { marca: modeloSelecionado.marca, modelo: modeloSelecionado.modelo, capacidade: cCapacidade || null } })
    setSalvando(false); fetchAll()
  }

  // â”€â”€ Salvar venda â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setModalSucesso({ tipo: 'venda', numero: venda.numero, aparelho: { marca: aparelhoVenda.marca, modelo: aparelhoVenda.modelo, capacidade: aparelhoVenda.capacidade } })
    }
    setSalvando(false); fetchAll()
  }

  // â”€â”€ Resumo impressÃ£o apÃ³s compra (T03) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function imprimirResumoCompra() {
    if (!modeloSelecionado || !compraSalva) return
    const hoje = new Date().toLocaleDateString('pt-BR')
    const senhaTexto = cTipoSenha === 'pin' ? `PIN: ${cSenha}` : cTipoSenha === 'padrao' ? `PadrÃ£o: ${cPadrao.join(' â†’ ')}` : 'Sem senha'
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumo Compra #${compraSalva.numero}</title>
<style>@page{size:A5;margin:14mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10pt;color:#0f172a}
.tit{font-size:16pt;font-weight:700;margin-bottom:2mm}.sub{font-size:8pt;color:#64748b;margin-bottom:6mm}
.row{display:flex;justify-content:space-between;padding:3mm 0;border-bottom:0.5pt solid #e2e8f0;font-size:9.5pt}
.label{color:#64748b}.val{font-weight:600}.total{font-size:14pt;font-weight:700;color:#065f46;padding-top:4mm}
.footer{margin-top:8mm;font-size:7.5pt;color:#94a3b8;text-align:center}</style></head><body>
<div class="tit">ðŸ“± SOS Celulares</div>
<div class="sub">Resumo de Compra Â· ${hoje} Â· #${compraSalva.numero}</div>
<div class="row"><span class="label">Aparelho</span><span class="val">${modeloSelecionado.marca} ${modeloSelecionado.modelo}</span></div>
${cCapacidade ? `<div class="row"><span class="label">Capacidade</span><span class="val">${cCapacidade}</span></div>` : ''}
${cCor ? `<div class="row"><span class="label">Cor</span><span class="val">${cCor}</span></div>` : ''}
${cIMEI ? `<div class="row"><span class="label">IMEI</span><span class="val">${cIMEI}</span></div>` : ''}
<div class="row"><span class="label">Estado geral</span><span class="val">${notaGeral(cChecklist)}</span></div>
<div class="row"><span class="label">Vendedor</span><span class="val">${vNome}</span></div>
<div class="row"><span class="label">CPF</span><span class="val">${formatarCPF(vCPF)}</span></div>
<div class="row"><span class="label">Forma de pagamento</span><span class="val">${cForma}</span></div>
${cTipoSenha !== 'nenhuma' ? `<div class="row"><span class="label">Senha</span><span class="val">${senhaTexto}</span></div>` : ''}
<div class="row total"><span>Valor pago</span><span>R$ ${parseFloat(cValor||'0').toFixed(2).replace('.',',')}</span></div>
<div class="footer">SOS Celulares Â· Documento interno Â· ${hoje}</div>
<script>window.onload=()=>{window.print()};window.onafterprint=()=>window.close()<\/script>
</body></html>`
    const b = new Blob([html],{type:'text/html;charset=utf-8'});const u=URL.createObjectURL(b);const w=window.open(u,'_blank');if(w)w.onload=()=>URL.revokeObjectURL(u)
  }

  // â”€â”€â”€ Filtros estoque
  const aparelhosFiltrados = aparelhos.filter(a => {
    if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false
    if (search && !`${a.marca} ${a.modelo}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // â”€â”€â”€ Handlers de canvas compartilhados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const vendHandlers = makeCanvasHandlers(vendCanvasRef, setAssinaturaVendedor)
  const comprHandlers = makeCanvasHandlers(comprCanvasRef, setAssinaturaComprador)

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', width: '100%' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Compra & Venda de Aparelhos</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
            {aparelhos.filter(a => a.status === 'disponivel').length} disponÃ­veis Â· {aparelhos.filter(a => a.status === 'vendido').length} vendidos
          </p>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {([
          ['estoque',   'ðŸ“± Estoque',          aparelhos.filter(a=>a.status==='disponivel').length],
          ['sem_revisao','ðŸ” Em revisÃ£o',       aparelhos.filter(a=>a.status==='sem_revisao').length],
          ['aguardando_pecas','ðŸ“¦ Aguard. peÃ§as',aparelhos.filter(a=>a.status==='aguardando_pecas').length],
          ['em_reparo', 'ðŸ”§ Em reparo',         aparelhos.filter(a=>a.status==='em_reparo').length],
          ['checklist', 'âœ… Checklist',          aparelhos.filter(a=>a.status==='checklist').length],
          ['historico', 'ðŸ“œ HistÃ³rico',         null],
        ] as [string,string,number|null][]).map(([k,l,cnt]) => (
          <button key={k} onClick={() => setAba(k as any)} style={{ padding: '10px 14px', fontSize: 13, fontWeight: aba===k?600:400, border: 'none', background: 'none', cursor: 'pointer', color: aba===k?'#2563eb':'#64748b', borderBottom: aba===k?'2px solid #2563eb':'2px solid transparent', marginBottom: -1, display:'flex', alignItems:'center', gap: 5, whiteSpace:'nowrap' }}>
            {l}
            {cnt !== null && cnt > 0 && <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, background: aba===k?'#2563eb':'#e2e8f0', color: aba===k?'#fff':'#64748b' }}>{cnt}</span>}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, paddingBottom: 4 }}>
          <button onClick={() => setAba('comprar')} style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: aba==='comprar'?'#0f172a':'#1e293b', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6 }}>â¬‡ Registrar compra</button>
          <button onClick={() => setAba('vender')} style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: aba==='vender'?'#065f46':'#16a34a', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>â¬† Registrar venda</button>
        </div>
      </div>

      {/* â•â•â• helper: tabela de aparelhos â•â•â• */}
      {(['estoque','sem_revisao','aguardando_pecas','em_reparo','checklist'] as const).includes(aba as any) && (() => {
        const statusMap: Record<string,string> = { estoque:'disponivel', sem_revisao:'sem_revisao', aguardando_pecas:'aguardando_pecas', em_reparo:'em_reparo', checklist:'checklist' }
        const filtro = statusMap[aba] ?? 'disponivel'
        const lista = aparelhos.filter(a => a.status === filtro && (!search || `${a.marca} ${a.modelo}`.toLowerCase().includes(search.toLowerCase())))
        return (
          <div>
            <div style={{ display:'flex',gap:10,marginBottom:16 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo ou IMEI..." style={{ ...inp,flex:1,maxWidth:340 }} />
            </div>
            {loading ? <div style={{ textAlign:'center',padding:60,color:'#94a3b8' }}>Carregando...</div> :
            lista.length === 0 ? (
              <div style={{ textAlign:'center',padding:60 }}>
                <div style={{ fontSize:40,marginBottom:12 }}>ðŸ“±</div>
                <p style={{ fontSize:14,color:'#94a3b8' }}>Nenhum aparelho aqui</p>
              </div>
            ) : (
              <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
                <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                  <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
                    {['Aparelho','IMEI','Estado','Custo','PreÃ§o venda','Lucro',''].map(h => <th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {lista.map(a => {
                      const lucro = a.preco_venda && a.preco_compra ? a.preco_venda - a.preco_compra : null
                      return (
                        <tr key={a.id} onClick={() => { setDetalhes(a); setDetalheEditando(false); setDetalhePrecoVenda(String(a.preco_venda??'')); setDetalheObs(a.observacoes??''); setAprovacao((a.checklist_json?.aprovacao??{}) as unknown as Record<string,boolean>) }} style={{ borderBottom:'1px solid #f1f5f9',cursor:'pointer' }}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f8fafc'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=''}>
                          <td style={{ padding:'10px 14px' }}>
                            <p style={{ fontWeight:500,color:'#0f172a' }}>{a.marca} {a.modelo}</p>
                            {a.capacidade && <p style={{ fontSize:11,color:'#94a3b8' }}>{a.capacidade}{a.cor?` Â· ${a.cor}`:''}</p>}
                          </td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:'#64748b' }}>
                            {a.imei ? <a href={`https://www.aparelhoslegais.com.br/consulta?imei=${a.imei}`} target="_blank" rel="noopener noreferrer" style={{ color:'#2563eb',textDecoration:'none' }} onClick={e=>e.stopPropagation()}>{a.imei} ðŸ”</a> : 'â€”'}
                          </td>
                          <td style={{ padding:'10px 14px' }}>
                            {a.checklist_nota ? <span style={{ fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:20,background:a.checklist_nota==='Bom'?'#ecfdf5':a.checklist_nota==='Regular'?'#fef3c7':'#fef2f2',color:a.checklist_nota==='Bom'?'#065f46':a.checklist_nota==='Regular'?'#92400e':'#991b1b' }}>{a.checklist_nota}</span> : 'â€”'}
                          </td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:'#374151' }}>{a.preco_compra?fm(a.preco_compra):'â€”'}</td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:'#374151' }}>{a.preco_venda?fm(a.preco_venda):'â€”'}</td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,fontWeight:lucro&&lucro>0?600:400,color:lucro&&lucro>0?'#065f46':lucro&&lucro<0?'#991b1b':'#94a3b8' }}>{lucro!==null?fm(lucro):'â€”'}</td>
                          <td style={{ padding:'10px 14px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display:'flex',gap:6 }}>
                              {a.status==='disponivel' && <button onClick={() => imprimirCard(a)} style={{ fontSize:12,padding:'5px 10px',border:'1px solid #dbeafe',borderRadius:7,background:'#dbeafe',cursor:'pointer',color:'#2563eb' }}>ðŸ·</button>}
                              {a.status==='disponivel' && <button onClick={() => { setAparelhoVenda(a); setAba('vender') }} style={{ fontSize:12,padding:'5px 10px',border:'1px solid #bbf7d0',borderRadius:7,background:'#ecfdf5',cursor:'pointer',color:'#065f46',fontWeight:500 }}>Vender â†’</button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* â•â•â• HISTÃ“RICO â•â•â• */}
      {aba === 'historico' && (
        <div>
          <div style={{ display:'flex',gap:10,marginBottom:16 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo..." style={{ ...inp,flex:1,maxWidth:340 }} />
          </div>
          {aparelhos.filter(a => !search || `${a.marca} ${a.modelo}`.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
            <div style={{ textAlign:'center',padding:60,color:'#94a3b8' }}>
              <div style={{ fontSize:40,marginBottom:12 }}>ðŸ“œ</div>
              <p>Nenhum registro.</p>
            </div>
          ) : (
            <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                <thead><tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
                  {['Aparelho','IMEI','Custo','Venda','Lucro','Status','Data','Documentos'].map(h=><th key={h} style={{ padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {aparelhos
                    .filter(a => !search || `${a.marca} ${a.modelo}`.toLowerCase().includes(search.toLowerCase()))
                    .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map(a => {
                      const lucro = a.preco_venda && a.preco_compra ? a.preco_venda - a.preco_compra : null
                      const st = STATUS_CFG[a.status]
                      return (
                        <tr key={a.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'10px 14px',fontWeight:500,color:'#0f172a' }}>
                            {a.marca} {a.modelo}
                            {a.capacidade && <span style={{ fontSize:11,color:'#94a3b8',display:'block' }}>{a.capacidade}{a.cor?` Â· ${a.cor}`:''}</span>}
                          </td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:'#64748b' }}>{a.imei??'â€”'}</td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12 }}>{a.preco_compra?fm(a.preco_compra):'â€”'}</td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12 }}>{a.preco_venda?fm(a.preco_venda):'â€”'}</td>
                          <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:12,fontWeight:600,color:lucro&&lucro>0?'#065f46':lucro&&lucro<0?'#991b1b':'#94a3b8' }}>{lucro!==null?fm(lucro):'â€”'}</td>
                          <td style={{ padding:'10px 14px' }}>{st && <span style={{ fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:20,background:st.bg,color:st.color }}>{st.label}</span>}</td>
                          <td style={{ padding:'10px 14px',fontSize:12,color:'#94a3b8' }}>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                              <button onClick={() => reimprimirTermoCompra(a.id)} style={{ fontSize:11,padding:'4px 10px',border:'1px solid #bfdbfe',borderRadius:7,background:'#dbeafe',cursor:'pointer',color:'#2563eb',whiteSpace:'nowrap' }}>ðŸ–¨ Compra</button>
                              {a.status==='vendido' && <button onClick={() => reimprimirTermoVenda(a.id)} style={{ fontSize:11,padding:'4px 10px',border:'1px solid #bbf7d0',borderRadius:7,background:'#ecfdf5',cursor:'pointer',color:'#065f46',whiteSpace:'nowrap' }}>ðŸ–¨ Venda</button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* â•â•â• MODAL DETALHES â•â•â• */}
      {detalhes && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }} onClick={() => setDetalhes(null)}>
          <div style={{ width:'100%',maxWidth:560,maxHeight:'90vh',background:'#fff',overflow:'auto',padding:28,borderRadius:16,boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20 }}>
              <div>
                <h2 style={{ fontSize:18,fontWeight:700,color:'#0f172a',marginBottom:4 }}>{detalhes.marca} {detalhes.modelo}</h2>
                <span style={{ fontSize:12,fontWeight:600,padding:'2px 10px',borderRadius:20,background:STATUS_CFG[detalhes.status]?.bg,color:STATUS_CFG[detalhes.status]?.color }}>
                  {STATUS_CFG[detalhes.status]?.label ?? detalhes.status}
                </span>
              </div>
              <button onClick={() => setDetalhes(null)} style={{ fontSize:20,background:'none',border:'none',cursor:'pointer',color:'#94a3b8' }}>Ã—</button>
            </div>

            {/* BotÃµes topo */}
            <div style={{ display:'flex',gap:8,marginBottom:16 }}>
              <button onClick={() => { setDetalheEditando(v => !v) }} style={{ flex:1,padding:'8px',border:'1px solid #bfdbfe',borderRadius:8,fontSize:13,background:detalheEditando?'#dbeafe':'#fff',color:'#2563eb',cursor:'pointer',fontWeight:detalheEditando?600:400 }}>
                âœï¸ {detalheEditando ? 'Editando...' : 'Editar'}
              </button>
              <button onClick={() => imprimirCard(detalhes)} style={{ flex:1,padding:'8px',border:'1px solid #dbeafe',borderRadius:8,fontSize:13,background:'#f8f7ff',color:'#2563eb',cursor:'pointer' }}>
                ðŸ· Reimprimir card
              </button>
            </div>

            {/* Infos */}
            <div style={{ background:'#f8fafc',borderRadius:10,padding:'12px 16px',marginBottom:16 }}>
              {[['Capacidade',detalhes.capacidade],['Cor',detalhes.cor],['IMEI',detalhes.imei],['PreÃ§o compra',detalhes.preco_compra?fm(detalhes.preco_compra):null]].map(([l,v]) => v ? (
                <div key={l as string} style={{ display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #e2e8f0',fontSize:13 }}>
                  <span style={{ color:'#64748b' }}>{l}</span><strong style={{ color:'#0f172a' }}>{v}</strong>
                </div>
              ) : null)}
              {/* PreÃ§o venda editÃ¡vel */}
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',fontSize:13 }}>
                <span style={{ color:'#64748b' }}>PreÃ§o venda</span>
                {detalheEditando
                  ? <input type="number" step="0.01" value={detalhePrecoVenda} onChange={e=>setDetalhePrecoVenda(e.target.value)} style={{ width:100,padding:'3px 8px',border:'1px solid #bfdbfe',borderRadius:6,fontSize:13,textAlign:'right',outline:'none' }} />
                  : <strong style={{ color:'#0f172a' }}>{detalhes.preco_venda?fm(detalhes.preco_venda):'â€”'}</strong>
                }
              </div>
              {detalheEditando && (
                <div style={{ marginTop:8 }}>
                  <label style={lbl}>ObservaÃ§Ãµes</label>
                  <textarea value={detalheObs} onChange={e=>setDetalheObs(e.target.value)} style={{ ...inp,minHeight:50,resize:'vertical',fontSize:12 }} />
                </div>
              )}
              {detalheEditando && (
                <button onClick={salvarEdicaoDetalhe} disabled={salvandoStatus} style={{ width:'100%',marginTop:8,padding:'8px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer' }}>
                  {salvandoStatus?'Salvando...':'âœ“ Salvar alteraÃ§Ãµes'}
                </button>
              )}
            </div>

            {/* â”€â”€â”€ ConteÃºdo por status â”€â”€â”€ */}

            {/* sem_revisao â†’ revisÃ£o e peÃ§as */}
            {detalhes.status === 'sem_revisao' && (
              <div style={{ marginBottom:16 }}>
                <p style={{ fontSize:13,fontWeight:600,color:'#92400e',background:'#fef3c7',borderRadius:8,padding:'8px 12px',marginBottom:12 }}>
                  ðŸ” Marque as peÃ§as necessÃ¡rias para reparo
                </p>
                {novasPecas.map((p, i) => {
                  const cl = detalhes.checklist_json?.[p.key]
                  const destaque = cl === 'Regular' || cl === 'Ruim'
                  return (
                    <div key={p.key} style={{ borderRadius:8,border:`1px solid ${destaque?'#fde68a':'#e2e8f0'}`,background:destaque?'#fffbeb':'#f8fafc',padding:'8px 10px',marginBottom:6 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:p.marcado?6:0 }}>
                        <input type="checkbox" checked={p.marcado} onChange={e => setNovasPecas(prev => prev.map((x,j) => j===i ? {...x, marcado:e.target.checked} : x))} style={{ width:16,height:16,flexShrink:0,cursor:'pointer' }} />
                        <span style={{ fontSize:13,color:'#374151',flex:1 }}>{CHECKLIST_ITENS.find(c=>c.key===p.key)?.label ?? p.key}</span>
                        {cl && <span style={{ fontSize:11,padding:'1px 7px',borderRadius:10,background:cl==='Bom'?'#ecfdf5':cl==='Regular'?'#fef3c7':'#fef2f2',color:cl==='Bom'?'#065f46':cl==='Regular'?'#92400e':'#991b1b',fontWeight:600 }}>{cl}</span>}
                      </div>
                      {p.marcado && (
                        <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:6,paddingLeft:24 }}>
                          <input value={p.nome} onChange={e => setNovasPecas(prev => prev.map((x,j) => j===i ? {...x, nome:e.target.value} : x))} style={{ ...inp,fontSize:12,padding:'5px 8px' }} placeholder="Nome da peÃ§a" />
                          <div style={{ display:'flex',alignItems:'center',gap:4 }}>
                            <span style={{ fontSize:12,color:'#64748b' }}>R$</span>
                            <input type="number" step="0.01" value={p.preco} onChange={e => setNovasPecas(prev => prev.map((x,j) => j===i ? {...x, preco:e.target.value} : x))} style={{ ...inp,width:90,fontSize:12,padding:'5px 8px',textAlign:'right' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {(() => {
                  const custoCompra = detalhes.preco_compra ?? 0
                  const custoPecas = novasPecas.filter(p=>p.marcado).reduce((acc,p)=>acc+(parseFloat(p.preco)||0),0)
                  const custoTotal = custoCompra + custoPecas
                  return (
                    <div style={{ background:'#f8fafc',borderRadius:10,padding:'12px 14px',marginTop:8,marginBottom:8,border:'1px solid #e2e8f0' }}>
                      <div style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#64748b',marginBottom:4 }}>
                        <span>Custo de compra</span>
                        <span style={{ fontFamily:'monospace' }}>R$ {custoCompra.toFixed(2).replace('.',',')}</span>
                      </div>
                      {novasPecas.some(p=>p.marcado) && (
                        <div style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#64748b',marginBottom:4 }}>
                          <span>PeÃ§as estimadas</span>
                          <span style={{ fontFamily:'monospace' }}>R$ {custoPecas.toFixed(2).replace('.',',')}</span>
                        </div>
                      )}
                      <div style={{ display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:700,color:'#0f172a',borderTop:'1px solid #e2e8f0',paddingTop:6,marginTop:2 }}>
                        <span>Custo total</span>
                        <span style={{ fontFamily:'monospace',color:'#991b1b' }}>R$ {custoTotal.toFixed(2).replace('.',',')}</span>
                      </div>
                    </div>
                  )
                })()}
                <button onClick={salvarRevisaoPecas} disabled={salvandoStatus} style={{ width:'100%',padding:'10px',background:'#0f172a',color:'#fbbf24',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',marginTop:4 }}>
                  {salvandoStatus ? 'Salvando...' : novasPecas.some(p=>p.marcado) ? 'âœ“ Confirmar peÃ§as e aguardar chegada' : 'âœ“ Sem peÃ§as necessÃ¡rias â€” disponibilizar'}
                </button>
              </div>
            )}

            {/* aguardando_pecas â†’ chegada de peÃ§as */}
            {detalhes.status === 'aguardando_pecas' && (
              <div style={{ marginBottom:16 }}>
                <p style={{ fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10 }}>PeÃ§as aguardadas</p>
                {loadingPecas ? <p style={{ color:'#94a3b8',fontSize:13 }}>Carregando...</p> : modalPecas.length === 0 ? <p style={{ color:'#94a3b8',fontSize:13 }}>Nenhuma peÃ§a cadastrada.</p> : (
                  <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                    {modalPecas.map(p => (
                      <label key={p.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,background:p.chegou?'#ecfdf5':'#f8fafc',cursor:'pointer',fontSize:13,border:'1px solid #e2e8f0' }}>
                        <input type="checkbox" checked={p.chegou} onChange={e => marcarPecaChegou(p.id, e.target.checked)} style={{ width:16,height:16,cursor:'pointer' }} />
                        <span style={{ flex:1,color:p.chegou?'#065f46':'#374151',fontWeight:p.chegou?500:400 }}>{p.peca_nome}</span>
                        {p.preco > 0 && <span style={{ fontSize:12,color:'#64748b',fontFamily:'monospace' }}>R$ {p.preco.toFixed(2).replace('.',',')}</span>}
                        {p.chegou && <span style={{ fontSize:11,color:'#065f46' }}>âœ“</span>}
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ marginTop:12,display:'flex',alignItems:'center',gap:8 }}>
                  <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#64748b',cursor:'pointer' }}>
                    <input type="checkbox" checked={semTodasPecas} onChange={e => setSemTodasPecas(e.target.checked)} />
                    Iniciar reparo sem todas as peÃ§as
                  </label>
                </div>
                <button onClick={iniciarReparo} disabled={salvandoStatus||(!modalPecas.every(p=>p.chegou)&&!semTodasPecas)}
                  style={{ width:'100%',padding:'10px',marginTop:8,background:(!modalPecas.every(p=>p.chegou)&&!semTodasPecas)?'#e2e8f0':'#c2410c',color:(!modalPecas.every(p=>p.chegou)&&!semTodasPecas)?'#94a3b8':'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:(!modalPecas.every(p=>p.chegou)&&!semTodasPecas)?'default':'pointer' }}>
                  {salvandoStatus ? 'Salvando...' : 'ðŸ”§ Iniciar reparo'}
                </button>
              </div>
            )}

            {/* em_reparo â†’ o que foi trocado */}
            {detalhes.status === 'em_reparo' && (
              <div style={{ marginBottom:16 }}>
                <p style={{ fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10 }}>PeÃ§as trocadas</p>
                {loadingPecas ? <p style={{ color:'#94a3b8',fontSize:13 }}>Carregando...</p> : (
                  <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                    {modalPecas.map(p => (
                      <label key={p.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,background:p.trocada?'#ecfdf5':'#f8fafc',cursor:'pointer',fontSize:13,border:'1px solid #e2e8f0' }}>
                        <input type="checkbox" checked={p.trocada} onChange={e => marcarPecaTrocada(p.id, e.target.checked)} style={{ width:16,height:16,cursor:'pointer' }} />
                        <span style={{ flex:1,color:p.trocada?'#065f46':'#374151' }}>{p.peca_nome}</span>
                        {!p.chegou && <span style={{ fontSize:10,color:'#ef4444',background:'#fef2f2',padding:'1px 6px',borderRadius:4 }}>nÃ£o chegou</span>}
                        {p.trocada && <span style={{ fontSize:11,color:'#065f46' }}>âœ“</span>}
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ display:'flex',gap:8,marginTop:10 }}>
                  <input value={pecaExtraNome} onChange={e => setPecaExtraNome(e.target.value)} style={{ ...inp,flex:1,fontSize:12,padding:'6px 10px' }} placeholder="PeÃ§a extra trocada (opcional)..." onKeyDown={e => { if(e.key==='Enter') adicionarPecaExtra() }} />
                  <button onClick={adicionarPecaExtra} disabled={!pecaExtraNome.trim()} style={{ padding:'6px 12px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:12,cursor:'pointer',flexShrink:0 }}>+ Add</button>
                </div>
                <button onClick={confirmarReparo} disabled={salvandoStatus} style={{ width:'100%',padding:'10px',marginTop:10,background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer' }}>
                  {salvandoStatus ? 'Salvando...' : 'âœ“ Confirmar reparo â€” fazer checklist'}
                </button>
              </div>
            )}

            {/* checklist â†’ avaliaÃ§Ã£o final */}
            {detalhes.status === 'checklist' && (
              <div style={{ marginBottom:16 }}>
                <p style={{ fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10 }}>Checklist final</p>
                <p style={{ fontSize:11,fontWeight:700,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6 }}>ðŸŽ¨ EstÃ©tico</p>
                <div style={{ display:'flex',flexDirection:'column',gap:4,marginBottom:10 }}>
                  {CHECKLIST_ESTETICO.map(item => (
                    <div key={item.key} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:7,background:'#f8fafc' }}>
                      <span style={{ flex:1,fontSize:12,color:'#374151' }}>{item.label}</span>
                      <div style={{ display:'flex',gap:3 }}>
                        {ESTADOS.map(e => (
                          <button key={e.v} onClick={() => setChecklistFinal(p => ({...p,[item.key]:e.v}))} style={{ padding:'3px 7px',borderRadius:5,border:`1px solid ${checklistFinal[item.key]===e.v?e.border:'#e2e8f0'}`,background:checklistFinal[item.key]===e.v?e.bg:'#fff',color:checklistFinal[item.key]===e.v?e.color:'#94a3b8',fontSize:10,fontWeight:checklistFinal[item.key]===e.v?600:400,cursor:'pointer' }}>{e.v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize:11,fontWeight:700,color:'#059669',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6 }}>âš™ï¸ Funcional</p>
                <div style={{ display:'flex',flexDirection:'column',gap:4,marginBottom:10 }}>
                  {CHECKLIST_FUNCIONAL.map(item => (
                    <div key={item.key} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:7,background:'#f8fafc' }}>
                      <span style={{ flex:1,fontSize:12,color:'#374151' }}>{item.label}</span>
                      <div style={{ display:'flex',gap:3 }}>
                        {ESTADOS.map(e => (
                          <button key={e.v} onClick={() => setChecklistFinal(p => ({...p,[item.key]:e.v}))} style={{ padding:'3px 7px',borderRadius:5,border:`1px solid ${checklistFinal[item.key]===e.v?e.border:'#e2e8f0'}`,background:checklistFinal[item.key]===e.v?e.bg:'#fff',color:checklistFinal[item.key]===e.v?e.color:'#94a3b8',fontSize:10,fontWeight:checklistFinal[item.key]===e.v?600:400,cursor:'pointer' }}>{e.v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {!Object.values(checklistFinal).every(v=>v==='Bom'||v==='N/A') && (
                  <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#64748b',cursor:'pointer',marginBottom:8 }}>
                    <input type="checkbox" checked={liberarSemChecklist} onChange={e => setLiberarSemChecklist(e.target.checked)} />
                    Liberar para venda sem todo checklist OK
                  </label>
                )}
                <button onClick={liberarParaVenda} disabled={salvandoStatus||(!Object.values(checklistFinal).every(v=>v==='Bom'||v==='N/A')&&!liberarSemChecklist)}
                  style={{ width:'100%',padding:'10px',background:(!Object.values(checklistFinal).every(v=>v==='Bom'||v==='N/A')&&!liberarSemChecklist)?'#e2e8f0':'#16a34a',color:(!Object.values(checklistFinal).every(v=>v==='Bom'||v==='N/A')&&!liberarSemChecklist)?'#94a3b8':'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:(!Object.values(checklistFinal).every(v=>v==='Bom'||v==='N/A')&&!liberarSemChecklist)?'default':'pointer' }}>
                  {salvandoStatus ? 'Salvando...' : 'âœ“ Liberar para venda'}
                </button>
              </div>
            )}

            {/* disponivel â†’ card + vender */}
            {detalhes.status === 'disponivel' && (
              <div style={{ display:'flex',flexDirection:'column',gap:8,marginBottom:16 }}>
                <button onClick={() => imprimirCard(detalhes)} style={{ width:'100%',padding:'10px',background:'#0f172a',color:'#fbbf24',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer' }}>
                  ðŸ· Imprimir card de venda
                </button>
                <button onClick={() => { setAparelhoVenda(detalhes); setDetalhes(null); setAba('vender' as any) }} style={{ width:'100%',padding:'10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer' }}>
                  â¬† Vender este aparelho â†’
                </button>
              </div>
            )}

            {detalhes.observacoes && (
              <div style={{ marginTop:16,background:'#fef3c7',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#92400e' }}>
                <p style={{ fontWeight:600,marginBottom:4 }}>ObservaÃ§Ãµes</p>
                <p>{detalhes.observacoes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* â•â•â• COMPRAR â•â•â• */}
      {aba === 'comprar' && (
        <div style={{ maxWidth: 820 }}>

          {/* Tipo */}
          <div style={card}>
            <p style={sec}>Tipo de aparelho</p>
            <div style={{ display:'flex',gap:10 }}>
              {(['usado','novo'] as const).map(t => (
                <button key={t} onClick={() => setCTipo(t)} style={{ flex:1,padding:'12px',borderRadius:10,border:`2px solid ${cTipo===t?'#2563eb':'#e2e8f0'}`,background:cTipo===t?'#dbeafe':'#fff',cursor:'pointer',fontSize:13,fontWeight:cTipo===t?600:400,color:cTipo===t?'#1d4ed8':'#374151' }}>
                  {t==='usado'?'ðŸ“± Aparelho usado':'ðŸ†• Aparelho novo'}
                </button>
              ))}
            </div>
          </div>

          {/* Modelo â€” busca no banco */}
          <div style={card}>
            <p style={sec}>IdentificaÃ§Ã£o do aparelho</p>
            <div style={{ position:'relative',marginBottom:14 }}>
              <label style={lbl}>Modelo do aparelho *</label>
              <div style={{ display:'flex',gap:10 }}>
                <div style={{ flex:1,position:'relative' }}>
                  <input ref={modeloRef} style={{ ...inp, borderColor: submitAttempted && !modeloSelecionado ? '#ef4444' : modeloSelecionado ? '#22c55e' : '#e2e8f0' }} value={modeloInput} onChange={e => onModeloChange(e.target.value)} placeholder="Ex: Samsung Galaxy A55, iPhone 15 Pro, Redmi 13C..." autoComplete="off" />
                  {showSugestoes && modeloSugestoes.length > 0 && (
                    <div style={{ position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:'#fff',border:'1px solid #e2e8f0',borderRadius:9,boxShadow:'0 8px 24px rgba(0,0,0,0.1)',marginTop:4,overflow:'hidden' }}>
                      {modeloSugestoes.map(d => (
                        <div key={d.id} onClick={() => selecionarModelo(d)} style={{ padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center' }}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#eff6ff'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff'}}>
                          <div>
                            <p style={{ fontSize:13,fontWeight:500,color:'#0f172a' }}>{d.marca} {d.modelo}</p>
                            <p style={{ fontSize:11,color:'#94a3b8' }}>{[d.ram,d.armazenamento,d.tela].filter(Boolean).join(' Â· ')}</p>
                          </div>
                          {d.lancamento && <span style={{ fontSize:11,color:'#94a3b8' }}>{d.lancamento}</span>}
                        </div>
                      ))}
                      <div onClick={buscarSpecs} style={{ padding:'9px 14px',cursor:'pointer',background:'#f0f4ff',fontSize:12,color:'#2563eb',fontWeight:500,display:'flex',alignItems:'center',gap:6 }}>
                        ðŸ” NÃ£o encontrado â€” buscar online
                      </div>
                    </div>
                  )}
                </div>
                {!showSugestoes && (
                  <button onClick={buscarSpecs} disabled={buscandoSpecs || !modeloInput.trim()} style={{ padding:'9px 16px',background:buscandoSpecs?'#93c5fd':'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',fontWeight:500 }}>
                    {buscandoSpecs?'â³ Buscando...':'ðŸ” Buscar specs'}
                  </button>
                )}
              </div>
            </div>

            {submitAttempted && !modeloSelecionado && (
              <p style={{ fontSize:11,color:'#ef4444',marginTop:4 }}>âš  Selecione o modelo do aparelho</p>
            )}

            {modeloSelecionado && (
              <div style={{ background:'#f0f4ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'12px 16px',marginBottom:14 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                  <p style={{ fontSize:13,fontWeight:600,color:'#1d4ed8' }}>âœ“ {modeloSelecionado.marca} {modeloSelecionado.modelo}</p>
                  {modeloSelecionado.lancamento && <span style={{ fontSize:11,color:'#2563eb' }}>{modeloSelecionado.lancamento}</span>}
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8 }}>
                  {[['Tela',modeloSelecionado.tela],['RAM',modeloSelecionado.ram],['Armazenamento',modeloSelecionado.armazenamento],['Processador',modeloSelecionado.processador],['CÃ¢mera tras.',modeloSelecionado.camera_principal],['CÃ¢mera front.',modeloSelecionado.camera_frontal],['Bateria',modeloSelecionado.bateria],['Sistema',modeloSelecionado.sistema]].filter(([,v])=>v).map(([k,v]) => (
                    <div key={k as string}><p style={{ fontSize:10,color:'#2563eb',fontWeight:500 }}>{k}</p><p style={{ fontSize:12,color:'#1e293b',fontWeight:500 }}>{v}</p></div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12 }}>
              <div><label style={lbl}>Capacidade</label><input style={inp} value={cCapacidade} onChange={e => setCCapacidade(e.target.value)} placeholder="Ex: 128GB / 64GB/128GB" /></div>
              <div><label style={lbl}>Cor</label><input style={inp} value={cCor} onChange={e => setCCor(e.target.value)} placeholder="Ex: Midnight Black" /></div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Senha do aparelho</label>
                <div style={{ display:'flex',gap:8,marginBottom:8 }}>
                  {(['nenhuma','pin','padrao'] as const).map(t => (
                    <button key={t} onClick={() => setCTipoSenha(t)} style={{ padding:'6px 14px',borderRadius:7,border:`1px solid ${cTipoSenha===t?'#2563eb':'#e2e8f0'}`,background:cTipoSenha===t?'#dbeafe':'#fff',color:cTipoSenha===t?'#2563eb':'#64748b',fontSize:12,fontWeight:cTipoSenha===t?600:400,cursor:'pointer' }}>
                      {t==='nenhuma'?'Nenhuma':t==='pin'?'PIN / Senha':'PadrÃ£o'}
                    </button>
                  ))}
                </div>
                {cTipoSenha==='pin' && (
                  <input style={inp} value={cSenha} onChange={e=>setCScenha(e.target.value)} placeholder="Digite o PIN ou senha..." />
                )}
                {cTipoSenha==='padrao' && (
                  <div style={{ display:'flex',gap:16,alignItems:'center' }}>
                    <canvas ref={padCanvasRef} width={120} height={120} style={{ border:'1px solid #e2e8f0',borderRadius:8,cursor:'pointer',background:'#f8fafc' }} onClick={onPadCanvasClick} />
                    <div>
                      <p style={{ fontSize:12,color:'#374151',marginBottom:6 }}>Clique nos pontos para traÃ§ar o padrÃ£o</p>
                      {cPadrao.length > 0 && <p style={{ fontSize:13,fontWeight:600,color:'#2563eb',marginBottom:8 }}>{cPadrao.join(' â†’ ')}</p>}
                      <button onClick={limparPadrao} style={{ fontSize:12,color:'#ef4444',background:'none',border:'none',cursor:'pointer',padding:0 }}>Limpar padrÃ£o</button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>IMEI 1</label>
                <input style={inp} value={cIMEI} onChange={e => setCIMEI(e.target.value)} placeholder="15 dÃ­gitos" maxLength={15} />
                {cIMEI.length===15 && <a href={`https://www.aparelhoslegais.com.br/consulta?imei=${cIMEI}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:11,color:'#2563eb',textDecoration:'none',display:'block',marginTop:3 }}>ðŸ” Consultar Aparelhos Legais â†’</a>}
              </div>
              <div><label style={lbl}>IMEI 2 (dual SIM)</label><input style={inp} value={cIMEI2} onChange={e => setCIMEI2(e.target.value)} placeholder="Opcional" maxLength={15} /></div>
            </div>
          </div>

          {/* Checklist â€” duas seÃ§Ãµes */}
          {cTipo === 'usado' && (
            <div style={card}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
                <p style={sec}>Checklist de estado</p>
                {Object.keys(cChecklist).length > 0 && (
                  <span style={{ fontSize:12,fontWeight:600,padding:'3px 12px',borderRadius:20,background:notaGeral(cChecklist)==='Bom'?'#ecfdf5':notaGeral(cChecklist)==='Regular'?'#fef3c7':'#fef2f2',color:notaGeral(cChecklist)==='Bom'?'#065f46':notaGeral(cChecklist)==='Regular'?'#92400e':'#991b1b' }}>
                    Geral: {notaGeral(cChecklist)}
                  </span>
                )}
              </div>

              {/* EstÃ©tico */}
              <p style={{ fontSize:11,fontWeight:700,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8 }}>ðŸŽ¨ EstÃ©tico</p>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:8,marginBottom:16 }}>
                {CHECKLIST_ESTETICO.map(item => (
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

              {/* Funcional */}
              <p style={{ fontSize:11,fontWeight:700,color:'#059669',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8 }}>âš™ï¸ Funcional</p>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:8,marginBottom:12 }}>
                {CHECKLIST_FUNCIONAL.map(item => (
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

              <div style={{ marginTop:4 }}>
                <label style={lbl}>ObservaÃ§Ãµes</label>
                <textarea style={{ ...inp,minHeight:60,resize:'vertical' }} value={cObs} onChange={e => setCObs(e.target.value)} placeholder="ArranhÃµes, detalhes relevantes..." />
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
                    <button onClick={() => setFotoVendedor('')} style={{ position:'absolute',top:-6,right:-6,width:20,height:20,borderRadius:'50%',background:'#ef4444',color:'#fff',border:'none',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center' }}>Ã—</button>
                  </div>
                ) : null}
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  <button onClick={abrirCamera} style={{ padding:'8px 14px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,cursor:'pointer',background:'#f8fafc',color:'#374151',display:'flex',alignItems:'center',gap:6 }}>
                    <i className="ti ti-camera" style={{ fontSize:14 }} /> CÃ¢mera / Webcam
                  </button>
                  <label style={{ padding:'8px 14px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,cursor:'pointer',background:'#f8fafc',color:'#374151',display:'flex',alignItems:'center',gap:6 }}>
                    <i className="ti ti-upload" style={{ fontSize:14 }} /> Upload de arquivo
                    <input type="file" accept="image/*" style={{ display:'none' }} onChange={uploadFoto} />
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Nome completo *</label>
                <input ref={vNomeRef} style={{ ...inp, borderColor: submitAttempted && !vNome.trim() ? '#ef4444' : vNome.trim() ? '#22c55e' : '#e2e8f0' }} value={vNome} onChange={e => setVNome(e.target.value)} />
                {submitAttempted && !vNome.trim() && <p style={{ fontSize:11,color:'#ef4444',marginTop:2 }}>âš  Campo obrigatÃ³rio</p>}
              </div>
              <div>
                <label style={lbl}>CPF *</label>
                <input ref={vCPFRef} style={{ ...inp, borderColor: (submitAttempted && !vCPF.trim()) || vCpfErro ? '#ef4444' : vCPF.trim() && !vCpfErro ? '#22c55e' : '#e2e8f0' }} value={vCPF} onChange={e => { const v = formatarCPF(e.target.value); setVCPF(v); const raw = v.replace(/\D/g,''); setVCpfErro(raw.length > 0 && raw.length < 11 ? 'CPF incompleto' : raw.length === 11 && !validarCPF(raw) ? 'CPF invÃ¡lido' : '') }} placeholder="000.000.000-00" maxLength={14} />
                {(vCpfErro || (submitAttempted && !vCPF.trim())) && <p style={{ fontSize:11,color:'#ef4444',marginTop:2 }}>{vCpfErro || 'âš  Campo obrigatÃ³rio'}</p>}
              </div>
              <div><label style={lbl}>RG</label><input style={inp} value={vRG} onChange={e => setVRG(e.target.value)} /></div>
              <div><label style={lbl}>Telefone</label><input style={inp} value={vTel} onChange={e => setVTel(formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} /></div>
              <div><label style={lbl}>E-mail</label><input style={inp} value={vEmail} onChange={e => setVEmail(e.target.value)} /></div>
            </div>
            {/* CEP com busca automÃ¡tica */}
            <div style={{ marginTop:12 }}>
              <label style={lbl}>CEP</label>
              <div style={{ display:'flex',gap:8 }}>
                <input style={{ ...inp,maxWidth:150 }} value={vCEP} onChange={e => { setVCEP(formatCEP(e.target.value)); if (e.target.value.replace(/\D/g,'').length===8) buscarCEP(e.target.value) }} placeholder="00000-000" maxLength={9} />
                {buscandoCEP && <span style={{ fontSize:12,color:'#2563eb',alignSelf:'center' }}>â³ Buscando...</span>}
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
            <p style={sec}>CondiÃ§Ãµes de pagamento</p>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div>
                <label style={lbl}>Valor pago (R$) *</label>
                <input ref={cValorRef} style={{ ...inp,fontSize:18,fontWeight:600, borderColor: submitAttempted && (!cValor||parseFloat(cValor)<=0) ? '#ef4444' : cValor && parseFloat(cValor) > 0 ? '#22c55e' : '#e2e8f0' }} type="number" step="0.01" value={cValor} onChange={e => setCValor(e.target.value)} placeholder="0,00" />
                {submitAttempted && (!cValor || parseFloat(cValor) <= 0) && <p style={{ fontSize:11,color:'#ef4444',marginTop:2 }}>âš  Informe o valor pago</p>}
              </div>
              <div>
                <label style={lbl}>Forma de pagamento</label>
                <select style={inp} value={cForma} onChange={e => setCForma(e.target.value)}>{FORMAS_PGTO.map(f=><option key={f}>{f}</option>)}</select>
                {cForma === 'CartÃ£o crÃ©dito parcelado' && (
                  <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:6 }}>
                    <span style={{ fontSize:12,color:'#64748b' }}>Parcelas:</span>
                    <select value={cParcelas} onChange={e => setCParcelas(parseInt(e.target.value))} style={{ padding:'4px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:13,outline:'none' }}>
                      {[2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}x</option>)}
                    </select>
                    {cValor && <span style={{ fontSize:11,color:'#92400e' }}>{cParcelas}x de R$ {(parseFloat(cValor)/cParcelas).toFixed(2).replace('.',',')}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Assinaturas */}
          <div style={card}>
            <p style={sec}>Assinatura do vendedor</p>
            <p style={{ fontSize:12,color:'#64748b',marginBottom:10 }}>O vendedor deve assinar para confirmar as declaraÃ§Ãµes do termo.</p>
            <div style={{ border:'1px solid #e2e8f0',borderRadius:8,background:'#fafafa',display:'inline-block',position:'relative' }}>
              <canvas ref={vendCanvasRef} width={480} height={110} style={{ display:'block',cursor:'crosshair',borderRadius:8 }}
                onMouseDown={vendHandlers.onMouseDown} onMouseMove={vendHandlers.onMouseMove} onMouseUp={vendHandlers.onMouseUp} onMouseLeave={vendHandlers.onMouseLeave} />
              {!assinaturaVendedor && <p style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',color:'#cbd5e1',fontSize:12,pointerEvents:'none',userSelect:'none' }}>Assinar aqui...</p>}
            </div>
            {assinaturaVendedor && <button onClick={() => limparCanvas(vendCanvasRef, setAssinaturaVendedor)} style={{ marginLeft:10,fontSize:12,color:'#ef4444',background:'none',border:'none',cursor:'pointer' }}>Limpar</button>}
            {assinaturaLoja && (
              <div style={{ marginTop:12 }}>
                <p style={{ fontSize:11,color:'#64748b',marginBottom:6 }}>Assinatura do responsÃ¡vel da loja (configurada em ConfiguraÃ§Ãµes):</p>
                <img src={assinaturaLoja} style={{ height:50,border:'1px solid #e2e8f0',borderRadius:6,background:'#fafafa',padding:4 }} alt="Assinatura loja" />
              </div>
            )}
          </div>

          <button onClick={salvarCompra} disabled={salvando} style={{ width:'100%',padding:'14px',background:salvando?'#93c5fd':'#2563eb',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:salvando?'not-allowed':'pointer' }}>
            {salvando ? 'Salvando...' : 'âœ“ Registrar compra'}
          </button>
        </div>
      )}

      {/* â•â•â• VENDER â•â•â• */}
      {aba === 'vender' && (
        <div style={{ maxWidth: 820 }}>
          {!aparelhoVenda ? (
            <div style={card}>
              <p style={sec}>Selecionar aparelho para venda</p>
              {aparelhos.filter(a=>a.status==='disponivel').length === 0 ? <p style={{ textAlign:'center',padding:30,color:'#94a3b8' }}>Nenhum disponÃ­vel.</p> :
                aparelhos.filter(a=>a.status==='disponivel').map(a => (
                  <div key={a.id} onClick={() => setAparelhoVenda(a)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',border:'1px solid #e2e8f0',borderRadius:10,cursor:'pointer',marginBottom:8,background:'#fff' }}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#eff6ff'}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff'}}>
                    <div><p style={{ fontWeight:500,color:'#0f172a' }}>{a.marca} {a.modelo}</p><p style={{ fontSize:12,color:'#94a3b8' }}>{a.capacidade}{a.cor?` Â· ${a.cor}`:''}{a.imei?` Â· ${a.imei}`:''}</p></div>
                    <p style={{ fontSize:13,fontWeight:600,color:'#2563eb' }}>Comprado por {a.preco_compra?fm(a.preco_compra):'â€”'}</p>
                  </div>
                ))
              }
            </div>
          ) : (
            <>
              <div style={{ ...card,background:'#f0f4ff',border:'1px solid #bfdbfe' }}>
                <div style={{ display:'flex',justifyContent:'space-between' }}>
                  <div><p style={{ fontSize:15,fontWeight:600,color:'#1d4ed8' }}>{aparelhoVenda.marca} {aparelhoVenda.modelo}</p><p style={{ fontSize:12,color:'#2563eb',marginTop:2 }}>{aparelhoVenda.capacidade}{aparelhoVenda.cor?` Â· ${aparelhoVenda.cor}`:''}</p></div>
                  <button onClick={() => setAparelhoVenda(null)} style={{ fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer' }}>Trocar â†’</button>
                </div>
              </div>
              <div style={card}>
                <p style={sec}>Dados do comprador</p>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                  <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Nome completo *</label><input style={inp} value={bNome} onChange={e => setBNome(e.target.value)} /></div>
                  <div><label style={lbl}>CPF *</label><input style={{ ...inp, borderColor: bCpfErro ? '#ef4444' : '#e2e8f0' }} value={bCPF} onChange={e => { const v = formatarCPF(e.target.value); setBCPF(v); const raw = v.replace(/\D/g,''); setBCpfErro(raw.length > 0 && raw.length < 11 ? 'CPF incompleto' : raw.length === 11 && !validarCPF(raw) ? 'CPF invÃ¡lido' : '') }} placeholder="000.000.000-00" maxLength={14} />{bCpfErro && <p style={{ fontSize:11,color:'#ef4444',marginTop:2 }}>{bCpfErro}</p>}</div>
                  <div><label style={lbl}>Telefone</label><input style={inp} value={bTel} onChange={e => setBTel(formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} /></div>
                  <div><label style={lbl}>E-mail</label><input style={inp} value={bEmail} onChange={e => setBEmail(e.target.value)} /></div>
                  <div><label style={lbl}>EndereÃ§o</label><input style={inp} value={bEnd} onChange={e => setBEnd(e.target.value)} /></div>
                </div>
              </div>
              <div style={card}>
                <p style={sec}>CondiÃ§Ãµes de venda</p>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12 }}>
                  <div><label style={lbl}>Valor de venda (R$) *</label>
                    <input style={{ ...inp,fontSize:18,fontWeight:600 }} type="number" step="0.01" value={bValor} onChange={e => setBValor(e.target.value)} placeholder="0,00" />
                    {bValor && aparelhoVenda.preco_compra && <p style={{ fontSize:11,marginTop:4,fontWeight:500,color:parseFloat(bValor)>aparelhoVenda.preco_compra?'#065f46':'#991b1b' }}>{parseFloat(bValor)>aparelhoVenda.preco_compra?`âœ“ Lucro: ${fm(parseFloat(bValor)-aparelhoVenda.preco_compra)}`:`âš  PrejuÃ­zo: ${fm(aparelhoVenda.preco_compra-parseFloat(bValor))}`}</p>}
                  </div>
                  <div>
                    <label style={lbl}>Forma de pagamento</label>
                    <select style={inp} value={bForma} onChange={e => setBForma(e.target.value)}>{FORMAS_PGTO.map(f=><option key={f}>{f}</option>)}</select>
                    {bForma === 'CartÃ£o crÃ©dito parcelado' && (
                      <div style={{ display:'flex',alignItems:'center',gap:6,marginTop:6 }}>
                        <span style={{ fontSize:12,color:'#64748b' }}>Parcelas:</span>
                        <select value={bParcelas} onChange={e => setBParcelas(parseInt(e.target.value))} style={{ padding:'4px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:13,outline:'none' }}>
                          {[2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}x</option>)}
                        </select>
                        {bValor && <span style={{ fontSize:11,color:'#92400e' }}>{bParcelas}x R$ {(parseFloat(bValor)/bParcelas).toFixed(2).replace('.',',')}</span>}
                      </div>
                    )}
                  </div>
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
              <button onClick={salvarVenda} disabled={salvando||!bNome.trim()||!bCPF.trim()||!bValor} style={{ width:'100%',padding:'14px',background:salvando||!bNome.trim()||!bCPF.trim()||!bValor?'#e2e8f0':'#2563eb',color:salvando||!bNome.trim()||!bCPF.trim()||!bValor?'#94a3b8':'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer' }}>
                {salvando?'Salvando...':'âœ“ Registrar venda'}
              </button>
            </>
          )}
        </div>
      )}

      {/* â•â•â• MODAL SUCESSO â•â•â• */}
      {modalSucesso && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div style={{ background:'#fff',borderRadius:20,padding:36,maxWidth:440,width:'100%',boxShadow:'0 24px 64px rgba(0,0,0,0.3)',textAlign:'center' }}>
            <div style={{ width:64,height:64,borderRadius:'50%',background:modalSucesso.tipo==='compra'?'#fef3c7':'#ecfdf5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,margin:'0 auto 16px' }}>
              {modalSucesso.tipo==='compra'?'â¬‡':'â¬†'}
            </div>
            <h2 style={{ fontSize:20,fontWeight:700,color:'#0f172a',marginBottom:6 }}>
              {modalSucesso.tipo==='compra'?'Compra registrada!':'Venda registrada!'}
            </h2>
            <p style={{ fontSize:14,color:'#2563eb',fontWeight:600,marginBottom:4 }}>#{modalSucesso.numero}</p>
            <p style={{ fontSize:13,color:'#64748b',marginBottom:24 }}>
              {modalSucesso.aparelho.marca} {modalSucesso.aparelho.modelo}{modalSucesso.aparelho.capacidade?` Â· ${modalSucesso.aparelho.capacidade}`:''}
            </p>
            <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
              <button onClick={() => {
                if (modalSucesso.tipo==='compra') {
                  gerarTermoCompraHTML({
                    numero: compraSalva?.numero ?? modalSucesso.numero,
                    hoje: new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }),
                    ap: { ...modalSucesso.aparelho, id:'', tipo:'usado', status:'sem_revisao', cor:cCor||null, imei:cIMEI||null, imei2:cIMEI2||null, specs_json:modeloSelecionado??{}, preco_compra:parseFloat(cValor||'0'), preco_venda:null, checklist_json:cChecklist, checklist_nota:notaGeral(cChecklist), observacoes:cObs||null, created_at:'', senha_tipo:cTipoSenha!=='nenhuma'?cTipoSenha:null, senha_valor:cTipoSenha==='pin'?cSenha:cTipoSenha==='padrao'&&cPadrao.length>0?cPadrao.join(' â†’ '):null },
                    vNomeP:vNome, vCPFP:vCPF, vRGP:vRG, vTelP:vTel,
                    vEndP:[vEnd,vBairro,vCidade,vEstado].filter(Boolean).join(', '), vCEPP:vCEP,
                    valorP:parseFloat(cValor||'0'), formaP:cForma,
                    assVend:assinaturaVendedor, assLoja:assinaturaLoja, foto:fotoVendedor,
                    senhaT:cTipoSenha!=='nenhuma'?cTipoSenha:'', senhaV:cTipoSenha==='pin'?cSenha:cTipoSenha==='padrao'?cPadrao.join(' â†’ '):'',
                  })
                } else if (aparelhoVenda) {
                  gerarTermoVendaHTML({
                    numero: vendaSalva?.numero ?? modalSucesso.numero,
                    hoje: new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }),
                    ap: aparelhoVenda,
                    bNomeP:bNome, bCPFP:bCPF, bTelP:bTel, bEndP:bEnd,
                    valorP:parseFloat(bValor||'0'), formaP:bForma, garantiaP:parseInt(bGarantia),
                    assCompr:assinaturaComprador, assLoja:assinaturaLoja,
                  })
                }
              }} style={{ padding:'12px',background:'#2563eb',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer' }}>
                ðŸ–¨ Imprimir termo
              </button>
              <button onClick={() => {
                setModalSucesso(null)
                if (modalSucesso.tipo==='compra') {
                  setCompraSalva(null); setModeloInput(''); setModeloSelecionado(null); setCIMEI(''); setCIMEI2(''); setCCor(''); setCCapacidade(''); setCObs(''); setCChecklist({}); setCValor(''); setVNome(''); setVCPF(''); setVRG(''); setVTel(''); setVEmail(''); setVCEP(''); setVEnd(''); setVBairro(''); setVCidade(''); setVEstado(''); setAssinaturaVendedor(''); setFotoVendedor(''); setCTipoSenha('nenhuma'); setCScenha(''); setCPadrao([]); setSubmitAttempted(false)
                  setAba('estoque')
                } else {
                  setVendaSalva(null); setAparelhoVenda(null); setBNome(''); setBCPF(''); setBTel(''); setBEmail(''); setBEnd(''); setBValor(''); setAssinaturaComprador('')
                  setAba('historico')
                }
              }} style={{ padding:'12px',background:'#f1f5f9',color:'#374151',border:'none',borderRadius:10,fontSize:14,fontWeight:500,cursor:'pointer' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cÃ¢mera */}
      {showCamera && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:200 }}>
          <video ref={videoRef} autoPlay playsInline style={{ maxWidth:'90vw',maxHeight:'70vh',borderRadius:12 }} />
          <canvas ref={fotoCanvasRef} style={{ display:'none' }} />
          <div style={{ display:'flex',gap:12,marginTop:20 }}>
            <button onClick={tirarFoto} style={{ padding:'12px 28px',background:'#fff',color:'#0f172a',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer' }}>ðŸ“¸ Tirar foto</button>
            <button onClick={fecharCamera} style={{ padding:'12px 28px',background:'rgba(255,255,255,0.15)',color:'#fff',border:'1px solid rgba(255,255,255,0.3)',borderRadius:10,fontSize:14,cursor:'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}


