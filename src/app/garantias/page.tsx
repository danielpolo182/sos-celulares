'use client'
export const dynamic = 'force-dynamic'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type OSResult = {
  id: string; numero: number; status: string; modelo: string | null
  defeito_relatado: string; solucao: string | null
  valor_final: number | null; valor_orcamento: number | null
  created_at: string
  clientes: { nome: string; telefone: string | null } | null
}

type OSSugestao = {
  id: string; numero: number; modelo: string | null
  clientes: { nome: string } | null
}

type Garantia = {
  id: string; numero: number; status: string; motivo_retorno: string
  justificativa: string | null; created_at: string; updated_at: string
  observacoes_fornecedor: string | null
  fornecedor_notificado_em: string | null
  fornecedor_respondeu_em: string | null
  prazo_resposta_dias: number
  peca_enviada_em: string | null; concluida_em: string | null
  os_origem: { numero: number; modelo: string | null; defeito_relatado: string; created_at: string } | null
  os_garantia: { numero: number } | null
  fornecedores_destino: { nome: string; telefone: string | null } | null
  clientes_origem: { nome: string } | null
}

type GarantiaTimeline = {
  id: string; tipo: string; descricao: string; status_novo: string | null; created_at: string
  perfis: { nome: string } | null
}

type Fornecedor = { id: string; nome: string; telefone: string | null }

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  aberta:                { label: 'Aberta',               bg: '#eff6ff', color: '#1d4ed8', icon: '🔵' },
  aprovada:              { label: 'Aprovada',             bg: '#ecfdf5', color: '#065f46', icon: '✅' },
  negada:                { label: 'Negada',               bg: '#fef2f2', color: '#991b1b', icon: '❌' },
  parcial:               { label: 'Parcial',              bg: '#fef3c7', color: '#92400e', icon: '🔄' },
  acionando_fornecedor:  { label: 'Acionando fornec.',    bg: '#eff6ff', color: '#6b21a8', icon: '🏭' },
  aguardando_fornecedor: { label: 'Aguard. fornecedor',   bg: '#fef3c7', color: '#92400e', icon: '⏳' },
  peca_enviada:          { label: 'Peça enviada',         bg: '#f0f9ff', color: '#0369a1', icon: '📦' },
  concluida:             { label: 'Concluída',            bg: '#ecfdf5', color: '#065f46', icon: '✓'  },
}

const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', pronta: 'Pronta',
  entregue: 'Entregue', cancelada: 'Cancelada',
}

const PROXIMOS_STATUS: Record<string, string[]> = {
  aberta:                ['aprovada','negada','parcial','acionando_fornecedor'],
  aprovada:              ['concluida'],
  parcial:               ['concluida'],
  acionando_fornecedor:  ['aguardando_fornecedor','negada'],
  aguardando_fornecedor: ['peca_enviada','negada','aprovada'],
  peca_enviada:          ['concluida'],
}

const TIMELINE_ICON: Record<string, string> = {
  criada: '✦', status_alterado: '↻', fornecedor_acionado: '📤',
  fornecedor_respondeu: '📥', peca_enviada: '📦', concluida: '✓', observacao: '📝',
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

export default function GarantiasPage() {
  const supabase = createClient()
  const router = useRouter()
  const [aba, setAba] = useState<'registrar' | 'historico' | 'ranking'>('registrar')

  // Registrar
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [osEncontrada, setOsEncontrada] = useState<OSResult | null>(null)
  const [osBloqueada, setOsBloqueada] = useState<{ id: string; numero: number; status: string } | null>(null)
  const [erroBusca, setErroBusca] = useState('')
  const [sugestoes, setSugestoes] = useState<OSSugestao[]>([])
  const [showSugestoes, setShowSugestoes] = useState(false)
  const buscaRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [motivo, setMotivo] = useState('')
  const [acao, setAcao] = useState<'aprovada'|'negada'|'parcial'|'acionando_fornecedor'|''>('')
  const [justificativa, setJustificativa] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [obsForncedor, setObsFornecedor] = useState('')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [salvando, setSalvando] = useState(false)
  const [garantiaSalva, setGarantiaSalva] = useState<Garantia | null>(null)
  const [waTemplate, setWaTemplate] = useState('')
  const [cfgLoja, setCfgLoja] = useState<Record<string, string>>({})

  // Histórico
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [search, setSearch] = useState('')
  const [garantiaSel, setGarantiaSel] = useState<Garantia | null>(null)
  const [timeline, setTimeline] = useState<GarantiaTimeline[]>([])
  const [loadingTL, setLoadingTL] = useState(false)
  const [novaObs, setNovaObs] = useState('')
  const [waModal, setWaModal] = useState<{ garantia: Garantia; mensagem: string } | null>(null)
  const [mudandoStatus, setMudandoStatus] = useState(false)

  // Ranking
  const [ranking, setRanking] = useState<{ nome: string; total: number; acionamentos: number; pct: number }[]>([])

  const fetchFornecedores = useCallback(async () => {
    const [{ data: f }, { data: cfg }, { data: configs }] = await Promise.all([
      supabase.from('fornecedores').select('id,nome,telefone').eq('ativo', true).order('nome'),
      supabase.from('sistema_config').select('valor').eq('chave', 'wa_garantia_fornecedor').single(),
      supabase.from('sistema_config').select('chave,valor')
        .in('chave', ['loja_nome','loja_telefone','loja_email','loja_endereco','loja_cnpj','recibo_os_formato','garantia_dias']),
    ])
    setFornecedores((f ?? []) as Fornecedor[])
    if (cfg) setWaTemplate(cfg.valor)
    if (configs) {
      const map: Record<string, string> = {}
      configs.forEach((c: { chave: string; valor: string }) => { map[c.chave] = c.valor })
      setCfgLoja(map)
    }
  }, [supabase])

  const fetchHistorico = useCallback(async () => {
    setLoadingHist(true)
    let q = supabase.from('garantias')
      .select(`*,
        os_origem:os_origem_id(numero,modelo,defeito_relatado,created_at),
        os_garantia:os_garantia_id(numero),
        fornecedores_destino:fornecedor_destino_id(nome,telefone),
        clientes_origem:os_origem_id(clientes(nome))
      `)
      .order('created_at', { ascending: false }).limit(100)
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
    if (search) q = q.ilike('motivo_retorno', `%${search}%`)
    const { data } = await q
    setGarantias((data ?? []) as unknown as Garantia[])
    setLoadingHist(false)
  }, [supabase, filtroStatus, search])

  const fetchTimeline = useCallback(async (garantiaId: string) => {
    setLoadingTL(true)
    const { data } = await supabase.from('garantia_timeline')
      .select('*,perfis:usuario_id(nome)').eq('garantia_id', garantiaId)
      .order('created_at', { ascending: true })
    setTimeline((data ?? []) as unknown as GarantiaTimeline[])
    setLoadingTL(false)
  }, [supabase])

  const fetchRanking = useCallback(async () => {
    const { data: gars } = await supabase.from('garantias')
      .select('status,fornecedores_destino:fornecedor_destino_id(nome)')
      .not('fornecedor_destino_id', 'is', null)
    if (!gars) return
    const map: Record<string, { total: number; acionamentos: number }> = {}
    gars.forEach((g: any) => {
      const nome = g.fornecedores_destino?.nome ?? 'Desconhecido'
      if (!map[nome]) map[nome] = { total: 0, acionamentos: 0 }
      map[nome].total++
      if (['acionando_fornecedor','aguardando_fornecedor','peca_enviada','concluida'].includes(g.status)) map[nome].acionamentos++
    })
    const r = Object.entries(map).map(([nome, v]) => ({ nome, ...v, pct: v.total > 0 ? Math.round(v.acionamentos / v.total * 100) : 0 }))
    r.sort((a, b) => b.pct - a.pct)
    setRanking(r)
  }, [supabase])

  useEffect(() => { fetchFornecedores() }, [fetchFornecedores])
  useEffect(() => { if (aba === 'historico') fetchHistorico() }, [aba, fetchHistorico])
  useEffect(() => { if (aba === 'ranking') fetchRanking() }, [aba, fetchRanking])
  useEffect(() => { if (garantiaSel) fetchTimeline(garantiaSel.id) }, [garantiaSel, fetchTimeline])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) {
        setShowSugestoes(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Autocomplete: busca sugestões ao digitar
  function handleBuscaChange(val: string) {
    setBusca(val)
    setOsEncontrada(null)
    setOsBloqueada(null)
    setErroBusca('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const num = val.replace(/\D/g, '')
    if (num.length < 2) { setSugestoes([]); setShowSugestoes(false); return }
    debounceRef.current = setTimeout(async () => {
      const numInt = parseInt(num)
      const { data } = await supabase.from('ordens_servico')
        .select('id,numero,modelo,clientes(nome)')
        .gte('numero', numInt)
        .lte('numero', numInt * 10 + 9)
        .is('deleted_at', null)
        .order('numero')
        .limit(8)
      setSugestoes((data ?? []) as unknown as OSSugestao[])
      setShowSugestoes(true)
    }, 300)
  }

  async function selecionarSugestao(s: OSSugestao) {
    setShowSugestoes(false)
    setSugestoes([])
    setBusca(String(s.numero))
    await buscarOSPorId(s.id, s.numero)
  }

  async function buscarOS() {
    const num = busca.replace(/\D/g, '')
    if (!num) return
    setShowSugestoes(false)
    setBuscando(true); setErroBusca(''); setOsEncontrada(null); setOsBloqueada(null); setGarantiaSalva(null)
    const { data } = await supabase.from('ordens_servico')
      .select('*,clientes(nome,telefone)').eq('numero', parseInt(num)).is('deleted_at', null).single()
    if (!data) { setErroBusca(`OS #${num} não encontrada.`); setBuscando(false); return }
    aplicarResultadoOS(data as unknown as OSResult)
    setBuscando(false)
  }

  async function buscarOSPorId(id: string, numero: number) {
    setBuscando(true); setErroBusca(''); setOsEncontrada(null); setOsBloqueada(null); setGarantiaSalva(null)
    const { data } = await supabase.from('ordens_servico')
      .select('*,clientes(nome,telefone)').eq('id', id).single()
    if (!data) { setErroBusca(`OS #${numero} não encontrada.`); setBuscando(false); return }
    aplicarResultadoOS(data as unknown as OSResult)
    setBuscando(false)
  }

  // Tarefa 02: bloquear OS não entregue
  function aplicarResultadoOS(data: OSResult) {
    if (data.status !== 'entregue') {
      setOsBloqueada({ id: data.id, numero: data.numero, status: data.status })
      return
    }
    setOsEncontrada(data)
  }

  function diasDesde(dt: string) { return Math.floor((Date.now() - new Date(dt).getTime()) / (1000 * 60 * 60 * 24)) }
  function dentroPrazo(dt: string) { return diasDesde(dt) <= 90 }

  async function registrarGarantia() {
    if (!osEncontrada || !motivo.trim() || !acao) return
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: g } = await supabase.from('garantias').insert({
      os_origem_id: osEncontrada.id, status: acao,
      motivo_retorno: motivo.trim(), justificativa: justificativa || null,
      fornecedor_destino_id: fornecedorId || null,
      observacoes_fornecedor: obsForncedor || null,
      prazo_resposta_dias: 5,
    }).select(`*,
      os_origem:os_origem_id(numero,modelo,defeito_relatado,created_at),
      fornecedores_destino:fornecedor_destino_id(nome,telefone)
    `).single()

    if (g) {
      await supabase.from('garantia_timeline').insert({
        garantia_id: g.id, tipo: 'criada',
        descricao: `Garantia registrada — ${acao}. Motivo: ${motivo}`,
        status_novo: acao, usuario_id: user?.id,
      })
      if (acao === 'aprovada' || acao === 'parcial') {
        const { data: novaOS } = await supabase.from('ordens_servico').insert({
          modelo: osEncontrada.modelo, defeito_relatado: `[GARANTIA OS #${osEncontrada.numero}] ${motivo}`,
          status: 'aberta', valor_orcamento: acao === 'parcial' ? osEncontrada.valor_final : 0,
        }).select('id').single()
        if (novaOS) await supabase.from('garantias').update({ os_garantia_id: novaOS.id }).eq('id', g.id)
      }
      setGarantiaSalva(g as unknown as Garantia)
    }
    setSalvando(false)
    setOsEncontrada(null); setBusca(''); setMotivo(''); setAcao(''); setJustificativa(''); setFornecedorId(''); setObsFornecedor('')
  }

  function buildWAMsg(g: Garantia) {
    const forn = g.fornecedores_destino?.nome ?? ''
    const osNum = g.os_origem?.numero ?? ''
    const modelo = g.os_origem?.modelo ?? 'aparelho'
    const defeito = g.observacoes_fornecedor || g.motivo_retorno
    const dataCriacao = g.os_origem?.created_at ? new Date(g.os_origem.created_at).toLocaleDateString('pt-BR') : ''
    return waTemplate
      .replace(/{fornecedor}/g, forn).replace(/{os_numero}/g, String(osNum))
      .replace(/{data_compra}/g, dataCriacao).replace(/{peca}/g, modelo)
      .replace(/{modelo}/g, modelo).replace(/{defeito}/g, defeito)
  }

  async function acionarFornecedor(g: Garantia) {
    setWaModal({ garantia: g, mensagem: buildWAMsg(g) })
  }

  async function confirmarWA(g: Garantia, msg: string) {
    const forn = g.fornecedores_destino
    if (!forn?.telefone) return
    const { data: { user } } = await supabase.auth.getUser()
    window.open(`https://wa.me/55${forn.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    await supabase.from('garantias').update({ status: 'aguardando_fornecedor', fornecedor_notificado_em: new Date().toISOString() }).eq('id', g.id)
    await supabase.from('garantia_timeline').insert({ garantia_id: g.id, tipo: 'fornecedor_acionado', descricao: `Fornecedor ${forn.nome} notificado via WhatsApp.`, status_novo: 'aguardando_fornecedor', usuario_id: user?.id })
    setWaModal(null)
    if (garantiaSel?.id === g.id) { fetchTimeline(g.id); fetchHistorico() }
    else { fetchHistorico() }
  }

  async function mudarStatus(g: Garantia, novoStatus: string) {
    setMudandoStatus(true)
    const { data: { user } } = await supabase.auth.getUser()
    const updates: any = { status: novoStatus, updated_at: new Date().toISOString() }
    if (novoStatus === 'peca_enviada') updates.peca_enviada_em = new Date().toISOString()
    if (novoStatus === 'concluida') updates.concluida_em = new Date().toISOString()
    if (novoStatus === 'aguardando_fornecedor') updates.fornecedor_notificado_em = new Date().toISOString()
    await supabase.from('garantias').update(updates).eq('id', g.id)
    await supabase.from('garantia_timeline').insert({ garantia_id: g.id, tipo: 'status_alterado', descricao: `Status alterado para ${STATUS_CFG[novoStatus]?.label ?? novoStatus}.`, status_novo: novoStatus, usuario_id: user?.id })
    const updated = { ...garantiaSel, ...updates } as Garantia
    setGarantiaSel(updated)
    fetchTimeline(g.id); fetchHistorico()
    setMudandoStatus(false)
  }

  async function salvarObservacao(g: Garantia) {
    if (!novaObs.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('garantia_timeline').insert({ garantia_id: g.id, tipo: 'observacao', descricao: novaObs.trim(), usuario_id: user?.id })
    setNovaObs(''); fetchTimeline(g.id)
  }

  // Tarefa 03: templates de impressão por tamanho de papel
  function imprimirRecibo(g: Garantia) {
    const formato = cfgLoja.recibo_os_formato || 'a4'
    const nomeLoja = cfgLoja.loja_nome || 'SOS Celulares'
    const telLoja = cfgLoja.loja_telefone || ''
    const emailLoja = cfgLoja.loja_email || ''
    const endLoja = cfgLoja.loja_endereco || ''
    const cnpjLoja = cfgLoja.loja_cnpj || ''
    const garantiaDias = cfgLoja.garantia_dias || '90'

    const dataHoje = new Date().toLocaleDateString('pt-BR')
    const osNum = g.os_origem?.numero ?? '—'
    const modelo = g.os_origem?.modelo ?? '—'
    const defeito = g.os_origem?.defeito_relatado ?? '—'
    const cliente = g.clientes_origem ? (g.clientes_origem as any)?.clientes?.nome ?? (g.clientes_origem as any)?.nome ?? '—' : '—'
    const fornecedor = g.fornecedores_destino?.nome ?? '—'
    const statusLabel = STATUS_CFG[g.status]?.label ?? g.status

    let html = ''

    if (formato === '58mm') {
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo Garantia</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 9pt; width: 54mm; padding: 3mm 2mm; color: #000; background: #fff; }
  .c { text-align: center; } .b { font-weight: bold; }
  .nome { font-size: 12pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .sub { font-size: 7.5pt; text-align: center; color: #444; }
  .dashed { border-top: 1px dashed #000; margin: 2mm 0; }
  .solid { border-top: 1px solid #000; margin: 2mm 0; }
  .titulo { font-size: 7pt; text-transform: uppercase; font-weight: bold; color: #333; margin-bottom: 1mm; }
  .row { display: flex; justify-content: space-between; margin-bottom: 0.5mm; font-size: 8pt; }
  .row span:first-child { color: #555; } .row span:last-child { font-weight: bold; text-align: right; max-width: 32mm; }
  .footer { font-size: 6.5pt; text-align: center; color: #777; margin-top: 2mm; }
  .ass { border-top: 1px solid #000; margin-top: 8mm; margin-bottom: 1mm; }
</style></head><body>
<div class="nome">${nomeLoja}</div>
${endLoja ? `<div class="sub">${endLoja}</div>` : ''}
${telLoja ? `<div class="sub">${telLoja}</div>` : ''}
${cnpjLoja ? `<div class="sub">CNPJ: ${cnpjLoja}</div>` : ''}
<div class="solid"></div>
<div class="c" style="margin:2mm 0">
  <div class="sub" style="text-transform:uppercase">Recibo de Garantia</div>
  <div style="font-size:16pt;font-weight:bold">#${g.numero}</div>
  <div class="sub">${dataHoje}</div>
</div>
<div class="dashed"></div>
<div class="titulo">▸ OS de Origem</div>
<div class="row"><span>Nº da OS</span><span>#${osNum}</span></div>
<div class="row"><span>Modelo</span><span>${modelo}</span></div>
<div class="row"><span>Cliente</span><span>${cliente}</span></div>
<div class="dashed"></div>
<div class="titulo">▸ Garantia</div>
<div class="row"><span>Status</span><span>${statusLabel}</span></div>
<div class="row"><span>Fornecedor</span><span>${fornecedor}</span></div>
<div style="margin-top:1mm;font-size:8pt"><span style="color:#555">Motivo: </span>${g.motivo_retorno}</div>
<div class="dashed"></div>
<div style="font-size:7pt;line-height:1.6;color:#333">Garantia: <b>${garantiaDias} dias</b><br>Guarde este recibo.</div>
<div class="dashed"></div>
<div class="ass"></div>
<div class="footer" style="font-size:7pt;text-align:center;color:#555">Assinatura do recebedor</div>
<div class="footer" style="margin-top:3mm">${nomeLoja}</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
    } else if (formato === '80mm') {
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo Garantia</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 9.5pt; width: 76mm; padding: 3mm 3mm; color: #000; background: #fff; }
  .nome { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .sub { font-size: 8pt; text-align: center; color: #444; line-height: 1.6; }
  .dashed { border-top: 1px dashed #000; margin: 2.5mm 0; }
  .solid { border-top: 2px solid #000; margin: 2mm 0; }
  .badge { text-align: center; padding: 2mm 0; border: 1px solid #000; border-radius: 2mm; margin: 2mm 0; }
  .titulo { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 0.5mm; margin-bottom: 1.5mm; }
  .row { display: flex; justify-content: space-between; margin-bottom: 0.7mm; font-size: 8.5pt; }
  .row .l { color: #555; } .row .v { font-weight: bold; text-align: right; }
  .aviso { border: 1px solid #555; padding: 1.5mm 2mm; margin: 1mm 0; font-size: 8pt; line-height: 1.6; }
  .ass-line { display: flex; gap: 5mm; margin-top: 3mm; }
  .ass-box { flex: 1; } .ass-l { border-top: 1px solid #000; margin-bottom: 1mm; }
  .ass-label { font-size: 7pt; text-align: center; color: #555; }
  .footer { font-size: 6.5pt; text-align: center; color: #777; margin-top: 3mm; border-top: 1px dashed #ccc; padding-top: 1.5mm; }
</style></head><body>
<div class="nome">${nomeLoja}</div>
<div class="sub">${endLoja ? endLoja + '<br>' : ''}${telLoja}${emailLoja ? ' · ' + emailLoja : ''}${cnpjLoja ? '<br>CNPJ: ' + cnpjLoja : ''}</div>
<div class="solid"></div>
<div class="badge">
  <div style="font-size:7.5pt;text-transform:uppercase;color:#555">Recibo de Garantia</div>
  <div style="font-size:20pt;font-weight:bold">#${g.numero}</div>
  <div class="sub">${dataHoje}</div>
</div>
<div class="titulo">OS de Origem</div>
<div class="row"><span class="l">Nº da OS</span><span class="v">#${osNum}</span></div>
<div class="row"><span class="l">Modelo</span><span class="v">${modelo}</span></div>
<div class="row"><span class="l">Cliente</span><span class="v">${cliente}</span></div>
<div class="dashed"></div>
<div class="titulo">Defeito Relatado</div>
<div style="font-size:8.5pt;line-height:1.6;background:#f5f5f5;padding:1.5mm 2mm;border-left:2px solid #000;margin-bottom:1mm">${defeito}</div>
<div class="dashed"></div>
<div class="titulo">Garantia</div>
<div class="row"><span class="l">Nº Garantia</span><span class="v">#${g.numero}</span></div>
<div class="row"><span class="l">Status</span><span class="v">${statusLabel}</span></div>
<div class="row"><span class="l">Fornecedor</span><span class="v">${fornecedor}</span></div>
<div style="font-size:8.5pt;line-height:1.5;margin:1mm 0"><b>Motivo:</b> ${g.motivo_retorno}</div>
${g.justificativa ? `<div style="font-size:8pt;color:#555;font-style:italic">${g.justificativa}</div>` : ''}
<div class="aviso"><b>Garantia:</b> ${garantiaDias} dias · Guarde este recibo.</div>
<div class="ass-line">
  <div class="ass-box"><div style="height:18mm"></div><div class="ass-l"></div><div class="ass-label">Assinatura do recebedor</div></div>
  <div class="ass-box"><div style="height:18mm"></div><div class="ass-l"></div><div class="ass-label">Técnico responsável</div></div>
</div>
<div class="footer">${nomeLoja}${cnpjLoja ? ' · CNPJ ' + cnpjLoja : ''}</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
    } else {
      // A4 (padrão)
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo Garantia</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
  .loja-nome { font-size: 20pt; font-weight: bold; }
  .loja-sub { font-size: 9pt; color: #555; line-height: 1.7; margin-top: 4px; }
  .doc-titulo { text-align: right; }
  .doc-titulo h2 { font-size: 16pt; font-weight: bold; text-transform: uppercase; }
  .doc-titulo p { font-size: 10pt; color: #555; }
  .section { margin-bottom: 16px; }
  .section h3 { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 20px; }
  .field label { font-size: 8pt; color: #888; display: block; margin-bottom: 2px; text-transform: uppercase; }
  .field p { font-size: 10.5pt; font-weight: 500; }
  .motivo-box { background: #f9f9f9; border-left: 3px solid #333; padding: 10px 14px; font-size: 10.5pt; line-height: 1.7; margin-top: 4px; }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-weight: 600; font-size: 10pt; border: 1.5px solid #333; }
  .termos { font-size: 8.5pt; color: #555; line-height: 1.8; border: 1px solid #ddd; padding: 12px 14px; border-radius: 4px; }
  .ass-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 12px; }
  .ass-box { text-align: center; }
  .ass-line { border-top: 1px solid #000; margin-bottom: 6px; }
  .ass-label { font-size: 9pt; color: #555; }
  .footer { text-align: center; font-size: 8pt; color: #888; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #ccc; }
</style></head><body>
<div class="header">
  <div>
    <div class="loja-nome">${nomeLoja}</div>
    <div class="loja-sub">
      ${endLoja ? endLoja + '<br>' : ''}
      ${telLoja ? 'Tel: ' + telLoja : ''}${emailLoja ? ' · ' + emailLoja : ''}
      ${cnpjLoja ? '<br>CNPJ: ' + cnpjLoja : ''}
    </div>
  </div>
  <div class="doc-titulo">
    <h2>Recibo de Garantia</h2>
    <p>Nº <strong>#${g.numero}</strong></p>
    <p>Data: ${dataHoje}</p>
  </div>
</div>

<div class="section">
  <h3>OS de Origem</h3>
  <div class="grid3">
    <div class="field"><label>Nº da OS</label><p>#${osNum}</p></div>
    <div class="field"><label>Modelo do Aparelho</label><p>${modelo}</p></div>
    <div class="field"><label>Data da OS</label><p>${g.os_origem?.created_at ? new Date(g.os_origem.created_at).toLocaleDateString('pt-BR') : '—'}</p></div>
  </div>
  <div style="margin-top:8px" class="field"><label>Defeito Relatado</label><div class="motivo-box">${defeito}</div></div>
</div>

<div class="section">
  <h3>Dados do Cliente</h3>
  <div class="grid2">
    <div class="field"><label>Nome</label><p>${cliente}</p></div>
    <div class="field"><label>Fornecedor Destino</label><p>${fornecedor}</p></div>
  </div>
</div>

<div class="section">
  <h3>Detalhes da Garantia</h3>
  <div class="grid2" style="margin-bottom:10px">
    <div class="field"><label>Nº da Garantia</label><p>#${g.numero}</p></div>
    <div class="field"><label>Status</label><p><span class="status-badge">${statusLabel}</span></p></div>
  </div>
  <div class="field"><label>Motivo do Retorno</label><div class="motivo-box">${g.motivo_retorno}</div></div>
  ${g.justificativa ? `<div class="field" style="margin-top:8px"><label>Justificativa</label><div class="motivo-box" style="border-left-color:#888;background:#fff">${g.justificativa}</div></div>` : ''}
</div>

<div class="section">
  <h3>Termos de Garantia</h3>
  <div class="termos">
    A garantia cobre exclusivamente o serviço realizado e as peças substituídas, pelo prazo de <strong>${garantiaDias} dias</strong> a partir da data de entrega.
    Não estão cobertos danos causados por mau uso, quedas, líquidos, ou qualquer dano físico externo.
    A garantia é válida apenas mediante apresentação deste recibo.
    Em caso de necessidade, entre em contato com ${nomeLoja}${telLoja ? ' pelo telefone ' + telLoja : ''}.
  </div>
</div>

<div class="section">
  <h3>Assinaturas</h3>
  <div class="ass-grid">
    <div class="ass-box">
      <div style="height:40px"></div>
      <div class="ass-line"></div>
      <div class="ass-label">Assinatura do Cliente / Responsável</div>
      <div class="ass-label" style="margin-top:4px">${cliente}</div>
    </div>
    <div class="ass-box">
      <div style="height:40px"></div>
      <div class="ass-line"></div>
      <div class="ass-label">Técnico Responsável</div>
      <div class="ass-label" style="margin-top:4px">${nomeLoja}</div>
    </div>
  </div>
</div>

<div class="footer">${nomeLoja}${cnpjLoja ? ' · CNPJ ' + cnpjLoja : ''} · Documento gerado em ${dataHoje}</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) w.onload = () => URL.revokeObjectURL(url)
  }

  function exportCSV() {
    const rows = [['Nº','OS Origem','Status','Motivo','Fornecedor','Data']]
    garantias.forEach(g => rows.push([String(g.numero), String(g.os_origem?.numero ?? ''), g.status, g.motivo_retorno, g.fornecedores_destino?.nome ?? '—', new Date(g.created_at).toLocaleDateString('pt-BR')]))
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'garantias.csv'; a.click()
  }

  const prazo = osEncontrada ? diasDesde(osEncontrada.created_at) : 0
  const prazoOk = osEncontrada ? dentroPrazo(osEncontrada.created_at) : false

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Central de Garantias</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Registre retornos, acompanhe fornecedores e analise confiabilidade</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        {([['registrar','🔍 Registrar garantia'], ['historico','📋 Histórico'], ['ranking','📊 Ranking fornecedores']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: aba === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === k ? '#2563eb' : '#64748b', borderBottom: aba === k ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {/* ═══ REGISTRAR ═══ */}
      {aba === 'registrar' && (
        <div>
          {garantiaSalva && (
            <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>✅ Garantia #{garantiaSalva.numero} registrada!</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {garantiaSalva.fornecedores_destino && (
                  <button onClick={() => acionarFornecedor(garantiaSalva)} style={{ padding: '7px 14px', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#065f46', fontWeight: 500 }}>
                    💬 Enviar WhatsApp ao fornecedor
                  </button>
                )}
                <button onClick={() => imprimirRecibo(garantiaSalva)} style={{ padding: '7px 14px', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#065f46' }}>
                  🖨 Imprimir recibo
                </button>
                <button onClick={() => setGarantiaSalva(null)} style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                  Nova garantia
                </button>
              </div>
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>🔍 Buscar OS pelo número</p>
            {/* Tarefa 01: campo com autocomplete */}
            <div ref={buscaRef} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  style={{ ...inp, flex: 1, fontSize: 16 }}
                  value={busca}
                  onChange={e => handleBuscaChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') buscarOS(); if (e.key === 'Escape') setShowSugestoes(false) }}
                  onFocus={() => sugestoes.length > 0 && setShowSugestoes(true)}
                  placeholder="Digite o número da OS"
                  type="number"
                  autoComplete="off"
                />
                <button onClick={buscarOS} disabled={buscando} style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {buscando ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {/* Dropdown de sugestões */}
              {showSugestoes && sugestoes.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 60, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden', marginTop: 4 }}>
                  {sugestoes.map(s => (
                    <button
                      key={s.id}
                      onMouseDown={e => { e.preventDefault(); selecionarSugestao(s) }}
                      style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', minWidth: 48 }}>OS #{s.numero}</span>
                      <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{s.clientes?.nome ?? '—'}</span>
                      {s.modelo && <span style={{ fontSize: 12, color: '#94a3b8' }}>· {s.modelo}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {erroBusca && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>{erroBusca}</p>}

            {/* Tarefa 02: aviso de OS não entregue */}
            {osBloqueada && (
              <div style={{ marginTop: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                  ⚠ OS #{osBloqueada.numero} ainda não foi finalizada
                </p>
                <p style={{ fontSize: 13, color: '#78350f', marginBottom: 12 }}>
                  Esta OS está com status <strong>{STATUS_LABEL[osBloqueada.status] ?? osBloqueada.status}</strong>. Só é possível abrir uma garantia após a OS ser entregue ao cliente.
                </p>
                <button
                  onClick={() => router.push(`/os/${osBloqueada.id}`)}
                  style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Ir para a OS →
                </button>
              </div>
            )}
          </div>

          {osEncontrada && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>OS #{osEncontrada.numero}</h2>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 20, background: prazoOk ? '#ecfdf5' : '#fef2f2', color: prazoOk ? '#065f46' : '#991b1b' }}>
                        {prazoOk ? `✓ No prazo (${prazo} dias)` : `⚠ Fora do prazo (${prazo} dias)`}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b' }}>{osEncontrada.clientes?.nome ?? '—'} · {osEncontrada.modelo ?? '—'}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[{ label: 'Defeito original', value: osEncontrada.defeito_relatado }, { label: 'Solução aplicada', value: osEncontrada.solucao ?? 'Não registrada' }, { label: 'Valor cobrado', value: osEncontrada.valor_final ? `R$ ${osEncontrada.valor_final.toFixed(2).replace('.', ',')}` : '—' }].map(r => (
                    <div key={r.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{r.label}</p>
                      <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{r.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>📝 Registrar retorno em garantia</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div><label style={lbl}>Motivo do retorno *</label><textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="O que o cliente relatou..." /></div>
                  <div>
                    <label style={lbl}>Ação *</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {[
                        { v: 'aprovada',            icon: '✅', label: 'Aprovar garantia',   sub: 'Refazer sem custo',          color: '#065f46', bg: '#ecfdf5', border: '#bbf7d0' },
                        { v: 'parcial',             icon: '🔄', label: 'Garantia parcial',   sub: 'Cliente paga mão de obra',   color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
                        { v: 'negada',              icon: '❌', label: 'Negar garantia',     sub: 'Mal uso / dano externo',     color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
                        { v: 'acionando_fornecedor',icon: '🏭', label: 'Acionar fornecedor', sub: 'Defeito de fábrica da peça', color: '#6b21a8', bg: '#eff6ff', border: '#e9d5ff' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setAcao(opt.v as typeof acao)} style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${acao === opt.v ? opt.border : '#e2e8f0'}`, background: acao === opt.v ? opt.bg : '#fff' }}>
                          <div style={{ fontSize: 16, marginBottom: 3 }}>{opt.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: acao === opt.v ? opt.color : '#374151' }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{opt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {(acao === 'negada' || acao === 'parcial') && (
                    <div><label style={lbl}>Justificativa</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Detalhe o motivo..." /></div>
                  )}

                  {acao === 'acionando_fornecedor' && (
                    <div style={{ background: '#eff6ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '14px 16px' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#6b21a8', marginBottom: 12 }}>🏭 Destinar ao fornecedor</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <label style={lbl}>Fornecedor da peça *</label>
                          <select style={inp} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
                            <option value="">Selecione...</option>
                            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}{f.telefone ? ` — ${f.telefone}` : ''}</option>)}
                          </select>
                          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Este registro impacta o ranking de confiabilidade do fornecedor.</p>
                        </div>
                        <div><label style={lbl}>Observações para o fornecedor</label><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={obsForncedor} onChange={e => setObsFornecedor(e.target.value)} placeholder="Ex: Display apresentou defeito após 15 dias..." /></div>
                        {fornecedorId && <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#374151' }}>💬 Após salvar, você poderá enviar mensagem WhatsApp ao fornecedor com os detalhes da peça e do defeito.</div>}
                      </div>
                    </div>
                  )}

                  <button onClick={registrarGarantia} disabled={salvando || !motivo.trim() || !acao || (acao === 'acionando_fornecedor' && !fornecedorId)} style={{ padding: '12px', background: !motivo.trim() || !acao || (acao === 'acionando_fornecedor' && !fornecedorId) ? '#e2e8f0' : salvando ? '#93c5fd' : '#2563eb', color: !motivo.trim() || !acao ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    {salvando ? 'Registrando...' : 'Registrar garantia'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ HISTÓRICO ═══ */}
      {aba === 'historico' && (
        <div style={{ display: 'grid', gridTemplateColumns: garantiaSel ? '1fr 380px' : '1fr', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input placeholder="Buscar por motivo..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1, minWidth: 160, background: '#f8fafc' }} />
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
                <option value="todos">Todos os status</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              <button onClick={exportCSV} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', cursor: 'pointer', color: '#374151' }}>⬇ CSV</button>
            </div>

            {loadingHist ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div> :
              garantias.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 40, marginBottom: 12 }}>🛡</div><p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhuma garantia registrada</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {garantias.map(g => {
                    const st = STATUS_CFG[g.status] ?? STATUS_CFG.aberta
                    const atrasada = g.status === 'aguardando_fornecedor' && g.fornecedor_notificado_em && diasDesde(g.fornecedor_notificado_em) > (g.prazo_resposta_dias ?? 5)
                    return (
                      <div key={g.id} onClick={() => setGarantiaSel(garantiaSel?.id === g.id ? null : g)} style={{ background: garantiaSel?.id === g.id ? '#eff6ff' : '#fff', border: `1px solid ${garantiaSel?.id === g.id ? '#c4b5fd' : atrasada ? '#fecaca' : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#2563eb', fontSize: 13 }}>#{g.numero}</span>
                              {g.os_origem && <span style={{ fontWeight: 500, color: '#374151', fontSize: 13 }}>OS #{g.os_origem.numero}</span>}
                              <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.icon} {st.label}</span>
                              {atrasada && <span style={{ fontSize: 11, fontWeight: 500, background: '#fef2f2', color: '#991b1b', padding: '1px 8px', borderRadius: 20 }}>⚠ Fornecedor atrasado</span>}
                            </div>
                            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{g.os_origem?.modelo ?? '—'} · {g.motivo_retorno.slice(0, 60)}{g.motivo_retorno.length > 60 ? '...' : ''}</p>
                            {g.fornecedores_destino && <p style={{ fontSize: 11, color: '#94a3b8' }}>🏭 {g.fornecedores_destino.nome}</p>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                            <p style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(g.created_at).toLocaleDateString('pt-BR')}</p>
                            <p style={{ fontSize: 11, color: '#2563eb', marginTop: 4 }}>ver detalhes →</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>

          {garantiaSel && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', height: 'fit-content', position: 'sticky', top: 16 }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Garantia #{garantiaSel.numero}</p>
                <button onClick={() => setGarantiaSel(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
              </div>

              <div style={{ padding: '14px 18px', maxHeight: '80vh', overflowY: 'auto' }}>
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Status atual</p>
                  <span style={{ fontSize: 13, fontWeight: 500, padding: '4px 12px', borderRadius: 20, background: STATUS_CFG[garantiaSel.status]?.bg, color: STATUS_CFG[garantiaSel.status]?.color }}>
                    {STATUS_CFG[garantiaSel.status]?.icon} {STATUS_CFG[garantiaSel.status]?.label}
                  </span>
                </div>

                {PROXIMOS_STATUS[garantiaSel.status] && PROXIMOS_STATUS[garantiaSel.status].length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Ações</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {garantiaSel.fornecedores_destino?.telefone && (garantiaSel.status === 'acionando_fornecedor' || garantiaSel.status === 'aberta') && (
                        <button onClick={() => acionarFornecedor(garantiaSel)} style={{ padding: '9px 14px', border: '1px solid #e9d5ff', borderRadius: 8, fontSize: 13, background: '#eff6ff', cursor: 'pointer', color: '#6b21a8', fontWeight: 500, textAlign: 'left' }}>
                          💬 Enviar WhatsApp ao fornecedor
                        </button>
                      )}
                      <button onClick={() => imprimirRecibo(garantiaSel)} style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151', textAlign: 'left' }}>
                        🖨 Imprimir recibo de devolução
                      </button>
                      {PROXIMOS_STATUS[garantiaSel.status].map(novoSt => (
                        <button key={novoSt} onClick={() => mudarStatus(garantiaSel, novoSt)} disabled={mudandoStatus} style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: STATUS_CFG[novoSt]?.bg ?? '#fff', cursor: 'pointer', color: STATUS_CFG[novoSt]?.color ?? '#374151', fontWeight: 500, textAlign: 'left' }}>
                          → {STATUS_CFG[novoSt]?.icon} {STATUS_CFG[novoSt]?.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Detalhes</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    {[
                      { l: 'OS origem', v: `#${garantiaSel.os_origem?.numero}` },
                      { l: 'Modelo', v: garantiaSel.os_origem?.modelo ?? '—' },
                      { l: 'Defeito', v: garantiaSel.os_origem?.defeito_relatado?.slice(0, 80) ?? '—' },
                      { l: 'Motivo retorno', v: garantiaSel.motivo_retorno },
                      { l: 'Fornecedor', v: garantiaSel.fornecedores_destino?.nome ?? '—' },
                    ].map(d => (
                      <div key={d.l} style={{ display: 'flex', gap: 8 }}>
                        <span style={{ color: '#94a3b8', minWidth: 90 }}>{d.l}</span>
                        <span style={{ color: '#374151', flex: 1 }}>{d.v}</span>
                      </div>
                    ))}
                    {garantiaSel.fornecedor_notificado_em && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ color: '#94a3b8', minWidth: 90 }}>Notificado em</span>
                        <span style={{ color: '#374151' }}>{new Date(garantiaSel.fornecedor_notificado_em).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Linha do tempo</p>
                  {loadingTL ? <p style={{ fontSize: 12, color: '#94a3b8' }}>Carregando...</p> :
                    timeline.length === 0 ? <p style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum evento registrado.</p> :
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {timeline.map((t, i) => (
                        <div key={t.id} style={{ display: 'flex', gap: 10, paddingBottom: i < timeline.length - 1 ? 12 : 0 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                              {TIMELINE_ICON[t.tipo] ?? '•'}
                            </div>
                            {i < timeline.length - 1 && <div style={{ width: 1, flex: 1, background: '#e2e8f0', marginTop: 4 }} />}
                          </div>
                          <div style={{ flex: 1, paddingTop: 2, paddingBottom: 8 }}>
                            <p style={{ fontSize: 12, color: '#374151', fontWeight: 500, marginBottom: 2 }}>{t.descricao}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8' }}>{(t.perfis as any)?.nome ?? 'Sistema'} · {new Date(t.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                </div>

                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Adicionar observação</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...inp, flex: 1, fontSize: 12 }} value={novaObs} onChange={e => setNovaObs(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarObservacao(garantiaSel)} placeholder="Anotação interna..." />
                    <button onClick={() => salvarObservacao(garantiaSel)} disabled={!novaObs.trim()} style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ RANKING ═══ */}
      {aba === 'ranking' && (
        <div>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Porcentagem de garantias acionadas por fornecedor — quanto menor, mais confiável.</p>
          {ranking.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 40, marginBottom: 12 }}>📊</div><p style={{ fontSize: 14, color: '#374151' }}>Nenhum dado de ranking disponível ainda.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ranking.map((r, i) => (
                <div key={r.nome} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: i === 0 ? '#fef2f2' : i === 1 ? '#fef3c7' : '#ecfdf5', color: i === 0 ? '#991b1b' : i === 1 ? '#92400e' : '#065f46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {i + 1}º
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{r.nome}</p>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                        <span style={{ color: '#64748b' }}>{r.total} garantias</span>
                        <span style={{ color: r.pct >= 30 ? '#991b1b' : r.pct >= 15 ? '#92400e' : '#065f46', fontWeight: 600 }}>{r.pct}% acionadas</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${r.pct}%`, background: r.pct >= 30 ? '#ef4444' : r.pct >= 15 ? '#f59e0b' : '#10b981', borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal WhatsApp fornecedor */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>💬 Mensagem ao fornecedor</h3>
              <button onClick={() => setWaModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                Para: <strong style={{ color: '#0f172a' }}>{waModal.garantia.fornecedores_destino?.nome}</strong>
                {waModal.garantia.fornecedores_destino?.telefone && <span style={{ marginLeft: 8, color: '#94a3b8' }}>{waModal.garantia.fornecedores_destino.telefone}</span>}
              </p>
              <textarea value={waModal.mensagem} onChange={e => setWaModal({ ...waModal, mensagem: e.target.value })} style={{ ...inp, minHeight: 200, resize: 'vertical', lineHeight: 1.7, marginBottom: 14 }} />
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Você pode editar a mensagem antes de enviar. Ao confirmar, o WhatsApp abre e o status muda para "Aguardando resposta".</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setWaModal(null)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                <button onClick={() => confirmarWA(waModal.garantia, waModal.mensagem)} style={{ flex: 2, padding: '9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  💬 Enviar e registrar ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
