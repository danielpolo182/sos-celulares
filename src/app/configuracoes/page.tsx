'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarCNPJ, formatarCPF, formatarTelefone, validarCNPJ, validarCPF, validarTelefone } from '@/lib/validators'

// ─── Tipos ────────────────────────────────────────────────
type WaConfig = {
  phone_number_id: string | null
  access_token: string | null
  verify_token: string
  bot_ativo: boolean
  bot_prompt: string
}

type Config = {
  id: string; chave: string; valor: string
  descricao: string | null; categoria: string; versao: number
}
type Qualidade = { id: string; nome: string; cor_hex: string; ordem: number; ativo: boolean }
type NumeracaoConfig = {
  id: string; modulo: string; prefixo: string
  usar_ano: boolean; usar_mes: boolean
  sequencial: number; digitos: number; sufixo: string; reinicio: string
}
type Historico = {
  id: string; chave: string
  valor_anterior: string | null; valor_novo: string
  versao: number; alterado_em: string
  perfis: { nome: string } | null
}

type PixConfig = { mp_access_token: string; mp_webhook_secret: string; ativo: boolean }

// ─── Menu lateral com categorias ──────────────────────────
const MENU_GRUPOS = [
  {
    label: 'Loja',
    items: [
      { key: 'loja',        icon: '🏪', label: 'Dados da loja' },
      { key: 'marca',       icon: '🎨', label: 'Marca & Logo' },
      { key: 'impressao',   icon: '🖨', label: 'Impressão' },
      { key: 'assinatura',  icon: '✍️', label: 'Assinatura digital' },
      { key: 'qualidades',  icon: '🏷',  label: 'Qualidades de peças' },
      { key: 'numeracao',   icon: '🔢', label: 'Numeração' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { key: 'formas_pgto', icon: '💳', label: 'Formas de pagamento' },
      { key: 'pdv_cfg',     icon: '🖥', label: 'PDV' },
      { key: 'rotinas_cfg', icon: '✅', label: 'Rotinas' },
      { key: 'alertas',     icon: '🔔', label: 'Alertas' },
      { key: 'operacional', icon: '⚙️', label: 'Parâmetros' },
    ],
  },
  {
    label: 'Integrações',
    items: [
      { key: 'whatsapp',        icon: '💬', label: 'WhatsApp API' },
      { key: 'pix',             icon: '📱', label: 'PIX / Mercado Pago' },
      { key: 'banco_aparelhos', icon: '📲', label: 'Banco de aparelhos' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'usuarios',   icon: '👥', label: 'Usuários' },
      { key: 'permissoes', icon: '🔐', label: 'Permissões' },
      { key: 'plano',      icon: '💎', label: 'Meu plano' },
      { key: 'historico',  icon: '📜', label: 'Histórico' },
    ],
  },
]

// flat list para compatibilidade com activeMenu
const MENU = MENU_GRUPOS.flatMap(g => g.items)

const MARCAS_SCRAPING = [
  { slug: 'samsung',  label: 'Samsung',  icon: '🔷' },
  { slug: 'motorola', label: 'Motorola', icon: '〽️' },
  { slug: 'xiaomi',   label: 'Xiaomi',   icon: '🟠' },
  { slug: 'apple',    label: 'Apple',    icon: '🍎' },
  { slug: 'realme',   label: 'Realme',   icon: '🟡' },
  { slug: 'asus',     label: 'Asus',     icon: '🔵' },
  { slug: 'nokia',    label: 'Nokia',    icon: '📞' },
  { slug: 'tcl',      label: 'TCL',      icon: '🔴' },
  { slug: 'positivo', label: 'Positivo', icon: '🟢' },
  { slug: 'infinix',  label: 'Infinix',  icon: '⚡' },
]

const CARGOS = ['admin', 'gerente', 'tecnico', 'atendente', 'caixa'] as const
type Cargo = typeof CARGOS[number]

const CARGOS_LOCKED: Cargo[] = ['admin', 'gerente']

const CARGO_LABEL_CFG: Record<string, string> = {
  admin: 'Administrador', gerente: 'Gerente', tecnico: 'Técnico', atendente: 'Atendente', caixa: 'Caixa',
}

const MODULOS_PERM: { key: string; label: string; icon: string }[] = [
  { key: 'dashboard',    label: 'Dashboard',         icon: '📊' },
  { key: 'os',           label: 'Ordens de Serviço', icon: '🔧' },
  { key: 'clientes',     label: 'Clientes',           icon: '👥' },
  { key: 'crm',          label: 'CRM',                icon: '📣' },
  { key: 'pdv',          label: 'PDV / Vendas',       icon: '💳' },
  { key: 'estoque',      label: 'Estoque',            icon: '📦' },
  { key: 'compras',      label: 'Lista de compras',   icon: '🛒' },
  { key: 'contratos',    label: 'Contratos',          icon: '📄' },
  { key: 'aparelhos',    label: 'Compra & Venda',     icon: '📱' },
  { key: 'relatorios',   label: 'Relatórios',         icon: '📈' },
  { key: 'fechamento',   label: 'Fechamento',         icon: '🔒' },
  { key: 'rotinas',      label: 'Rotinas',            icon: '✅' },
  { key: 'configuracoes',label: 'Configurações',      icon: '⚙️' },
]

type PermissaoCargo = { id: string; cargo: string; modulo: string; permitido: boolean }
type UsuarioPerfil = { id: string; nome: string; email: string | null; papel: string; ativo: boolean; created_at: string }

type FormaPgto = {
  key: string; label: string; icone: string
  taxa_pct: number; taxa_fixa: number; ativo: boolean
  parcelavel: boolean; max_parcelas: number
  // taxas individuais por nº de parcelas: { "2": 3.0, "3": 4.0, ... }
  taxas_parcelas?: Record<string, number>
}

// Taxa padrão por parcela para cartão crédito (padrão brasileiro do mercado)
const DEFAULT_TAXAS_PARCELA: Record<string, number> = {
  '2': 3.0, '3': 4.0, '4': 5.0, '5': 6.0, '6': 7.0,
  '7': 8.0, '8': 9.0, '9': 10.0, '10': 11.0, '11': 12.0, '12': 13.0,
}

const FORMAS_PADRAO: FormaPgto[] = [
  { key: 'dinheiro',        label: 'Dinheiro',              icone: '💵', taxa_pct: 0,   taxa_fixa: 0, ativo: true,  parcelavel: false, max_parcelas: 1 },
  { key: 'pix',             label: 'PIX',                   icone: '📱', taxa_pct: 0,   taxa_fixa: 0, ativo: true,  parcelavel: false, max_parcelas: 1 },
  { key: 'debito',          label: 'Cartão Débito',         icone: '💳', taxa_pct: 1.5, taxa_fixa: 0, ativo: true,  parcelavel: false, max_parcelas: 1 },
  { key: 'credito_avista',  label: 'Cartão Crédito à vista',icone: '💳', taxa_pct: 2.5, taxa_fixa: 0, ativo: true,  parcelavel: false, max_parcelas: 1 },
  { key: 'credito_parcela', label: 'Cartão Crédito Parc.',  icone: '💳', taxa_pct: 0,   taxa_fixa: 0, ativo: true,  parcelavel: true,  max_parcelas: 12, taxas_parcelas: DEFAULT_TAXAS_PARCELA },
  { key: 'transferencia',   label: 'Transferência',         icone: '🏦', taxa_pct: 0,   taxa_fixa: 0, ativo: true,  parcelavel: false, max_parcelas: 1 },
  { key: 'cheque',          label: 'Cheque',                icone: '📝', taxa_pct: 0,   taxa_fixa: 0, ativo: false, parcelavel: false, max_parcelas: 1 },
  { key: 'crediario',       label: 'Crediário próprio',     icone: '📋', taxa_pct: 0,   taxa_fixa: 0, ativo: false, parcelavel: true,  max_parcelas: 6,
    taxas_parcelas: { '2': 5.0, '3': 7.0, '4': 9.0, '5': 11.0, '6': 13.0 } },
]

// ─── Estilos base ─────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #e2e8f0', borderRadius: 7,
  fontSize: 13, color: '#1e293b', background: '#fff',
  outline: 'none', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: '#64748b', marginBottom: 4,
  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
}
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 12, padding: '20px 24px', marginBottom: 14,
}
const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#374151',
  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9',
}

const MODULOS_NUM: Record<string, string> = {
  os: 'OS', venda: 'Venda', orcamento: 'Orçamento',
  cliente: 'Cliente', produto: 'Produto', fornecedor: 'Fornecedor',
}
const CORES_PADRAO = ['#065f46','#1d4ed8','#92400e','#991b1b','#6b21a8','#0369a1','#374151','#b45309','#166534','#7c2d12']
const WA_VARS = ['{nome}','{modelo}','{numero}','{valor}','{dias}','{defeito}']
const WA_PREVIEW: Record<string,string> = { '{nome}':'João', '{modelo}':'Samsung A32', '{numero}':'42', '{valor}':'180,00', '{dias}':'95', '{defeito}':'Tela quebrada' }
const CONFIG_LABELS: Record<string, string> = {
  'compras_periodo_dias': 'Período padrão da lista de compras',
}

// ─── Componente principal ─────────────────────────────────
export default function ConfiguracoesPage() {
  const supabase = createClient()
  const [acesso, setAcesso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState('loja')

  // Dados
  const [configs, setConfigs] = useState<Config[]>([])
  const [qualidades, setQualidades] = useState<Qualidade[]>([])
  const [numeracoes, setNumeracoes] = useState<NumeracaoConfig[]>([])
  const [historico, setHistorico] = useState<Historico[]>([])
  const [logoUrl, setLogoUrl] = useState('')

  // Estado de edição de configs
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  // Qualidades
  const [qEditId, setQEditId] = useState<string | null>(null)
  const [qNome, setQNome] = useState('')
  const [qCor, setQCor] = useState('#2563eb')
  const [qSaving, setQSaving] = useState(false)

  // Assinatura
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [assDrawing, setAssDrawing] = useState(false)
  const [assAtual, setAssAtual] = useState('')
  const [assNova, setAssNova] = useState('')
  const [assSaving, setAssSaving] = useState(false)
  const [assSaved, setAssSaved] = useState(false)

  // Usuários
  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([])
  const [uModal, setUModal] = useState(false)
  const [uEditId, setUEditId] = useState<string | null>(null)
  const [uNome, setUNome] = useState('')
  const [uEmail, setUEmail] = useState('')
  const [uPapel, setUPapel] = useState<Cargo>('tecnico')
  const [uAtivo, setUAtivo] = useState(true)
  const [uSaving, setUSaving] = useState(false)

  // Permissões
  const [permissoes, setPermissoes] = useState<PermissaoCargo[]>([])
  const [permSaving, setPermSaving] = useState(false)

  // Formas de pagamento
  const [formasPgto, setFormasPgto] = useState<FormaPgto[]>(FORMAS_PADRAO)
  const [formasSaving, setFormasSaving] = useState(false)
  const [formasSaved, setFormasSaved] = useState(false)
  const [waConfig, setWaConfig] = useState<WaConfig | null>(null)
  const [waSaving, setWaSaving] = useState(false)
  const [waMsg, setWaMsg] = useState('')

  // Banco de aparelhos — scraping por marca
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [marcaLoading, setMarcaLoading] = useState<string | null>(null)
  const [marcaResultados, setMarcaResultados] = useState<Record<string, { novos: number; jaExistiam: number; erro?: string }>>({})

  // PIX
  const [pixConfig, setPixConfig] = useState<PixConfig>({ mp_access_token: '', mp_webhook_secret: '', ativo: false })
  const [pixSaving, setPixSaving] = useState(false)
  const [pixMsg, setPixMsg] = useState('')
  const [pixShowToken, setPixShowToken] = useState(false)
  const [pixShowSecret, setPixShowSecret] = useState(false)
  const [pixManualOpen, setPixManualOpen] = useState(false)

  // ── Fetch ────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserEmail(user.email ?? null)
      const { data: p } = await supabase.from('perfis').select('papel').eq('id', user.id).single()
      setAcesso(!p || ['admin','gerente'].includes(p?.papel))
      // Assinatura atual
      const { data: ass } = await supabase.from('usuario_assinaturas').select('assinatura').eq('usuario_id', user.id).maybeSingle()
      if (ass?.assinatura) setAssAtual(ass.assinatura)
    } else {
      setAcesso(true)
    }
    const [{ data: c }, { data: q }, { data: n }] = await Promise.all([
      supabase.from('sistema_config').select('*').order('categoria').order('chave'),
      supabase.from('produto_qualidades').select('*').order('ordem'),
      supabase.from('numeracao_config').select('*').order('modulo'),
    ])
    setConfigs((c ?? []) as Config[])
    setQualidades((q ?? []) as Qualidade[])
    setNumeracoes((n ?? []) as NumeracaoConfig[])
    const { data: waCfg } = await supabase
      .from('wa_config')
      .select('phone_number_id, access_token, verify_token, bot_ativo, bot_prompt')
      .single()
    if (waCfg) setWaConfig(waCfg as WaConfig)
    const { data: pixCfg } = await supabase
      .from('pix_config')
      .select('mp_access_token, mp_webhook_secret, ativo')
      .single()
    if (pixCfg) setPixConfig({
      mp_access_token: pixCfg.mp_access_token ?? '',
      mp_webhook_secret: pixCfg.mp_webhook_secret ?? '',
      ativo: pixCfg.ativo ?? false,
    })
    setLoading(false)
  }, [supabase])

  const fetchHistorico = useCallback(async () => {
    const { data } = await supabase
      .from('config_historico')
      .select('*,perfis:usuario_id(nome)')
      .order('alterado_em', { ascending: false })
      .limit(50)
    setHistorico((data ?? []) as unknown as Historico[])
  }, [supabase])

  const fetchUsuarios = useCallback(async () => {
    const { data } = await supabase.from('perfis').select('id,nome,email,papel,ativo,created_at').order('nome')
    setUsuarios((data ?? []) as UsuarioPerfil[])
  }, [supabase])

  const fetchPermissoes = useCallback(async () => {
    const { data } = await supabase.from('permissoes_cargo').select('*')
    setPermissoes((data ?? []) as PermissaoCargo[])
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Lê ?menu= da URL no lado do cliente para evitar Suspense no build
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('menu')
    if (m) setActiveMenu(m)
  }, [])
  useEffect(() => { if (activeMenu === 'historico') fetchHistorico() }, [activeMenu, fetchHistorico])
  useEffect(() => { if (activeMenu === 'usuarios') fetchUsuarios() }, [activeMenu, fetchUsuarios])
  useEffect(() => { if (activeMenu === 'permissoes') fetchPermissoes() }, [activeMenu, fetchPermissoes])
  useEffect(() => {
    if (activeMenu === 'formas_pgto') {
      supabase.from('sistema_config').select('valor').eq('chave', 'formas_pgto_taxas').maybeSingle().then(({ data }) => {
        if (data?.valor) {
          try { setFormasPgto(JSON.parse(data.valor)) } catch {}
        }
      })
    }
  }, [activeMenu, supabase])

  useEffect(() => {
    if (activeMenu === 'operacional') {
      // Garante que a config compras_periodo_dias existe com default '60'
      const existing = configs.find(c => c.chave === 'compras_periodo_dias')
      if (!existing) {
        supabase.from('sistema_config').upsert({
          chave: 'compras_periodo_dias',
          valor: '60',
          categoria: 'compras',
          descricao: 'Período padrão da lista de compras em dias',
          escopo: 'global',
        }, { onConflict: 'chave' }).then(() => fetchAll())
      }
    }
  }, [activeMenu, configs, supabase, fetchAll])

  // ── Usuários ─────────────────────────────────────────────
  function abrirUModal(u?: UsuarioPerfil) {
    if (u) { setUEditId(u.id); setUNome(u.nome); setUEmail(u.email ?? ''); setUPapel(u.papel as Cargo); setUAtivo(u.ativo) }
    else { setUEditId(null); setUNome(''); setUEmail(''); setUPapel('tecnico'); setUAtivo(true) }
    setUModal(true)
  }

  async function salvarWaConfig() {
    if (!waConfig) return
    setWaSaving(true); setWaMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setWaSaving(false); return }
    const { data: perfil } = await supabase.from('perfis').select('filial_id').eq('id', user.id).single()
    if (!perfil?.filial_id) { setWaMsg('❌ Filial não encontrada'); setWaSaving(false); return }
    const { error } = await supabase.from('wa_config').upsert({
      filial_id: perfil.filial_id,
      phone_number_id: waConfig.phone_number_id || null,
      access_token: waConfig.access_token || null,
      verify_token: waConfig.verify_token,
      bot_ativo: waConfig.bot_ativo,
      bot_prompt: waConfig.bot_prompt,
    })
    setWaMsg(error ? '❌ Erro ao salvar' : '✅ Configurações salvas!')
    setWaSaving(false)
  }

  async function salvarPixConfig() {
    setPixSaving(true)
    setPixMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setPixMsg('❌ Não autenticado'); setPixSaving(false); return }
    const { data: perfil } = await supabase.from('perfis').select('filial_id, papel').eq('id', user.id).single()
    if (!perfil?.filial_id) { setPixMsg('❌ Filial não encontrada'); setPixSaving(false); return }
    if (!['admin', 'gerente'].includes(perfil.papel)) { setPixMsg('❌ Apenas admin ou gerente podem alterar'); setPixSaving(false); return }
    const { error } = await supabase.from('pix_config').upsert({
      filial_id: perfil.filial_id,
      mp_access_token: pixConfig.mp_access_token || null,
      mp_webhook_secret: pixConfig.mp_webhook_secret || null,
      ativo: pixConfig.ativo,
    }, { onConflict: 'filial_id' })
    if (error) setPixMsg('❌ Erro ao salvar: ' + error.message)
    else setPixMsg('✅ Configurações PIX salvas!')
    setPixSaving(false)
  }

  async function salvarFormasPgto() {
    setFormasSaving(true); setFormasSaved(false)
    // Tentar update primeiro; se não existir, insert
    const { data: existente } = await supabase
      .from('sistema_config').select('id').eq('chave', 'formas_pgto_taxas').maybeSingle()
    if (existente) {
      await supabase.from('sistema_config')
        .update({ valor: JSON.stringify(formasPgto) })
        .eq('id', existente.id)
    } else {
      await supabase.from('sistema_config').insert({
        chave: 'formas_pgto_taxas', valor: JSON.stringify(formasPgto),
        categoria: 'financeiro', descricao: 'Taxas por forma de pagamento', escopo: 'global',
      })
    }
    setFormasSaving(false); setFormasSaved(true)
    setTimeout(() => setFormasSaved(false), 2000)
  }

  function updateForma(key: string, field: keyof FormaPgto, value: unknown) {
    setFormasPgto(prev => prev.map(f => f.key === key ? { ...f, [field]: value } : f))
  }

  function updateTaxaParcela(key: string, parcelas: number, taxa: number) {
    setFormasPgto(prev => prev.map(f => {
      if (f.key !== key) return f
      const tp = { ...(f.taxas_parcelas ?? {}), [String(parcelas)]: taxa }
      return { ...f, taxas_parcelas: tp }
    }))
  }

  // Garante que taxas_parcelas cobre todas as parcelas até max_parcelas
  function ensureTaxasParcelas(f: FormaPgto): Record<string, number> {
    const tp = { ...(f.taxas_parcelas ?? {}) }
    for (let i = 2; i <= f.max_parcelas; i++) {
      if (tp[String(i)] === undefined) tp[String(i)] = f.taxa_pct || 0
    }
    return tp
  }

  async function salvarUsuario() {
    if (!uNome.trim()) return
    setUSaving(true)
    if (uEditId) {
      await supabase.from('perfis').update({ nome: uNome, papel: uPapel, ativo: uAtivo }).eq('id', uEditId)
    } else {
      // Novo usuário: apenas inserir no perfis (o auth precisa ser criado via Supabase Dashboard ou invite)
      await supabase.from('perfis').insert({ nome: uNome, email: uEmail, papel: uPapel, ativo: uAtivo })
    }
    setUSaving(false); setUModal(false); fetchUsuarios()
  }

  async function toggleUsuarioAtivo(u: UsuarioPerfil) {
    if (CARGOS_LOCKED.includes(u.papel as Cargo)) return
    await supabase.from('perfis').update({ ativo: !u.ativo }).eq('id', u.id)
    fetchUsuarios()
  }

  // ── Permissões ───────────────────────────────────────────
  function getPermitido(cargo: string, modulo: string): boolean {
    if (CARGOS_LOCKED.includes(cargo as Cargo)) return true
    const perm = permissoes.find(p => p.cargo === cargo && p.modulo === modulo)
    return perm ? perm.permitido : true // default: permitido
  }

  async function togglePermissao(cargo: string, modulo: string) {
    if (CARGOS_LOCKED.includes(cargo as Cargo)) return
    setPermSaving(true)
    const atual = getPermitido(cargo, modulo)
    const existing = permissoes.find(p => p.cargo === cargo && p.modulo === modulo)
    if (existing) {
      await supabase.from('permissoes_cargo').update({ permitido: !atual }).eq('id', existing.id)
    } else {
      await supabase.from('permissoes_cargo').insert({ cargo, modulo, permitido: !atual })
    }
    setPermSaving(false)
    fetchPermissoes()
  }

  // ── Helpers de config ────────────────────────────────────
  function getConfig(chave: string) {
    return configs.find(c => c.chave === chave)
  }
  function getVal(chave: string) {
    const c = getConfig(chave)
    if (!c) return ''
    return editando[c.id] !== undefined ? editando[c.id] : c.valor
  }
  function isModified(chave: string) {
    const c = getConfig(chave)
    return c && editando[c.id] !== undefined && editando[c.id] !== c.valor
  }
  function onEdit(chave: string, val: string) {
    const c = getConfig(chave)
    if (c) setEditando(e => ({ ...e, [c.id]: val }))
  }
  function cancelEdit(chave: string) {
    const c = getConfig(chave)
    if (c) setEditando(e => { const n = { ...e }; delete n[c.id]; return n })
  }
  async function salvarConfig(chave: string) {
    const c = getConfig(chave); if (!c) return
    setSaving(chave)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('sistema_config')
      .update({ valor: editando[c.id], atualizado_por: user?.id })
      .eq('id', c.id)
    setSaving(null); setSaved(chave)
    setTimeout(() => setSaved(null), 2000)
    fetchAll()
  }

  // ── Reverter histórico ───────────────────────────────────
  async function reverterConfig(h: Historico) {
    if (!h.valor_anterior) return
    const { data: cfg } = await supabase
      .from('sistema_config').select('id')
      .eq('chave', h.chave).eq('escopo', 'global').single()
    if (!cfg) return
    await supabase.from('sistema_config')
      .update({ valor: h.valor_anterior })
      .eq('id', cfg.id)
    fetchAll(); fetchHistorico()
  }

  // ── Scraping por marca ───────────────────────────────────
  async function scraperMarca(slug: string) {
    setMarcaLoading(slug)
    try {
      const res = await fetch('/api/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marca: slug }),
      })
      const data = await res.json() as { novos?: number; jaExistiam?: number; erros?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido')
      setMarcaResultados(prev => ({
        ...prev,
        [slug]: { novos: data.novos ?? 0, jaExistiam: data.jaExistiam ?? 0 },
      }))
    } catch (err) {
      setMarcaResultados(prev => ({
        ...prev,
        [slug]: { novos: 0, jaExistiam: 0, erro: String(err) },
      }))
    } finally {
      setMarcaLoading(null)
    }
  }

  // ── Qualidades ───────────────────────────────────────────
  async function salvarQualidade() {
    if (!qNome.trim()) return
    setQSaving(true)
    if (qEditId) {
      await supabase.from('produto_qualidades').update({ nome: qNome, cor_hex: qCor }).eq('id', qEditId)
    } else {
      const maxOrdem = qualidades.length > 0 ? Math.max(...qualidades.map(q => q.ordem)) + 1 : 1
      await supabase.from('produto_qualidades').insert({ nome: qNome, cor_hex: qCor, ordem: maxOrdem })
    }
    setQSaving(false); setQEditId(null); setQNome(''); setQCor('#2563eb'); fetchAll()
  }
  async function toggleQualidade(q: Qualidade) {
    await supabase.from('produto_qualidades').update({ ativo: !q.ativo }).eq('id', q.id); fetchAll()
  }

  // ── Numeração ────────────────────────────────────────────
  async function salvarNumeracao(n: NumeracaoConfig, field: string, value: any) {
    await supabase.from('numeracao_config').update({ [field]: value }).eq('id', n.id); fetchAll()
  }

  // ── Assinatura ───────────────────────────────────────────
  function assDown(e: React.MouseEvent<HTMLCanvasElement>) {
    setAssDrawing(true)
    const c = canvasRef.current; if (!c) return
    const r = c.getBoundingClientRect()
    const ctx = c.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
  }
  function assMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!assDrawing) return
    const c = canvasRef.current; if (!c) return
    const r = c.getBoundingClientRect()
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke()
  }
  function assUp() {
    setAssDrawing(false)
    setAssNova(canvasRef.current?.toDataURL() ?? '')
  }
  function assLimpar() {
    const c = canvasRef.current; if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setAssNova('')
  }
  async function assSalvar() {
    if (!assNova) return
    setAssSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAssSaving(false); return }
    await supabase.from('usuario_assinaturas')
      .upsert({ usuario_id: user.id, assinatura: assNova }, { onConflict: 'usuario_id' })
    setAssAtual(assNova); setAssSaving(false); setAssSaved(true)
    setTimeout(() => setAssSaved(false), 2500)
  }

  // ── Upload de logo ───────────────────────────────────────
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState('')

  async function resizeLogo(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const MAX_W = 400, MAX_H = 100
        let w = img.naturalWidth, h = img.naturalHeight
        const ratio = Math.min(MAX_W / w, MAX_H / h, 1)
        w = Math.round(w * ratio); h = Math.round(h * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas failed')), 'image/png')
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true)
    try {
      const blob = await resizeLogo(file)
      const preview = URL.createObjectURL(blob)
      setLogoPreview(preview)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const path = `logos/${user.id}.png`
      const { error } = await supabase.storage.from('produto-fotos').upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (error) { alert('Erro ao enviar logo: ' + error.message); return }
      const { data: urlData } = supabase.storage.from('produto-fotos').getPublicUrl(path)
      setLogoUrl(urlData.publicUrl)
      const c = getConfig('loja_logo_url')
      if (c) {
        await supabase.from('sistema_config').update({ valor: urlData.publicUrl }).eq('id', c.id)
        fetchAll()
      }
    } finally {
      setLogoUploading(false)
    }
  }

  async function deleteLogo() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.storage.from('produto-fotos').remove([`logos/${user.id}.png`])
    const c = getConfig('loja_logo_url')
    if (c) await supabase.from('sistema_config').update({ valor: '' }).eq('id', c.id)
    setLogoUrl(''); setLogoPreview('')
    fetchAll()
  }

  // ─── Render de campos (funções, não componentes — evita remount) ───────────
  const renderField = (chave: string, type = 'text', options?: { v: string; l: string }[]) => {
    const c = getConfig(chave)
    if (!c) return null
    const val = getVal(chave)
    const modified = isModified(chave)

    // Formatação e validação automática por tipo de campo
    const isCNPJ = chave.includes('cnpj')
    const isCPF  = chave.includes('cpf')
    const isTel  = chave.includes('telefone') || chave.includes('whatsapp') || chave.includes('celular')

    function handleChange(raw: string) {
      let formatted = raw
      if (isCNPJ)      formatted = formatarCNPJ(raw)
      else if (isCPF)  formatted = formatarCPF(raw)
      else if (isTel)  formatted = formatarTelefone(raw)
      onEdit(chave, formatted)
    }

    let validationError = ''
    if (val) {
      if (isCNPJ && val.replace(/\D/g,'').length >= 14 && !validarCNPJ(val))
        validationError = 'CNPJ inválido'
      else if (isCPF && val.replace(/\D/g,'').length >= 11 && !validarCPF(val))
        validationError = 'CPF inválido'
      else if (isTel && val.replace(/\D/g,'').length >= 10 && !validarTelefone(val))
        validationError = 'Telefone inválido'
    }

    return (
      <div key={chave} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label style={lbl}>{CONFIG_LABELS[chave] ?? c.descricao ?? c.chave}</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {saved === chave && (
              <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '1px 8px', borderRadius: 20 }}>✓ Salvo</span>
            )}
            {modified && (
              <>
                <button onClick={() => cancelEdit(chave)} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancelar</button>
                <button onClick={() => salvarConfig(chave)} disabled={saving === chave || !!validationError} style={{ fontSize: 11, padding: '2px 10px', background: saving === chave || validationError ? '#e2e8f0' : '#2563eb', color: saving === chave || validationError ? '#94a3b8' : '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  {saving === chave ? '...' : 'Salvar'}
                </button>
              </>
            )}
          </div>
        </div>
        {options ? (
          <select style={inp} value={val} onChange={e => onEdit(chave, e.target.value)}>
            {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : (
          <input
            style={{ ...inp, borderColor: validationError ? '#fca5a5' : modified ? '#bfdbfe' : '#e2e8f0' }}
            type={type} value={val}
            onChange={e => handleChange(e.target.value)}
          />
        )}
        {validationError && (
          <p style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>⚠ {validationError}</p>
        )}
      </div>
    )
  }

  const renderWAField = (chave: string) => {
    const c = getConfig(chave)
    if (!c) return null
    const val = getVal(chave)
    const modified = isModified(chave)
    const preview = val.replace(/\{[^}]+\}/g, (m: string) => WA_PREVIEW[m] ?? m)
    return (
      <div key={chave} style={{ background: '#fff', border: `1px solid ${modified ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.descricao ?? c.chave}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {saved === chave && <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '2px 8px', borderRadius: 20 }}>✓ Salvo</span>}
            {modified && (
              <>
                <button onClick={() => cancelEdit(chave)} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => salvarConfig(chave)} disabled={saving === chave} style={{ fontSize: 11, padding: '3px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  {saving === chave ? '...' : 'Salvar'}
                </button>
              </>
            )}
          </div>
        </div>
        <textarea
          value={val}
          onChange={e => onEdit(chave, e.target.value)}
          style={{ ...inp, minHeight: 90, resize: 'vertical', lineHeight: 1.7, marginBottom: 8 }}
        />
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 7, padding: '8px 12px' }}>
          <p style={{ fontSize: 11, color: '#0369a1', fontWeight: 500, marginBottom: 3 }}>Preview</p>
          <p style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{preview}</p>
        </div>
      </div>
    )
  }

  // ─── Loading / acesso ─────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: 'var(--font-sans)', color: '#94a3b8' }}>
      Carregando configurações...
    </div>
  )
  if (!acesso) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: 'var(--font-sans)', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <p style={{ fontSize: 15, color: '#374151' }}>Acesso restrito a admin e gerente.</p>
    </div>
  )

  // ─── Render principal ─────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* Sidebar interna */}
      <div style={{ width: 220, minWidth: 220, borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Configurações</p>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {MENU_GRUPOS.map((grupo, gi) => (
            <div key={grupo.label} style={{ marginBottom: gi < MENU_GRUPOS.length - 1 ? 4 : 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 3px' }}>
                {grupo.label}
              </div>
              {grupo.items.map(item => (
                <button
                  key={item.key}
                  onClick={() => setActiveMenu(item.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    textAlign: 'left', marginBottom: 1, fontSize: 13,
                    background: activeMenu === item.key ? '#dbeafe' : 'transparent',
                    color: activeMenu === item.key ? '#1d4ed8' : '#374151',
                    fontWeight: activeMenu === item.key ? 500 : 400,
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
              {gi < MENU_GRUPOS.length - 1 && (
                <div style={{ height: 1, background: '#e2e8f0', margin: '4px 8px 4px' }} />
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>

        {/* ── DADOS DA LOJA */}
        {activeMenu === 'loja' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🏪 Dados da loja</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Todas as informações aparecem na OS impressa, recibos e documentos.
            </p>
            <div style={card}>
              <p style={sectionTitle}>Identificação</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                <div style={{ gridColumn: '1/-1' }}>{renderField('loja_nome')}</div>
                {renderField('loja_nome_fantasia')}
                {renderField('loja_cnpj')}
                {renderField('loja_ie')}
                {renderField('loja_im')}
              </div>
            </div>
            <div style={card}>
              <p style={sectionTitle}>Contato</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {renderField('loja_telefone')}
                {renderField('loja_whatsapp')}
                {renderField('loja_email')}
                {renderField('loja_site')}
              </div>
            </div>
            <div style={card}>
              <p style={sectionTitle}>Endereço e funcionamento</p>
              {renderField('loja_endereco')}
              {renderField('loja_horario')}
            </div>
          </div>
        )}

        {/* ── MARCA & LOGO */}
        {activeMenu === 'marca' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🎨 Marca & Logo</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Logo que aparece nas OS impressas, recibos e documentos.</p>
            <div style={card}>
              <input
                type="file" id="logo-file" accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }}
              />
              {/* Preview area */}
              {(logoPreview || logoUrl || getVal('loja_logo_url')) ? (
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Logo atual</label>
                  <div style={{ background: '#0f172a', borderRadius: 8, padding: '16px 20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <img
                      src={logoPreview || logoUrl || getVal('loja_logo_url')}
                      style={{ maxHeight: 60, maxWidth: 240, objectFit: 'contain', display: 'block' }}
                      alt="Logo"
                    />
                  </div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>Preview em fundo escuro (como aparece nas OS)</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => document.getElementById('logo-file')?.click()}
                      disabled={logoUploading}
                      style={{ fontSize: 12, padding: '6px 14px', border: '1px solid #bfdbfe', borderRadius: 7, background: '#dbeafe', color: '#2563eb', cursor: 'pointer' }}
                    >
                      {logoUploading ? 'Enviando...' : '🔄 Trocar logo'}
                    </button>
                    <button
                      onClick={deleteLogo}
                      style={{ fontSize: 12, padding: '6px 14px', border: '1px solid #fecaca', borderRadius: 7, background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                    >
                      🗑 Excluir
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => !logoUploading && document.getElementById('logo-file')?.click()}
                  style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '40px 20px', textAlign: 'center', cursor: logoUploading ? 'wait' : 'pointer', background: '#f8fafc', marginBottom: 12, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => { if (!logoUploading) (e.currentTarget as HTMLElement).style.borderColor = '#93c5fd' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0' }}
                >
                  {logoUploading ? (
                    <p style={{ fontSize: 14, color: '#2563eb' }}>Enviando e redimensionando...</p>
                  ) : (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Clique para enviar o logo</p>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>PNG, JPG, WEBP · será redimensionado para no máximo 400×100px</p>
                    </>
                  )}
                </div>
              )}
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0369a1' }}>
                💡 Dimensões ideais: <strong>400×100px</strong> · formato PNG com fundo transparente. Imagens maiores são redimensionadas automaticamente.
              </div>
            </div>
          </div>
        )}

        {/* ── PARÂMETROS OPERACIONAIS */}
        {activeMenu === 'operacional' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>⚙️ Parâmetros operacionais</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Prazos e valores usados nas regras do sistema.</p>
            <div style={card}>
              {renderField('garantia_dias', 'number')}
              {renderField('retirada_prazo_dias', 'number')}
              {renderField('retirada_taxa_mensal', 'number')}
              {renderField('os_pronta_alerta_dias', 'number')}
              {renderField('cliente_inativo_dias', 'number')}
              {renderField('compras_periodo_dias', 'text', [
                { v: '30', l: '30 dias' },
                { v: '60', l: '60 dias' },
                { v: '90', l: '90 dias' },
                { v: '180', l: '180 dias' },
                { v: '365', l: '365 dias' },
              ])}
            </div>
          </div>
        )}

        {/* ── IMPRESSÃO */}
        {activeMenu === 'impressao' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🖨 Impressão</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Formato padrão para cada tipo de documento.</p>
            <div style={card}>
              {renderField('recibo_os_formato', 'text', [
                { v: 'a4',   l: 'A4 — Folha comum (2 vias)' },
                { v: '80mm', l: '80mm — Bobina padrão' },
                { v: '58mm', l: '58mm — Bobina estreita' },
              ])}
              {renderField('recibo_pdv_formato', 'text', [
                { v: '80mm', l: '80mm — Bobina padrão' },
                { v: '58mm', l: '58mm — Bobina estreita' },
                { v: 'a4',   l: 'A4 — Folha comum' },
              ])}
              {renderField('recibo_garantia_formato', 'text', [
                { v: '80mm', l: '80mm — Bobina padrão' },
                { v: '58mm', l: '58mm — Bobina estreita' },
                { v: 'a4',   l: 'A4 — Folha comum' },
              ])}
            </div>
          </div>
        )}

        {/* ── NUMERAÇÃO */}
        {activeMenu === 'numeracao' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🔢 Numeração por módulo</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Configure o formato dos números gerados em cada módulo.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {numeracoes.map(n => {
                const preview = [
                  n.prefixo,
                  n.usar_ano ? new Date().getFullYear() : '',
                  n.usar_mes ? String(new Date().getMonth() + 1).padStart(2, '0') : '',
                  String(n.sequencial).padStart(n.digitos, '0'),
                  n.sufixo,
                ].filter(Boolean).join('')
                return (
                  <div key={n.id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{MODULOS_NUM[n.modulo] ?? n.modulo}</p>
                      <code style={{ fontSize: 14, color: '#2563eb', fontWeight: 700 }}>{preview}</code>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={lbl}>Prefixo</label>
                        <input style={inp} defaultValue={n.prefixo} onBlur={e => salvarNumeracao(n, 'prefixo', e.target.value)} />
                      </div>
                      <div>
                        <label style={lbl}>Dígitos</label>
                        <input style={inp} type="number" min={1} max={10} defaultValue={n.digitos} onBlur={e => salvarNumeracao(n, 'digitos', parseInt(e.target.value))} />
                      </div>
                      <div>
                        <label style={lbl}>Reinício</label>
                        <select style={inp} defaultValue={n.reinicio} onChange={e => salvarNumeracao(n, 'reinicio', e.target.value)}>
                          <option value="nunca">Nunca</option>
                          <option value="anual">Anual</option>
                          <option value="mensal">Mensal</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
                        <input type="checkbox" defaultChecked={n.usar_ano} onChange={e => salvarNumeracao(n, 'usar_ano', e.target.checked)} />
                        Incluir ano
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
                        <input type="checkbox" defaultChecked={n.usar_mes} onChange={e => salvarNumeracao(n, 'usar_mes', e.target.checked)} />
                        Incluir mês
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── MEU PLANO */}
        {activeMenu === 'plano' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>💎 Meu plano</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Informações sobre o plano contratado.</p>
            <div style={{ ...card, border: '2px solid #bfdbfe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Plano atual</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Profissional</p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, background: '#ecfdf5', color: '#065f46', padding: '4px 12px', borderRadius: 20 }}>✓ Ativo</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[{ l: 'Filiais', v: '1 / 1', icon: '🏪' }, { l: 'Usuários', v: '3 / 10', icon: '👤' }, { l: 'OS este mês', v: '—', icon: '🔧' }].map(m => (
                  <div key={m.l} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{m.v}</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>{m.l}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#92400e' }}>
              Para alterar o plano ou aumentar limites, entre em contato com o suporte.
            </div>
          </div>
        )}

        {/* ── QUALIDADES DE PEÇAS */}
        {activeMenu === 'qualidades' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🏷 Qualidades de peças</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Defina até 10 tipos de qualidade usados no orçamento.</p>
            <div style={card}>
              {qualidades.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < qualidades.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: q.cor_hex, flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', flex: 1 }}>{q.nome}</p>
                  <button onClick={() => { setQEditId(q.id); setQNome(q.nome); setQCor(q.cor_hex) }} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>Editar</button>
                  <button onClick={() => toggleQualidade(q)} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: q.ativo ? '#ef4444' : '#10b981' }}>
                    {q.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              ))}
            </div>
            {qualidades.length < 10 && (
              <div style={card}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>{qEditId ? 'Editar qualidade' : '+ Nova qualidade'}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Nome</label>
                    <input style={inp} value={qNome} onChange={e => setQNome(e.target.value)} placeholder="Ex: Semi-original" />
                  </div>
                  <div>
                    <label style={lbl}>Cor</label>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 220 }}>
                      {CORES_PADRAO.map(c => (
                        <button key={c} onClick={() => setQCor(c)} style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: qCor === c ? '3px solid #0f172a' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                      ))}
                    </div>
                  </div>
                  <button onClick={salvarQualidade} disabled={qSaving || !qNome.trim()} style={{ padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {qSaving ? '...' : qEditId ? 'Salvar' : '+ Adicionar'}
                  </button>
                  {qEditId && (
                    <button onClick={() => { setQEditId(null); setQNome(''); setQCor('#2563eb') }} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                      Cancelar
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{qualidades.length}/10 qualidades cadastradas</p>
              </div>
            )}
          </div>
        )}

        {/* ── WHATSAPP API */}
        {activeMenu === 'whatsapp' && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>💬 WhatsApp API</h2>

            {/* Seção 1: Conexão */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Conexão Meta Business</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Phone Number ID</label>
                  <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} value={waConfig?.phone_number_id ?? ''} onChange={e => setWaConfig(c => c ? { ...c, phone_number_id: e.target.value } : c)} placeholder="1234567890123456" />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Access Token</label>
                  <input style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} type="password" value={waConfig?.access_token ?? ''} onChange={e => setWaConfig(c => c ? { ...c, access_token: e.target.value } : c)} placeholder="EAAxxxxx..." />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Verify Token (para o webhook)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', background: '#f8fafc' }} readOnly value={waConfig?.verify_token ?? ''} />
                  <button onClick={() => navigator.clipboard.writeText(waConfig?.verify_token ?? '')} style={{ padding: '10px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Copiar</button>
                </div>
              </div>
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0369a1' }}>
                URL do Webhook:{' '}<strong>https://octaos.com.br/api/whatsapp/webhook</strong>
                <button onClick={() => navigator.clipboard.writeText('https://octaos.com.br/api/whatsapp/webhook')} style={{ marginLeft: 8, padding: '2px 8px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Copiar</button>
              </div>
            </div>

            {/* Seção 2: Bot */}
            <div style={{ marginBottom: 32, borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Chatbot com IA</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#0f172a' }}>
                  Ativo
                  <div onClick={() => setWaConfig(c => c ? { ...c, bot_ativo: !c.bot_ativo } : c)} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', background: waConfig?.bot_ativo ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', left: waConfig?.bot_ativo ? 21 : 3 }} />
                  </div>
                </label>
              </div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Prompt do sistema</label>
              <textarea rows={5} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} value={waConfig?.bot_prompt ?? ''} onChange={e => setWaConfig(c => c ? { ...c, bot_prompt: e.target.value } : c)} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Modelo: Claude Haiku 4.5 · Use [HUMANO] para instruir quando transferir para atendente.</div>
            </div>

            {/* Seção 3: Templates */}
            <div style={{ marginBottom: 32, borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Templates de Notificação de OS</div>
              {[
                { status: 'aberta', template: 'os_aberta', vars: '{{nome}}, {{numero}}' },
                { status: 'em_andamento', template: 'os_em_andamento', vars: '{{nome}}, {{numero}}' },
                { status: 'pronta', template: 'os_pronta', vars: '{{nome}}, {{numero}}, {{valor}}' },
                { status: 'entregue', template: 'os_entregue', vars: '{{nome}}, {{numero}}' },
                { status: 'cancelada', template: 'os_cancelada', vars: '{{nome}}, {{numero}}' },
              ].map(t => (
                <div key={t.status} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 130px', gap: 8, alignItems: 'center', background: '#f8fafc', borderRadius: 6, padding: '8px 12px', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{t.status}</div>
                  <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{t.template} · {t.vars}</div>
                  <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>Criar no Meta →</a>
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Templates criados no Meta Business Manager. Aprovação leva 24-48h.</div>
            </div>

            {waMsg && <div style={{ marginBottom: 12, fontSize: 13, color: waMsg.startsWith('✅') ? '#059669' : '#dc2626' }}>{waMsg}</div>}
            <button onClick={salvarWaConfig} disabled={waSaving} style={{ padding: '11px 24px', background: waSaving ? '#a5b4fc' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: waSaving ? 'not-allowed' : 'pointer' }}>
              {waSaving ? 'Salvando...' : '💾 Salvar configurações WhatsApp'}
            </button>
          </div>
        )}

        {/* ── PDV */}
        {activeMenu === 'pdv_cfg' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>💳 PDV</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Configurações do ponto de venda e caixa.</p>
            <div style={card}>
              {renderField('pdv_modo_visualizacao', 'text', [
                { v: 'padrao', l: 'Padrão' },
                { v: 'touch',  l: 'Touch (tablet)' },
                { v: 'visual', l: 'Visual (grade grande)' },
              ])}
              {renderField('pdv_permite_desconto', 'text', [
                { v: 'true',  l: 'Sim' },
                { v: 'false', l: 'Não' },
              ])}
              {renderField('pdv_desconto_maximo', 'number')}
              {renderField('pdv_exige_cliente', 'text', [
                { v: 'true',  l: 'Sim' },
                { v: 'false', l: 'Não' },
              ])}
              {renderField('caixa_max_por_filial', 'number')}
              {renderField('caixa_quem_pode_abrir', 'text', [
                { v: 'todos',   l: 'Todos os usuários' },
                { v: 'gerente', l: 'Gerente e Admin' },
                { v: 'admin',   l: 'Somente Admin' },
              ])}
            </div>
          </div>
        )}

        {/* ── ROTINAS */}
        {activeMenu === 'rotinas_cfg' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>✅ Rotinas</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Configurações do módulo de rotinas diárias.</p>
            <div style={card}>
              {renderField('rotinas_wa_ativo', 'text', [
                { v: 'true',  l: 'Ativo — exibe sublista WhatsApp nas rotinas' },
                { v: 'false', l: 'Inativo' },
              ])}
              {renderField('rotinas_wa_aniversario', 'text', [{ v: 'true', l: 'Sim' }, { v: 'false', l: 'Não' }])}
              {renderField('rotinas_wa_os_pronta', 'text', [{ v: 'true', l: 'Sim' }, { v: 'false', l: 'Não' }])}
              {renderField('rotinas_wa_90dias', 'text', [{ v: 'true', l: 'Sim' }, { v: 'false', l: 'Não' }])}
              {renderField('rotinas_wa_inativos', 'text', [{ v: 'true', l: 'Sim' }, { v: 'false', l: 'Não' }])}
            </div>
          </div>
        )}

        {/* ── PIX */}
        {activeMenu === 'pix' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>📱 PIX — Mercado Pago</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Configure a integração com o Mercado Pago para receber pagamentos PIX diretamente no sistema.</p>

            {/* Seção 1 — Credenciais */}
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>🔒 Credenciais Mercado Pago</h3>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Access Token de Produção</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type={pixShowToken ? 'text' : 'password'}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'monospace' }}
                    value={pixConfig.mp_access_token}
                    onChange={e => setPixConfig(c => ({ ...c, mp_access_token: e.target.value }))}
                    placeholder="APP_USR-..."
                  />
                  <button onClick={() => setPixShowToken(v => !v)} style={{ padding: '10px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                    {pixShowToken ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Webhook Secret</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type={pixShowSecret ? 'text' : 'password'}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'monospace' }}
                    value={pixConfig.mp_webhook_secret}
                    onChange={e => setPixConfig(c => ({ ...c, mp_webhook_secret: e.target.value }))}
                    placeholder="Cole o secret do webhook aqui"
                  />
                  <button onClick={() => setPixShowSecret(v => !v)} style={{ padding: '10px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                    {pixShowSecret ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div onClick={() => setPixConfig(c => ({ ...c, ativo: !c.ativo }))} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', background: pixConfig.ativo ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', left: pixConfig.ativo ? 21 : 3 }} />
                </div>
                <span style={{ fontSize: 13, color: '#374151' }}>PIX {pixConfig.ativo ? 'ativo' : 'inativo'} para esta filial</span>
              </div>

              {pixMsg && <div style={{ marginBottom: 12, fontSize: 13, color: pixMsg.startsWith('✅') ? '#059669' : '#dc2626' }}>{pixMsg}</div>}
              <button onClick={salvarPixConfig} disabled={pixSaving} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: pixSaving ? 'not-allowed' : 'pointer', opacity: pixSaving ? 0.7 : 1 }}>
                {pixSaving ? 'Salvando...' : 'Salvar configurações'}
              </button>
            </div>

            {/* Seção 2 — Webhook URL */}
            <div style={{ ...card, marginTop: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>🔗 URL do Webhook</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Cadastre esta URL no painel do Mercado Pago para receber confirmações de pagamento:</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', background: '#f8fafc', color: '#374151' }}
                  value={`${typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/pix/webhook`}
                />
                <button onClick={() => navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/pix/webhook`)} style={{ padding: '10px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                  Copiar
                </button>
              </div>
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px', borderRadius: 20, background: pixConfig.mp_access_token ? '#dcfce7' : '#f1f5f9', color: pixConfig.mp_access_token ? '#16a34a' : '#94a3b8' }}>
                {pixConfig.mp_access_token ? '✓ Credenciais configuradas' : '○ Sem credenciais'}
              </div>
            </div>

            {/* Seção 3 — Manual (accordion) */}
            <div style={{ ...card, marginTop: 16 }}>
              <button onClick={() => setPixManualOpen(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>📖 Como configurar em 4 passos</h3>
                <span style={{ fontSize: 18, color: '#64748b' }}>{pixManualOpen ? '▲' : '▼'}</span>
              </button>
              {pixManualOpen && (
                <div style={{ marginTop: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, fontSize: 13, color: '#1e40af', lineHeight: 2 }}>
                  <strong>1.</strong> Acesse <strong>mercadopago.com.br/developers</strong> → Suas integrações → Criar aplicação<br />
                  <strong>2.</strong> Ative o modo <strong>Produção</strong> e copie o <strong>Access Token de produção</strong> (começa com APP_USR-)<br />
                  <strong>3.</strong> Em Webhooks, cadastre a URL acima e selecione o evento <strong>&quot;payment&quot;</strong><br />
                  <strong>4.</strong> Copie o <strong>Webhook Secret</strong> gerado e cole no campo acima, depois salve
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ASSINATURA DIGITAL */}
        {activeMenu === 'assinatura' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>✍️ Assinatura digital</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Sua assinatura aparece automaticamente nos termos de compra, venda, OS e contratos.
            </p>
            {assAtual && (
              <div style={{ ...card, marginBottom: 14 }}>
                <label style={lbl}>Assinatura atual</label>
                <div style={{ background: '#fafafa', padding: 8, borderRadius: 8, border: '1px solid #f1f5f9', display: 'inline-block' }}>
                  <img src={assAtual} style={{ maxHeight: 70, display: 'block' }} alt="Assinatura" />
                </div>
              </div>
            )}
            <div style={card}>
              <label style={{ ...lbl, marginBottom: 10 }}>{assAtual ? 'Atualizar assinatura' : 'Desenhe sua assinatura'}</label>
              <div style={{ position: 'relative', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fafafa', display: 'inline-block' }}>
                <canvas
                  ref={canvasRef} width={520} height={140}
                  style={{ display: 'block', cursor: 'crosshair', borderRadius: 10 }}
                  onMouseDown={assDown} onMouseMove={assMove} onMouseUp={assUp} onMouseLeave={assUp}
                />
                {!assNova && (
                  <p style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#cbd5e1', fontSize: 14, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    Assine aqui com o mouse...
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
                {assNova && <button onClick={assLimpar} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Limpar</button>}
                {assSaved && <span style={{ fontSize: 12, color: '#065f46', background: '#ecfdf5', padding: '4px 12px', borderRadius: 20 }}>✓ Salvo!</span>}
                <button onClick={assSalvar} disabled={assSaving || !assNova} style={{ marginLeft: 'auto', padding: '9px 22px', background: assSaving || !assNova ? '#e2e8f0' : '#2563eb', color: assSaving || !assNova ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: assSaving || !assNova ? 'not-allowed' : 'pointer' }}>
                  {assSaving ? 'Salvando...' : 'Salvar assinatura'}
                </button>
              </div>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1d4ed8' }}>
              💡 Vinculada ao seu usuário. Aparece em todos os documentos como <strong>assinatura do responsável</strong>.
            </div>
          </div>
        )}

        {/* ── ALERTAS */}
        {activeMenu === 'alertas' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🔔 Estratégia de alertas</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Dias em que o sistema alerta em cada situação. Refletem nas rotinas, CRM e fechamento.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={card}>
                <p style={sectionTitle}>⏰ OS pronta não retirada</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {renderField('alerta_os_pronta_1', 'number')}
                  {renderField('alerta_os_pronta_2', 'number')}
                  {renderField('alerta_os_pronta_3', 'number')}
                  {renderField('alerta_os_pronta_4', 'number')}
                </div>
              </div>
              <div style={card}>
                <p style={sectionTitle}>📦 Aparelho retido além do prazo</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {renderField('alerta_aparelho_1', 'number')}
                  {renderField('alerta_aparelho_2', 'number')}
                  {renderField('alerta_aparelho_3', 'number')}
                </div>
              </div>
              <div style={card}>
                <p style={sectionTitle}>😴 Cliente inativo</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {renderField('alerta_cliente_inativo_1', 'number')}
                  {renderField('alerta_cliente_inativo_2', 'number')}
                  {renderField('alerta_cliente_inativo_3', 'number')}
                </div>
              </div>
              <div style={card}>
                <p style={sectionTitle}>🏭 Resposta do fornecedor (garantia)</p>
                {renderField('alerta_garantia_resposta', 'number')}
              </div>
              <div style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1d4ed8' }}>
                💡 Estes valores alimentam automaticamente as rotinas, o CRM, o fechamento e os alertas de WhatsApp.
              </div>
            </div>
          </div>
        )}

        {/* ── USUÁRIOS */}
        {activeMenu === 'usuarios' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>👥 Usuários</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>Gerencie os usuários e seus cargos.</p>
              </div>
              <button onClick={() => abrirUModal()} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                + Novo usuário
              </button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Nome', 'Cargo', 'Status', 'Desde', ''].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Nenhum usuário encontrado.</td></tr>
                  ) : usuarios.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            {u.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontWeight: 500, color: '#0f172a' }}>{u.nome}</p>
                            {u.email && <p style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#f1f5f9', color: '#374151', fontWeight: 500 }}>{CARGO_LABEL_CFG[u.papel] ?? u.papel}</span>
                        {CARGOS_LOCKED.includes(u.papel as Cargo) && <span style={{ fontSize: 10, marginLeft: 6, color: '#94a3b8' }}>🔒</span>}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: u.ativo ? '#ecfdf5' : '#f1f5f9', color: u.ativo ? '#065f46' : '#94a3b8' }}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: 12, color: '#94a3b8' }}>
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => abrirUModal(u)} style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                            Editar
                          </button>
                          {!CARGOS_LOCKED.includes(u.papel as Cargo) && (
                            <button onClick={() => toggleUsuarioAtivo(u)} style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: u.ativo ? '#ef4444' : '#10b981' }}>
                              {u.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal usuário */}
            {uModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setUModal(false)}>
                <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 20 }}>{uEditId ? 'Editar usuário' : 'Novo usuário'}</h3>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Nome completo</label>
                    <input style={inp} value={uNome} onChange={e => setUNome(e.target.value)} placeholder="Nome do usuário" />
                  </div>
                  {!uEditId && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={lbl}>E-mail</label>
                      <input style={inp} type="email" value={uEmail} onChange={e => setUEmail(e.target.value)} placeholder="email@exemplo.com" />
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>O usuário precisa ativar a conta via e-mail. Para definir a senha, use o painel Supabase.</p>
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Cargo</label>
                    <select style={inp} value={uPapel} onChange={e => setUPapel(e.target.value as Cargo)}>
                      {CARGOS.map(c => <option key={c} value={c}>{CARGO_LABEL_CFG[c] ?? c}</option>)}
                    </select>
                  </div>
                  {uEditId && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 20 }}>
                      <input type="checkbox" checked={uAtivo} onChange={e => setUAtivo(e.target.checked)} />
                      Usuário ativo
                    </label>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                    <button onClick={() => setUModal(false)} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                    <button onClick={salvarUsuario} disabled={uSaving || !uNome.trim()} style={{ padding: '8px 18px', background: uSaving || !uNome.trim() ? '#e2e8f0' : '#2563eb', color: uSaving || !uNome.trim() ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      {uSaving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PERMISSÕES */}
        {activeMenu === 'permissoes' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🔐 Permissões por cargo</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>Defina quais módulos cada cargo pode acessar. Alterações têm efeito imediato.</p>
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
              🔒 <strong>Administrador</strong> e <strong>Gerente</strong> têm acesso total e não podem ter permissões removidas.
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', minWidth: 160 }}>Módulo</th>
                    {CARGOS.map(c => (
                      <th key={c} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: CARGOS_LOCKED.includes(c) ? '#2563eb' : '#64748b', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                        {CARGO_LABEL_CFG[c] ?? c} {CARGOS_LOCKED.includes(c) ? '🔒' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULOS_PERM.map((m, mi) => (
                    <tr key={m.key} style={{ borderBottom: '1px solid #f1f5f9', background: mi % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: '#374151' }}>
                        {m.icon} {m.label}
                      </td>
                      {CARGOS.map(c => {
                        const permitido = getPermitido(c, m.key)
                        const locked = CARGOS_LOCKED.includes(c)
                        return (
                          <td key={c} style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <button
                              onClick={() => !locked && togglePermissao(c, m.key)}
                              disabled={permSaving || locked}
                              style={{
                                width: 32, height: 20, borderRadius: 10, border: 'none', cursor: locked ? 'default' : 'pointer',
                                background: permitido ? '#2563eb' : '#e2e8f0',
                                position: 'relative', transition: 'background 0.2s',
                                opacity: locked ? 0.7 : 1,
                              }}
                              title={locked ? 'Não pode ser alterado' : permitido ? 'Clique para revogar' : 'Clique para permitir'}
                            >
                              <span style={{
                                position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                transition: 'left 0.2s', left: permitido ? 14 : 2,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }} />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── HISTÓRICO */}
        {activeMenu === 'formas_pgto' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>💳 Formas de pagamento</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>Configure taxas, parcelamento e disponibilidade de cada forma.</p>
              </div>
              <button onClick={salvarFormasPgto} disabled={formasSaving} style={{ padding: '9px 20px', background: formasSaved ? '#10b981' : formasSaving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {formasSaved ? '✓ Salvo' : formasSaving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>

            {/* Aviso de repasse */}
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span><strong>As taxas são repassadas ao cliente.</strong> Ao selecionar a forma de pagamento no PDV ou OS, o sistema soma a taxa ao valor e exibe o total atualizado antes de finalizar.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {formasPgto.map(f => (
                <div key={f.key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', opacity: f.ativo ? 1 : 0.55 }}>
                  {/* Linha principal */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{f.icone}</span>
                      <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{f.label}</span>
                    </div>
                    {/* Taxa fixa R$ */}
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Taxa fixa</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>R$</span>
                        <input type="number" min="0" step="0.01" value={f.taxa_fixa} onChange={e => updateForma(f.key, 'taxa_fixa', parseFloat(e.target.value) || 0)}
                          style={{ width: 72, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                      </div>
                    </div>
                    {/* Parcelável */}
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parcelável</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={f.parcelavel} onChange={e => updateForma(f.key, 'parcelavel', e.target.checked)} />
                        <span style={{ fontSize: 12, color: '#64748b' }}>{f.parcelavel ? 'Sim' : 'Não'}</span>
                      </label>
                    </div>
                    {/* Máx. parcelas */}
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Máx.</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" min="2" max="24" value={f.max_parcelas} disabled={!f.parcelavel}
                          onChange={e => updateForma(f.key, 'max_parcelas', parseInt(e.target.value) || 2)}
                          style={{ width: 56, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', opacity: f.parcelavel ? 1 : 0.35 }} />
                        <span style={{ fontSize: 12, color: '#64748b' }}>x</span>
                      </div>
                    </div>
                    {/* Ativo */}
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={f.ativo} onChange={e => updateForma(f.key, 'ativo', e.target.checked)} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: f.ativo ? '#065f46' : '#94a3b8' }}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
                      </label>
                    </div>
                    {/* Indicador taxa à vista (apenas para não-parcelável) */}
                    <div>
                      {!f.parcelavel && (
                        <>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Taxa %</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min="0" max="30" step="0.01" value={f.taxa_pct}
                              onChange={e => updateForma(f.key, 'taxa_pct', parseFloat(e.target.value) || 0)}
                              style={{ width: 72, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                            <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Sub-tabela por parcela — apenas para formas parceláveis */}
                  {f.parcelavel && f.max_parcelas >= 2 && (
                    <div style={{ borderTop: '1px solid #f1f5f9', background: '#f8fafc', padding: '12px 16px' }}>
                      <p style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                        Taxa por número de parcelas (repassada ao cliente)
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {Array.from({ length: f.max_parcelas - 1 }, (_, i) => i + 2).map(n => {
                          const tp = ensureTaxasParcelas(f)
                          const taxa = tp[String(n)] ?? 0
                          return (
                            <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', minWidth: 72 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>{n}x</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <input type="number" min="0" max="50" step="0.1" value={taxa}
                                  onChange={e => updateTaxaParcela(f.key, n, parseFloat(e.target.value) || 0)}
                                  style={{ width: 52, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, outline: 'none', textAlign: 'center' }} />
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {f.taxa_fixa > 0 && (
                        <p style={{ fontSize: 11, color: '#92400e', marginTop: 8 }}>
                          + R$ {f.taxa_fixa.toFixed(2).replace('.', ',')} fixo é somado em todas as parcelas acima.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: 12, color: '#0369a1' }}>
              💡 <strong>Como funciona o cálculo:</strong> Total com taxa = valor base × (1 + taxa%/100) + taxa fixa R$.
              A taxa efetiva exibida ao operador reflete o percentual real de acréscimo sobre o valor original.
            </div>
          </div>
        )}

        {activeMenu === 'historico' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>📜 Histórico de alterações</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Todas as mudanças com possibilidade de reverter.</p>
            {historico.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📜</div>
                <p>Nenhuma alteração registrada.</p>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Configuração','Anterior','Novo','Versão','Usuário','Quando',''].map(h => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map(h => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 14px' }}><code style={{ fontSize: 11, color: '#2563eb' }}>{h.chave}</code></td>
                        <td style={{ padding: '9px 14px', color: '#94a3b8', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_anterior?.slice(0, 30) ?? '—'}</td>
                        <td style={{ padding: '9px 14px', color: '#374151', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_novo.slice(0, 30)}</td>
                        <td style={{ padding: '9px 14px' }}><span style={{ fontSize: 10, background: '#dbeafe', color: '#2563eb', padding: '1px 6px', borderRadius: 20 }}>v{h.versao}</span></td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: '#64748b' }}>{(h.perfis as any)?.nome ?? '—'}</td>
                        <td style={{ padding: '9px 14px', fontSize: 11, color: '#94a3b8' }}>
                          {new Date(h.alterado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          {h.valor_anterior && (
                            <button
                              onClick={async (e) => {
                                const btn = e.currentTarget
                                btn.disabled = true; btn.textContent = '...'
                                await reverterConfig(h)
                                btn.disabled = false; btn.textContent = '↩ Reverter'
                              }}
                              style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #fde68a', borderRadius: 6, background: '#fef3c7', cursor: 'pointer', color: '#92400e' }}
                            >
                              ↩ Reverter
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeMenu === 'banco_aparelhos' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>📲 Banco de aparelhos</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Clique em uma marca para buscar os modelos no TudoCelular e importar para o banco de dados.
            </p>
            {userEmail !== 'danielcwpolo@gmail.com' ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '20px 24px', color: '#991b1b', fontSize: 13 }}>
                🔒 Esta funcionalidade é restrita ao administrador principal.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                {MARCAS_SCRAPING.map(m => {
                  const res = marcaResultados[m.slug]
                  const loading = marcaLoading === m.slug
                  return (
                    <div key={m.slug} style={{
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                      padding: '16px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{ fontSize: 28 }}>{m.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{m.label}</div>
                      {res && !res.erro && (
                        <div style={{ fontSize: 11, color: '#059669' }}>
                          +{res.novos} novos · {res.jaExistiam} já existiam
                        </div>
                      )}
                      {res?.erro && (
                        <div style={{ fontSize: 11, color: '#dc2626', wordBreak: 'break-all' }}>{res.erro}</div>
                      )}
                      <button
                        disabled={!!marcaLoading}
                        onClick={() => scraperMarca(m.slug)}
                        style={{
                          padding: '6px 10px', fontSize: 12, borderRadius: 7, cursor: marcaLoading ? 'not-allowed' : 'pointer',
                          border: '1px solid #3b82f6', background: loading ? '#eff6ff' : '#2563eb',
                          color: loading ? '#3b82f6' : '#fff', fontWeight: 500,
                        }}
                      >
                        {loading ? '⏳ Buscando…' : 'Buscar'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
