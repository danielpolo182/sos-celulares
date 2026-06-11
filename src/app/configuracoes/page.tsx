'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarCNPJ, formatarCPF, formatarTelefone, validarCNPJ, validarCPF, validarTelefone } from '@/lib/validators'

// ─── Tipos ────────────────────────────────────────────────
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

// ─── Menu lateral ─────────────────────────────────────────
const MENU = [
  { key: 'loja',         icon: '🏪', label: 'Dados da loja',       sub: [] },
  { key: 'marca',        icon: '🎨', label: 'Marca & Logo',         sub: [] },
  { key: 'operacional',  icon: '⚙️', label: 'Parâmetros',           sub: [] },
  { key: 'impressao',    icon: '🖨', label: 'Impressão',            sub: [] },
  { key: 'numeracao',    icon: '🔢', label: 'Numeração',            sub: [] },
  { key: 'plano',        icon: '💎', label: 'Meu plano',            sub: [] },
  { key: 'qualidades',   icon: '🏷',  label: 'Qualidades de peças',  sub: [] },
  { key: 'whatsapp',     icon: '💬', label: 'Modelos WhatsApp',     sub: [] },
  { key: 'pdv_cfg',      icon: '💳', label: 'PDV',                  sub: [] },
  { key: 'rotinas_cfg',  icon: '✅', label: 'Rotinas',              sub: [] },
  { key: 'pix',          icon: '📱', label: 'PIX',                  sub: [] },
  { key: 'assinatura',   icon: '✍️', label: 'Assinatura digital',   sub: [] },
  { key: 'alertas',      icon: '🔔', label: 'Alertas',              sub: [] },
  { key: 'usuarios',     icon: '👥', label: 'Usuários',             sub: [] },
  { key: 'permissoes',   icon: '🔐', label: 'Permissões',           sub: [] },
  { key: 'historico',    icon: '📜', label: 'Histórico',            sub: [] },
]

const CARGOS = ['administrador', 'gerente', 'tecnico', 'atendente', 'caixa'] as const
type Cargo = typeof CARGOS[number]

const CARGOS_LOCKED: Cargo[] = ['administrador', 'gerente']

const MODULOS_PERM: { key: string; label: string; icon: string }[] = [
  { key: 'dashboard',    label: 'Dashboard',         icon: '📊' },
  { key: 'os',           label: 'Ordens de Serviço', icon: '🔧' },
  { key: 'clientes',     label: 'Clientes',           icon: '👥' },
  { key: 'crm',          label: 'CRM',                icon: '📣' },
  { key: 'pdv',          label: 'PDV / Vendas',       icon: '💳' },
  { key: 'estoque',      label: 'Estoque',            icon: '📦' },
  { key: 'contratos',    label: 'Contratos',          icon: '📄' },
  { key: 'aparelhos',    label: 'Compra & Venda',     icon: '📱' },
  { key: 'relatorios',   label: 'Relatórios',         icon: '📈' },
  { key: 'fechamento',   label: 'Fechamento',         icon: '🔒' },
  { key: 'rotinas',      label: 'Rotinas',            icon: '✅' },
  { key: 'configuracoes',label: 'Configurações',      icon: '⚙️' },
]

type PermissaoCargo = { id: string; cargo: string; modulo: string; permitido: boolean }
type UsuarioPerfil = { id: string; nome: string; email: string | null; papel: string; ativo: boolean; created_at: string }

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
  const [qCor, setQCor] = useState('#6366f1')
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

  // ── Fetch ────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
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
  useEffect(() => { if (activeMenu === 'historico') fetchHistorico() }, [activeMenu, fetchHistorico])
  useEffect(() => { if (activeMenu === 'usuarios') fetchUsuarios() }, [activeMenu, fetchUsuarios])
  useEffect(() => { if (activeMenu === 'permissoes') fetchPermissoes() }, [activeMenu, fetchPermissoes])

  // ── Usuários ─────────────────────────────────────────────
  function abrirUModal(u?: UsuarioPerfil) {
    if (u) { setUEditId(u.id); setUNome(u.nome); setUEmail(u.email ?? ''); setUPapel(u.papel as Cargo); setUAtivo(u.ativo) }
    else { setUEditId(null); setUNome(''); setUEmail(''); setUPapel('tecnico'); setUAtivo(true) }
    setUModal(true)
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
    setQSaving(false); setQEditId(null); setQNome(''); setQCor('#6366f1'); fetchAll()
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
          <label style={lbl}>{c.descricao ?? c.chave}</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {saved === chave && (
              <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '1px 8px', borderRadius: 20 }}>✓ Salvo</span>
            )}
            {modified && (
              <>
                <button onClick={() => cancelEdit(chave)} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancelar</button>
                <button onClick={() => salvarConfig(chave)} disabled={saving === chave || !!validationError} style={{ fontSize: 11, padding: '2px 10px', background: saving === chave || validationError ? '#e2e8f0' : '#6366f1', color: saving === chave || validationError ? '#94a3b8' : '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
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
            style={{ ...inp, borderColor: validationError ? '#fca5a5' : modified ? '#c7d2fe' : '#e2e8f0' }}
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
      <div key={chave} style={{ background: '#fff', border: `1px solid ${modified ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.descricao ?? c.chave}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {saved === chave && <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '2px 8px', borderRadius: 20 }}>✓ Salvo</span>}
            {modified && (
              <>
                <button onClick={() => cancelEdit(chave)} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => salvarConfig(chave)} disabled={saving === chave} style={{ fontSize: 11, padding: '3px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
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
          {MENU.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveMenu(item.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                textAlign: 'left', marginBottom: 2, fontSize: 13,
                background: activeMenu === item.key ? '#e0e7ff' : 'transparent',
                color: activeMenu === item.key ? '#3730a3' : '#374151',
                fontWeight: activeMenu === item.key ? 500 : 400,
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {item.label}
            </button>
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
                      style={{ fontSize: 12, padding: '6px 14px', border: '1px solid #c7d2fe', borderRadius: 7, background: '#eef2ff', color: '#4338ca', cursor: 'pointer' }}
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
                  onMouseEnter={e => { if (!logoUploading) (e.currentTarget as HTMLElement).style.borderColor = '#a5b4fc' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0' }}
                >
                  {logoUploading ? (
                    <p style={{ fontSize: 14, color: '#6366f1' }}>Enviando e redimensionando...</p>
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
                      <code style={{ fontSize: 14, color: '#6366f1', fontWeight: 700 }}>{preview}</code>
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
            <div style={{ ...card, border: '2px solid #c7d2fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <p style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Plano atual</p>
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
                  <button onClick={salvarQualidade} disabled={qSaving || !qNome.trim()} style={{ padding: '9px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {qSaving ? '...' : qEditId ? 'Salvar' : '+ Adicionar'}
                  </button>
                  {qEditId && (
                    <button onClick={() => { setQEditId(null); setQNome(''); setQCor('#6366f1') }} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                      Cancelar
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{qualidades.length}/10 qualidades cadastradas</p>
              </div>
            )}
          </div>
        )}

        {/* ── MODELOS WHATSAPP */}
        {activeMenu === 'whatsapp' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>💬 Modelos de WhatsApp</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Mensagens enviadas em cada situação. Use as variáveis abaixo.</p>
            <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#4338ca' }}>Variáveis:</span>
              {WA_VARS.map(v => <code key={v} style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 6 }}>{v}</code>)}
            </div>
            {['wa_os_recebida','wa_os_andamento','wa_os_pronta','wa_os_entregue','wa_aniversario','wa_cliente_inativo','wa_nunca_retornou','wa_retirada_90dias','wa_os_pronta_nao_retirada'].map(chave => renderWAField(chave))}
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
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>📱 PIX</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Chave PIX para recebimento.</p>
            <div style={card}>
              {renderField('pix_chave')}
              {renderField('pix_favorecido')}
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginTop: 8, fontSize: 13, color: '#92400e' }}>
                ⚠ A integração automática PIX (QR Code) está disponível no plano Enterprise.
              </div>
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
                <button onClick={assSalvar} disabled={assSaving || !assNova} style={{ marginLeft: 'auto', padding: '9px 22px', background: assSaving || !assNova ? '#e2e8f0' : '#6366f1', color: assSaving || !assNova ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: assSaving || !assNova ? 'not-allowed' : 'pointer' }}>
                  {assSaving ? 'Salvando...' : 'Salvar assinatura'}
                </button>
              </div>
            </div>
            <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#3730a3' }}>
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
              <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#3730a3' }}>
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
              <button onClick={() => abrirUModal()} style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
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
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            {u.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontWeight: 500, color: '#0f172a' }}>{u.nome}</p>
                            {u.email && <p style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#f1f5f9', color: '#374151', fontWeight: 500, textTransform: 'capitalize' }}>{u.papel}</span>
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
                      {CARGOS.map(c => <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
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
                    <button onClick={salvarUsuario} disabled={uSaving || !uNome.trim()} style={{ padding: '8px 18px', background: uSaving || !uNome.trim() ? '#e2e8f0' : '#6366f1', color: uSaving || !uNome.trim() ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
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
                      <th key={c} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: CARGOS_LOCKED.includes(c) ? '#6366f1' : '#64748b', textTransform: 'capitalize', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                        {c} {CARGOS_LOCKED.includes(c) ? '🔒' : ''}
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
                                background: permitido ? '#6366f1' : '#e2e8f0',
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
                        <td style={{ padding: '9px 14px' }}><code style={{ fontSize: 11, color: '#6366f1' }}>{h.chave}</code></td>
                        <td style={{ padding: '9px 14px', color: '#94a3b8', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_anterior?.slice(0, 30) ?? '—'}</td>
                        <td style={{ padding: '9px 14px', color: '#374151', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_novo.slice(0, 30)}</td>
                        <td style={{ padding: '9px 14px' }}><span style={{ fontSize: 10, background: '#eef2ff', color: '#4338ca', padding: '1px 6px', borderRadius: 20 }}>v{h.versao}</span></td>
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

      </div>
    </div>
  )
}
