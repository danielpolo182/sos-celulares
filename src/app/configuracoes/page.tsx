'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Config = { id: string; chave: string; valor: string; valor_padrao: string | null; descricao: string | null; categoria: string; versao: number }
type Perfil = { id: string; papel: string }
type Qualidade = { id: string; nome: string; cor_hex: string; ordem: number; ativo: boolean }
type NumeracaoConfig = { id: string; modulo: string; prefixo: string; usar_ano: boolean; usar_mes: boolean; sequencial: number; digitos: number; sufixo: string; reinicio: string }
type Historico = { id: string; chave: string; valor_anterior: string | null; valor_novo: string; versao: number; alterado_em: string; perfis: { nome: string } | null }
type Empresa = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; ie: string | null; im: string | null; telefone: string | null; whatsapp: string | null; email: string | null; site: string | null; logo_url: string | null }

type MenuSection = {
  key: string; icon: string; label: string
  subsections?: { key: string; label: string }[]
}

const MENU: MenuSection[] = [
  { key: 'geral',     icon: '⚙️', label: 'Geral',             subsections: [{ key: 'operacional', label: 'Parâmetros' }, { key: 'impressao', label: 'Impressão' }, { key: 'numeracao', label: 'Numeração' }] },
  { key: 'loja',      icon: '🏪', label: 'Dados da loja',     subsections: [] },
  { key: 'marca',     icon: '🎨', label: 'Marca & Logo',      subsections: [] },
  { key: 'plano',     icon: '💎', label: 'Meu plano',         subsections: [] },
  { key: 'usuarios',  icon: '👤', label: 'Usuários',          subsections: [{ key: 'perfis', label: 'Perfis de acesso' }, { key: 'qualidades', label: 'Qualidades de peças' }] },
  { key: 'whatsapp',  icon: '💬', label: 'Modelos WhatsApp',  subsections: [] },
  { key: 'pdv_cfg',   icon: '💳', label: 'PDV',               subsections: [] },
  { key: 'rotinas_cfg',icon: '✅', label: 'Rotinas',          subsections: [] },
  { key: 'integ',     icon: '🔌', label: 'Integrações',       subsections: [{ key: 'pix', label: 'PIX' }, { key: 'certificado', label: 'Certificado digital' }] },
  { key: 'assinatura',  icon: '✍️', label: 'Assinatura digital',  subsections: [] },
  { key: 'alertas',    icon: '🔔', label: 'Alertas',           subsections: [] },
  { key: 'historico',  icon: '📜', label: 'Histórico',         subsections: [] },
]

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }
const VARIAVEIS = ['{nome}','{modelo}','{numero}','{valor}','{dias}','{defeito}']
const MODULOS_NUM: Record<string, string> = { os: 'OS', venda: 'Venda', orcamento: 'Orçamento', cliente: 'Cliente', produto: 'Produto', fornecedor: 'Fornecedor' }
const CORES_PADRAO = ['#065f46','#1d4ed8','#92400e','#991b1b','#6b21a8','#0369a1','#374151','#b45309','#166534','#7c2d12']

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const [meuPerfil, setMeuPerfil] = useState<Perfil | null>(null)
  const [acesso, setAcesso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState('loja')
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({ geral: false, empresa: false, usuarios: false, integ: false })
  const [configs, setConfigs] = useState<Config[]>([])
  const [qualidades, setQualidades] = useState<Qualidade[]>([])
  const [numeracoes, setNumeracoes] = useState<NumeracaoConfig[]>([])
  const [historico, setHistorico] = useState<Historico[]>([])
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [empForm, setEmpForm] = useState<Partial<Empresa>>({})
  const [empSaving, setEmpSaving] = useState(false)
  const [empSaved, setEmpSaved] = useState(false)

  // Qualidades
  const [qEditId, setQEditId] = useState<string | null>(null)
  const [qNome, setQNome] = useState('')
  const [qCor, setQCor] = useState('#6366f1')
  const [qSaving, setQSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfis').select('id,papel').eq('id', user.id).single()
      setMeuPerfil(p as Perfil | null)
      setAcesso(!p || p?.papel === 'admin' || p?.papel === 'gerente')
    } else { setAcesso(true) }

    const [{ data: c }, { data: q }, { data: n }, { data: e }] = await Promise.all([
      supabase.from('sistema_config').select('*').order('categoria').order('chave'),
      supabase.from('produto_qualidades').select('*').order('ordem'),
      supabase.from('numeracao_config').select('*').order('modulo'),
      supabase.from('empresas').select('*').single(),
    ])
    setConfigs((c ?? []) as Config[])
    setQualidades((q ?? []) as Qualidade[])
    setNumeracoes((n ?? []) as NumeracaoConfig[])
    if (e) { setEmpresa(e as Empresa); setEmpForm(e) }
    setLoading(false)
  }, [supabase])

  const fetchHistorico = useCallback(async () => {
    const { data } = await supabase.from('config_historico').select('*,perfis:usuario_id(nome)').order('alterado_em', { ascending: false }).limit(50)
    setHistorico((data ?? []) as unknown as Historico[])
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (activeMenu === 'historico') fetchHistorico() }, [activeMenu, fetchHistorico])

  function getConfig(chave: string) { return configs.find(c => c.chave === chave) }
  function getVal(chave: string) { const c = getConfig(chave); if (!c) return ''; return editando[c.id] !== undefined ? editando[c.id] : c.valor }
  function onEdit(chave: string, valor: string) { const c = getConfig(chave); if (c) setEditando(e => ({ ...e, [c.id]: valor })) }
  function isModified(chave: string) { const c = getConfig(chave); return c && editando[c.id] !== undefined && editando[c.id] !== c.valor }

  async function salvarConfig(chave: string) {
    const c = getConfig(chave); if (!c) return
    setSaving(chave)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('sistema_config').update({ valor: editando[c.id], atualizado_por: user?.id }).eq('id', c.id)
    setSaving(null); setSaved(chave); setTimeout(() => setSaved(null), 2000); fetchAll()
  }

  async function salvarEmpresa() {
    if (!empresa) return
    setEmpSaving(true)
    await supabase.from('empresas').update({ ...empForm, updated_at: new Date().toISOString() }).eq('id', empresa.id)
    setEmpSaving(false); setEmpSaved(true); setTimeout(() => setEmpSaved(false), 2000)
  }

  async function salvarQualidade() {
    if (!qNome.trim()) return
    setQSaving(true)
    if (qEditId) {
      await supabase.from('produto_qualidades').update({ nome: qNome.trim(), cor_hex: qCor }).eq('id', qEditId)
    } else {
      const maxOrdem = qualidades.length > 0 ? Math.max(...qualidades.map(q => q.ordem)) + 1 : 1
      await supabase.from('produto_qualidades').insert({ nome: qNome.trim(), cor_hex: qCor, ordem: maxOrdem })
    }
    setQSaving(false); setQEditId(null); setQNome(''); setQCor('#6366f1'); fetchAll()
  }

  async function toggleQualidade(q: Qualidade) { await supabase.from('produto_qualidades').update({ ativo: !q.ativo }).eq('id', q.id); fetchAll() }

  async function salvarNumeracao(n: NumeracaoConfig, field: string, value: any) { await supabase.from('numeracao_config').update({ [field]: value }).eq('id', n.id); fetchAll() }

  async function reverterConfig(h: Historico) {
    if (!h.valor_anterior) return
    // Buscar o id real da config pelo chave
    const { data: cfg, error } = await supabase
      .from('sistema_config')
      .select('id,valor')
      .eq('chave', h.chave)
      .eq('escopo', 'global')
      .single()
    if (error || !cfg) {
      alert(`Erro ao encontrar configuração "${h.chave}": ${error?.message}`)
      return
    }
    const { error: updateError } = await supabase
      .from('sistema_config')
      .update({ valor: h.valor_anterior })
      .eq('id', cfg.id)
    if (updateError) {
      alert(`Erro ao reverter: ${updateError.message}`)
      return
    }
    // Forçar reload completo dos dados
    await fetchAll()
    await fetchHistorico()
  }

  function toggleMenu(key: string) { setOpenMenus(m => ({ ...m, [key]: !m[key] })) }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando...</div>
  if (!acesso) return <div style={{ padding: 80, textAlign: 'center', fontFamily: 'var(--font-sans)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div><p style={{ fontSize: 16, color: '#374151' }}>Acesso restrito a admin e gerente.</p></div>

  // Helpers de render (não são componentes — não causam remount)
  const renderField = (chave: string, type = 'text', options?: { v: string; l: string }[]) => {
    const c = getConfig(chave); if (!c) return null
    const val = getVal(chave); const modified = isModified(chave)
    return (
      <div key={chave} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label style={lbl}>{c.descricao ?? c.chave}</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {saved === chave && <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '1px 8px', borderRadius: 20 }}>✓ Salvo</span>}
            {modified && <>
              <button onClick={() => setEditando(e => { const n = {...e}; delete n[c.id]; return n })} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancelar</button>
              <button onClick={() => salvarConfig(chave)} disabled={saving === chave} style={{ fontSize: 11, padding: '2px 10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{saving === chave ? '...' : 'Salvar'}</button>
            </>}
          </div>
        </div>
        {options ? (
          <select style={inp} value={val} onChange={e => onEdit(chave, e.target.value)}>
            {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : (
          <input style={{ ...inp, borderColor: modified ? '#c7d2fe' : '#e2e8f0' }} type={type} value={val} onChange={e => onEdit(chave, e.target.value)} />
        )}
      </div>
    )
  }

  const renderWAField = (chave: string) => {
    const c = getConfig(chave); if (!c) return null
    const val = getVal(chave); const modified = isModified(chave)
    const VARIAVEIS_PREVIEW: Record<string, string> = { '{nome}':'João', '{modelo}':'Samsung A32', '{numero}':'42', '{valor}':'180,00', '{dias}':'95', '{defeito}':'Tela quebrada' }
    const preview = val.replace(/\{[^}]+\}/g, (m: string) => VARIAVEIS_PREVIEW[m] ?? m)
    return (
      <div key={chave} style={{ background: '#fff', border: `1px solid ${modified ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.descricao ?? c.chave}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {saved === chave && <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '2px 8px', borderRadius: 20 }}>✓ Salvo</span>}
            {modified && <>
              <button onClick={() => setEditando(e => { const n = {...e}; delete n[c.id]; return n })} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => salvarConfig(chave)} disabled={saving === chave} style={{ fontSize: 11, padding: '3px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{saving === chave ? '...' : 'Salvar'}</button>
            </>}
          </div>
        </div>
        <textarea value={val} onChange={e => onEdit(chave, e.target.value)} style={{ ...inp, minHeight: 100, resize: 'vertical', lineHeight: 1.7, marginBottom: 8 }} />
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 7, padding: '8px 12px' }}>
          <p style={{ fontSize: 11, color: '#0369a1', fontWeight: 500, marginBottom: 3 }}>Preview</p>
          <p style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{preview}</p>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{ width: 240, borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Configurações</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, textTransform: 'capitalize' }}>{meuPerfil?.papel ?? 'Admin'} · acesso total</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
          {MENU.map(item => {
            const hasChildren = item.subsections && item.subsections.length > 0
            const isOpen = openMenus[item.key]
            const isActive = activeMenu === item.key || item.subsections?.some(s => s.key === activeMenu)
            return (
              <div key={item.key}>
                <button onClick={() => { if (hasChildren) { toggleMenu(item.key); if (!isOpen) setActiveMenu(item.subsections![0].key) } else setActiveMenu(item.key) }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 2,
                  background: isActive ? '#e0e7ff' : 'transparent', color: isActive ? '#3730a3' : '#374151', fontWeight: isActive ? 500 : 400, fontSize: 13,
                }}>
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {hasChildren && <span style={{ fontSize: 10, opacity: 0.6, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>}
                </button>
                {hasChildren && isOpen && item.subsections!.map(sub => (
                  <button key={sub.key} onClick={() => setActiveMenu(sub.key)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px 7px 26px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 2,
                    background: activeMenu === sub.key ? '#e0e7ff' : 'transparent', color: activeMenu === sub.key ? '#3730a3' : '#64748b', fontSize: 12, fontWeight: activeMenu === sub.key ? 500 : 400,
                  }}>
                    — {sub.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>

        {/* ── DADOS DA LOJA */}
        {activeMenu === 'loja' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🏪 Dados da loja</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              Todas as informações aparecem na OS impressa, recibos e documentos legais.
            </p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>Identificação</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div style={{ gridColumn: '1/-1' }}>{renderField("loja_nome")}</div>
                {renderField("loja_nome_fantasia")}
                {renderField("loja_cnpj")}
                {renderField("loja_ie")}
                {renderField("loja_im")}
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>Contato</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                {renderField("loja_telefone")}
                {renderField("loja_whatsapp")}
                {renderField("loja_email")}
                {renderField("loja_site")}
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>Endereço e funcionamento</p>
              {renderField("loja_endereco")}
              {renderField("loja_horario")}
            </div>
          </div>
        )}

        {/* ── PARÂMETROS OPERACIONAIS */}
        {activeMenu === 'operacional' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>⚙️ Parâmetros operacionais</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Prazos e valores usados nas regras do sistema.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              {renderField("garantia_dias", "number")}
              {renderField("retirada_prazo_dias", "number")}
              {renderField("retirada_taxa_mensal", "number")}
              {renderField("os_pronta_alerta_dias", "number")}
              {renderField("cliente_inativo_dias", "number")}
            </div>
          </div>
        )}

        {/* ── IMPRESSÃO */}
        {activeMenu === 'impressao' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🖨 Impressão</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Formato de recibo por tipo de documento.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              {renderField("recibo_pdv_formato", "text", {[{v:'58mm',l:'58mm (bobina pequena)'},{v:'80mm',l:'80mm (bobina padrão)'},{v:'a4',l:'A4 (folha normal)'}]})}
              {renderField("recibo_os_formato", "text", {[{v:'a4',l:'A4 (padrão)'},{v:'a5',l:'A5'},{v:'80mm',l:'80mm'}]})}
              {renderField("recibo_garantia_formato", "text", {[{v:'58mm',l:'58mm'},{v:'80mm',l:'80mm'},{v:'a4',l:'A4'}]})}
            </div>
          </div>
        )}

        {/* ── NUMERAÇÃO */}
        {activeMenu === 'numeracao' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🔢 Numeração por módulo</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Configure o formato dos números gerados em cada módulo.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {numeracoes.map(n => {
                const preview = [n.prefixo, n.usar_ano ? new Date().getFullYear() : '', n.usar_mes ? String(new Date().getMonth()+1).padStart(2,'0') : '', String(n.sequencial).padStart(n.digitos,'0'), n.sufixo].filter(Boolean).join('')
                return (
                  <div key={n.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{MODULOS_NUM[n.modulo] ?? n.modulo}</p>
                      <code style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>{preview}</code>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                      <div><label style={lbl}>Prefixo</label><input style={inp} defaultValue={n.prefixo} onBlur={e => salvarNumeracao(n,'prefixo',e.target.value)} /></div>
                      <div><label style={lbl}>Dígitos</label><input style={inp} type="number" min="1" max="10" defaultValue={n.digitos} onBlur={e => salvarNumeracao(n,'digitos',parseInt(e.target.value))} /></div>
                      <div><label style={lbl}>Reinício</label>
                        <select style={inp} defaultValue={n.reinicio} onChange={e => salvarNumeracao(n,'reinicio',e.target.value)}>
                          <option value="nunca">Nunca</option><option value="anual">Anual</option><option value="mensal">Mensal</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}><input type="checkbox" defaultChecked={n.usar_ano} onChange={e => salvarNumeracao(n,'usar_ano',e.target.checked)} /> Incluir ano</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}><input type="checkbox" defaultChecked={n.usar_mes} onChange={e => salvarNumeracao(n,'usar_mes',e.target.checked)} /> Incluir mês</label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── DADOS DA EMPRESA */}
        {/* ── MARCA */}
        {activeMenu === 'marca' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🎨 Marca & Logo</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Logo da empresa que aparece nas OS impressas, recibos e documentos.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              <input
                type="file"
                id="logo-input"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file || !empresa) return
                  const ext = file.name.split('.').pop()
                  const path = `logos/${empresa.id}.${ext}`
                  const { error } = await supabase.storage.from('produto-fotos').upload(path, file, { upsert: true })
                  if (!error) {
                    const { data: urlData } = supabase.storage.from('produto-fotos').getPublicUrl(path)
                    await supabase.from('empresas').update({ logo_url: urlData.publicUrl }).eq('id', empresa.id)
                    fetchAll()
                  }
                }}
              />
              <div
                onClick={() => document.getElementById('logo-input')?.click()}
                style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '40px 20px', textAlign: 'center', marginBottom: 16, cursor: 'pointer', background: '#f8fafc', transition: 'border-color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#a5b4fc' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0' }}
              >
                {empresa?.logo_url ? (
                  <div>
                    <img src={empresa.logo_url} style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', marginBottom: 8 }} alt="Logo" />
                    <p style={{ fontSize: 12, color: '#6366f1' }}>Clique para trocar o logo</p>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Clique para enviar o logo</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>PNG, JPG, WEBP — recomendado 400×200px</p>
                  </>
                )}
              </div>
              {empresa?.logo_url && (
                <button
                  onClick={async () => {
                    if (!empresa) return
                    await supabase.from('empresas').update({ logo_url: null }).eq('id', empresa.id)
                    fetchAll()
                  }}
                  style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Remover logo
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── MEU PLANO */}
        {activeMenu === 'plano' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>💎 Meu plano</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Informações sobre o plano contratado e limites.</p>
            <div style={{ background: '#fff', border: '2px solid #c7d2fe', borderRadius: 12, padding: '24px 28px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 11, color: '#6366f1', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Plano atual</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Profissional</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, background: '#ecfdf5', color: '#065f46', padding: '5px 14px', borderRadius: 20 }}>✓ Ativo</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Filiais', value: '1 / 1', icon: '🏪' },
                  { label: 'Usuários', value: '3 / 10', icon: '👤' },
                  { label: 'OS este mês', value: '47', icon: '🔧' },
                ].map(m => (
                  <div key={m.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{m.value}</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>{m.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#92400e' }}>
              Para alterar o plano, adicionar filiais ou aumentar o limite de usuários, entre em contato com o suporte.
            </div>
          </div>
        )}

        {/* ── QUALIDADES DE PEÇAS */}
        {activeMenu === 'qualidades' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🏷 Qualidades de peças</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Defina até 10 tipos de qualidade. Usados no orçamento de OS e no estoque.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px', marginBottom: 16 }}>
              {qualidades.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < qualidades.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: q.cor_hex, flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', flex: 1 }}>{q.nome}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setQEditId(q.id); setQNome(q.nome); setQCor(q.cor_hex) }} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>Editar</button>
                    <button onClick={() => toggleQualidade(q)} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: q.ativo ? '#ef4444' : '#10b981' }}>{q.ativo ? 'Desativar' : 'Ativar'}</button>
                  </div>
                </div>
              ))}
            </div>
            {qualidades.length < 10 && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>{qEditId ? 'Editar qualidade' : '+ Nova qualidade'}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}><label style={lbl}>Nome</label><input style={inp} value={qNome} onChange={e => setQNome(e.target.value)} placeholder="Ex: Semi-original" /></div>
                  <div>
                    <label style={lbl}>Cor</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {CORES_PADRAO.map(c => <button key={c} onClick={() => setQCor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: qCor === c ? '3px solid #0f172a' : '2px solid transparent', cursor: 'pointer' }} />)}
                    </div>
                  </div>
                  <button onClick={salvarQualidade} disabled={qSaving || !qNome.trim()} style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {qSaving ? '...' : qEditId ? 'Salvar' : '+ Adicionar'}
                  </button>
                  {qEditId && <button onClick={() => { setQEditId(null); setQNome(''); setQCor('#6366f1') }} style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>}
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
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Mensagens enviadas automaticamente em cada situação.</p>
            <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#4338ca' }}>Variáveis:</span>
              {VARIAVEIS.map(v => <code key={v} style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 6 }}>{v}</code>)}
            </div>
            {['wa_os_recebida','wa_os_andamento','wa_os_pronta','wa_os_entregue','wa_aniversario','wa_cliente_inativo','wa_nunca_retornou','wa_retirada_90dias','wa_os_pronta_nao_retirada'].map(chave => {renderWAField(chave)})}
          </div>
        )}

        {/* ── PDV */}
        {activeMenu === 'pdv_cfg' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>💳 PDV</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Configurações do ponto de venda.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              {renderField("pdv_modo_visualizacao", "text", {[{v:'padrao',l:'Padrão'},{v:'touch',l:'Touch (tablet)'},{v:'visual',l:'Visual (grade grande)'}]})}
              {renderField("pdv_permite_desconto", "text", {[{v:'true',l:'Sim'},{v:'false',l:'Não'}]})}
              {renderField("pdv_desconto_maximo", "number")}
              {renderField("pdv_exige_cliente", "text", {[{v:'true',l:'Sim'},{v:'false',l:'Não'}]})}
              {renderField("caixa_valor_abertura", "number")}
            </div>
          </div>
        )}

        {/* ── ROTINAS */}
        {activeMenu === 'rotinas_cfg' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>✅ Rotinas</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Configurações do módulo de rotinas e integração com WhatsApp.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              {renderField("rotinas_wa_ativo", "text", {[{v:'true',l:'Ativo — mostra sublista WhatsApp nas rotinas'},{v:'false',l:'Inativo'}]})}
              {renderField("rotinas_wa_aniversario", "text", {[{v:'true',l:'Sim'},{v:'false',l:'Não'}]})}
              {renderField("rotinas_wa_os_pronta", "text", {[{v:'true',l:'Sim'},{v:'false',l:'Não'}]})}
              {renderField("rotinas_wa_90dias", "text", {[{v:'true',l:'Sim'},{v:'false',l:'Não'}]})}
              {renderField("rotinas_wa_inativos", "text", {[{v:'true',l:'Sim'},{v:'false',l:'Não'}]})}
            </div>
          </div>
        )}

        {/* ── PIX */}
        {activeMenu === 'pix' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>📱 PIX</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Configuração da chave PIX para recebimento.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              {renderField("pix_chave")}{renderField("pix_favorecido")}
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginTop: 8, fontSize: 13, color: '#92400e' }}>
                ⚠ A integração automática PIX (geração de QR Code) está disponível no plano Enterprise. Entre em contato para habilitar.
              </div>
            </div>
          </div>
        )}

        {/* ── CERTIFICADO */}
        {activeMenu === 'certificado' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🔐 Certificado digital</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Necessário para emissão de NF-e.</p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px' }}>
              <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Clique para enviar o certificado .pfx</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Arquivo .pfx ou .p12</p>
              </div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Senha do certificado</label><input style={inp} type="password" placeholder="••••••••" /></div>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#92400e' }}>
                ⚠ Emissão de NF-e disponível no plano Enterprise. O certificado fica criptografado e seguro.
              </div>
            </div>
          </div>
        )}

        {/* ── ASSINATURA DIGITAL */}
        {activeMenu === 'assinatura' && (
          <AssinaturaSection supabase={supabase} />
        )}

        {/* ── ALERTAS */}
        {activeMenu === 'alertas' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🔔 Estratégia de alertas</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Configure os dias em que o sistema deve alertar para cada situação. Os alertas aparecem nas rotinas, CRM e fechamento do dia.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>⏰ OS pronta não retirada</p>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Dias após ficar pronta para enviar alerta de cobrança de retirada.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {renderField("alerta_os_pronta_1", "number")}
                  {renderField("alerta_os_pronta_2", "number")}
                  {renderField("alerta_os_pronta_3", "number")}
                  {renderField("alerta_os_pronta_4", "number")}
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>📦 Aparelho retido além do prazo</p>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Dias de retenção para escalar os alertas de cobrança de armazenamento.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {renderField("alerta_aparelho_1", "number")}
                  {renderField("alerta_aparelho_2", "number")}
                  {renderField("alerta_aparelho_3", "number")}
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>😴 Cliente inativo</p>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Dias sem OS para escalar os alertas de reengajamento.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {renderField("alerta_cliente_inativo_1", "number")}
                  {renderField("alerta_cliente_inativo_2", "number")}
                  {renderField("alerta_cliente_inativo_3", "number")}
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>🏭 Resposta do fornecedor</p>
                {renderField("alerta_garantia_resposta", "number")}
              </div>
              <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#3730a3' }}>
                💡 Estes valores alimentam automaticamente as rotinas diárias, o CRM, o fechamento do dia e a view de pendências de WhatsApp.
              </div>
            </div>
          </div>
        )}

        {/* ── HISTÓRICO */}
        {activeMenu === 'historico' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>📜 Histórico de alterações</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Todas as mudanças com possibilidade de reverter.</p>
            {historico.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}><div style={{ fontSize: 40, marginBottom: 12 }}>📜</div><p>Nenhuma alteração registrada ainda.</p></div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Configuração','Anterior','Novo','v.','Usuário','Quando',''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {historico.map(h => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}><code style={{ fontSize: 11, color: '#6366f1' }}>{h.chave}</code></td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 12,  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_anterior?.slice(0,30) ?? '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#374151', fontSize: 12,  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_novo.slice(0,30)}</td>
                        <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 10, background: '#eef2ff', color: '#4338ca', padding: '1px 6px', borderRadius: 20 }}>v{h.versao}</span></td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{(h.perfis as any)?.nome ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8' }}>{new Date(h.alterado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {h.valor_anterior && <button onClick={async (e) => { const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Revertendo...'; await reverterConfig(h); btn.disabled = false; btn.textContent = '↩ Reverter' }} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #fde68a', borderRadius: 6, background: '#fef3c7', cursor: 'pointer', color: '#92400e' }}>↩ Reverter</button>}
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

// ─── AssinaturaSection — FORA do componente principal para evitar remount ───
function AssinaturaSection({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [assinatura, setAssinatura] = useState('')
  const [assinaturaAtual, setAssinaturaAtual] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (!user) return
      supabase.from('usuario_assinaturas').select('assinatura').eq('usuario_id', user.id).maybeSingle()
        .then(({ data }: any) => { if (data?.assinatura) setAssinaturaAtual(data.assinatura) })
    })
  }, [supabase])

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    setDrawing(true)
    const c = canvasRef.current; if (!c) return
    const r = c.getBoundingClientRect()
    const ctx = c.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
  }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing) return
    const c = canvasRef.current; if (!c) return
    const r = c.getBoundingClientRect()
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke()
  }
  function onUp() {
    setDrawing(false)
    setAssinatura(canvasRef.current?.toDataURL() ?? '')
  }
  function limpar() {
    const c = canvasRef.current; if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setAssinatura('')
  }

  async function salvar() {
    if (!assinatura) return
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSalvando(false); return }
    await supabase.from('usuario_assinaturas')
      .upsert({ usuario_id: user.id, assinatura, updated_at: new Date().toISOString() }, { onConflict: 'usuario_id' })
    setAssinaturaAtual(assinatura)
    setSalvando(false); setSalvo(true); setTimeout(() => setSalvo(false), 2500)
  }

  const sl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>✍️ Assinatura digital</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
        Sua assinatura aparece automaticamente nos termos de compra e venda, OS e contratos gerados pelo sistema.
      </p>

      {assinaturaAtual && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }}>
          <label style={sl}>Assinatura atual</label>
          <div style={{ background: '#fafafa', padding: 8, borderRadius: 8, border: '1px solid #f1f5f9', display: 'inline-block' }}>
            <img src={assinaturaAtual} style={{ maxHeight: 70, display: 'block' }} alt="Assinatura atual" />
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }}>
        <label style={{ ...sl, marginBottom: 10 }}>{assinaturaAtual ? 'Atualizar assinatura' : 'Desenhe sua assinatura'}</label>
        <div style={{ position: 'relative', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fafafa', display: 'inline-block' }}>
          <canvas
            ref={canvasRef} width={520} height={140}
            style={{ display: 'block', cursor: 'crosshair', borderRadius: 10 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          />
          {!assinatura && (
            <p style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#cbd5e1', fontSize: 14, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>
              Assine aqui com o mouse...
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          {assinatura && (
            <button onClick={limpar} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Limpar
            </button>
          )}
          {salvo && (
            <span style={{ fontSize: 12, color: '#065f46', background: '#ecfdf5', padding: '4px 12px', borderRadius: 20 }}>✓ Salvo!</span>
          )}
          <button
            onClick={salvar}
            disabled={salvando || !assinatura}
            style={{ marginLeft: 'auto', padding: '9px 22px', background: salvando || !assinatura ? '#e2e8f0' : '#6366f1', color: salvando || !assinatura ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando || !assinatura ? 'not-allowed' : 'pointer' }}
          >
            {salvando ? 'Salvando...' : 'Salvar assinatura'}
          </button>
        </div>
      </div>

      <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#3730a3' }}>
        💡 Esta assinatura é vinculada ao seu usuário. Em todos os documentos gerados ela aparecerá como <strong>assinatura do responsável da loja</strong>.
      </div>
    </div>
  )
}
