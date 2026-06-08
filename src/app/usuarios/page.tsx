'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Perfil = {
  id: string
  nome: string
  papel: string
  ativo: boolean
  avatar_cor: string
  acesso_os: boolean
  acesso_clientes: boolean
  acesso_pdv: boolean
  acesso_estoque: boolean
  acesso_crm: boolean
  acesso_garantias: boolean
  acesso_fornecedores: boolean
  acesso_rotinas: boolean
  acesso_dashboard: boolean
  acesso_financeiro: boolean
  acesso_config: boolean
  acesso_relatorios: boolean
}

const MODULOS = [
  { key: 'acesso_dashboard',    label: 'Dashboard',       icon: '⊞' },
  { key: 'acesso_os',           label: 'OS',              icon: '🔧' },
  { key: 'acesso_clientes',     label: 'Clientes',        icon: '👥' },
  { key: 'acesso_pdv',          label: 'PDV',             icon: '💳' },
  { key: 'acesso_estoque',      label: 'Estoque',         icon: '📦' },
  { key: 'acesso_garantias',    label: 'Garantias',       icon: '🛡' },
  { key: 'acesso_crm',          label: 'CRM',             icon: '📣' },
  { key: 'acesso_fornecedores', label: 'Fornecedores',    icon: '🏭' },
  { key: 'acesso_rotinas',      label: 'Rotinas',         icon: '✅' },
  { key: 'acesso_financeiro',   label: 'Financeiro',      icon: '💰' },
  { key: 'acesso_relatorios',   label: 'Relatórios',      icon: '📈' },
  { key: 'acesso_config',       label: 'Configurações',   icon: '⚙️' },
]

const PAPEL_PRESETS: Record<string, Record<string, boolean>> = {
  admin:     { acesso_dashboard: true,  acesso_os: true,  acesso_clientes: true,  acesso_pdv: true,  acesso_estoque: true,  acesso_crm: true,  acesso_garantias: true,  acesso_fornecedores: true,  acesso_rotinas: true,  acesso_financeiro: true,  acesso_relatorios: true,  acesso_config: true },
  gerente:   { acesso_dashboard: true,  acesso_os: true,  acesso_clientes: true,  acesso_pdv: true,  acesso_estoque: true,  acesso_crm: true,  acesso_garantias: true,  acesso_fornecedores: true,  acesso_rotinas: true,  acesso_financeiro: true,  acesso_relatorios: true,  acesso_config: false },
  tecnico:   { acesso_dashboard: true,  acesso_os: true,  acesso_clientes: false, acesso_pdv: false, acesso_estoque: true,  acesso_crm: false, acesso_garantias: true,  acesso_fornecedores: false, acesso_rotinas: true,  acesso_financeiro: false, acesso_relatorios: false, acesso_config: false },
  atendente: { acesso_dashboard: true,  acesso_os: true,  acesso_clientes: true,  acesso_pdv: true,  acesso_estoque: false, acesso_crm: true,  acesso_garantias: true,  acesso_fornecedores: false, acesso_rotinas: true,  acesso_financeiro: false, acesso_relatorios: false, acesso_config: false },
}

const CORES = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#ec4899','#14b8a6']

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

export default function UsuariosPage() {
  const supabase = createClient()
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [maxUsuarios, setMaxUsuarios] = useState(10)

  const [fNome, setFNome] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fSenha, setFSenha] = useState('')
  const [fPapel, setFPapel] = useState('atendente')
  const [fCor, setFCor] = useState('#6366f1')
  const [fAcessos, setFAcessos] = useState<Record<string, boolean>>(PAPEL_PRESETS.atendente)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: cfg }] = await Promise.all([
      supabase.from('perfis').select('*').order('nome'),
      supabase.from('sistema_config').select('valor').eq('chave', 'max_usuarios_filial').single(),
    ])
    setPerfis((p ?? []) as Perfil[])
    if (cfg) setMaxUsuarios(parseInt(cfg.valor) || 10)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  function aplicarPreset(papel: string) {
    setFPapel(papel)
    setFAcessos(PAPEL_PRESETS[papel] ?? PAPEL_PRESETS.atendente)
  }

  function abrirNovo() {
    setFNome(''); setFEmail(''); setFSenha(''); setFPapel('atendente')
    setFCor('#6366f1'); setFAcessos(PAPEL_PRESETS.atendente)
    setEditId(null); setErro(''); setSucesso(''); setShowModal(true)
  }

  function abrirEdit(p: Perfil) {
    setFNome(p.nome); setFEmail(''); setFSenha(''); setFPapel(p.papel)
    setFCor(p.avatar_cor ?? '#6366f1')
    const acessos: Record<string, boolean> = {}
    MODULOS.forEach(m => { acessos[m.key] = (p as any)[m.key] ?? false })
    setFAcessos(acessos); setEditId(p.id); setErro(''); setSucesso(''); setShowModal(true)
  }

  async function salvar() {
    if (!fNome.trim()) { setErro('Nome é obrigatório.'); return }
    if (!editId && !fEmail.trim()) { setErro('E-mail é obrigatório para criar o acesso.'); return }
    if (!editId && fSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }

    setSaving(true); setErro(''); setSucesso('')

    const permissoes = { nome: fNome.trim(), papel: fPapel, avatar_cor: fCor, ativo: true, ...fAcessos }

    if (editId) {
      // Só atualiza perfil existente
      const { error } = await supabase.from('perfis').update(permissoes).eq('id', editId)
      if (error) { setErro(`Erro ao salvar: ${error.message}`); setSaving(false); return }
      setSucesso('Permissões atualizadas com sucesso!')
    } else {
      // Cria usuário via signUp — cria conta e perfil ao mesmo tempo
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: fEmail.trim(),
        password: fSenha,
        options: {
          data: { nome: fNome.trim() },
          emailRedirectTo: undefined,
        }
      })

      if (authError) {
        setErro(`Erro ao criar acesso: ${authError.message}`)
        setSaving(false); return
      }

      if (authData.user) {
        // Cria o perfil vinculado ao usuário criado
        const { error: perfilError } = await supabase.from('perfis').upsert({
          id: authData.user.id,
          ...permissoes,
        })
        if (perfilError) { setErro(`Usuário criado mas erro no perfil: ${perfilError.message}`); setSaving(false); return }
        setSucesso(`Usuário ${fNome} criado! Um e-mail de confirmação foi enviado para ${fEmail}.`)
      }
    }

    setSaving(false)
    fetchAll()
    if (!editId) {
      setFNome(''); setFEmail(''); setFSenha('')
    }
  }

  async function toggleAtivo(p: Perfil) {
    await supabase.from('perfis').update({ ativo: !p.ativo }).eq('id', p.id)
    fetchAll()
  }

  const ativos = perfis.filter(p => p.ativo).length
  const slots = maxUsuarios - ativos

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Usuários & Permissões</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{ativos} de {maxUsuarios} slots · {slots} disponíveis</p>
        </div>
        <button onClick={abrirNovo} disabled={slots <= 0} style={{ padding: '9px 18px', background: slots <= 0 ? '#e2e8f0' : '#6366f1', color: slots <= 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: slots <= 0 ? 'not-allowed' : 'pointer' }}>
          {slots <= 0 ? 'Limite atingido' : '+ Novo usuário'}
        </button>
      </div>

      {/* Barra de slots */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
          <span style={{ color: '#64748b' }}>Slots utilizados</span>
          <span style={{ fontWeight: 600, color: slots <= 2 ? '#ef4444' : '#374151' }}>{ativos}/{maxUsuarios}</span>
        </div>
        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(ativos / maxUsuarios) * 100}%`, background: slots <= 2 ? '#ef4444' : '#6366f1', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        {slots <= 2 && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>⚠ Restam apenas {slots} slot(s). Entre em contato para ampliar o limite.</p>}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div>
      ) : perfis.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhum usuário cadastrado</p>
          <button onClick={abrirNovo} style={{ marginTop: 16, padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ Criar primeiro usuário</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {perfis.map(p => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', opacity: p.ativo ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: p.avatar_cor ?? '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                    {p.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.nome}</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', textTransform: 'capitalize' }}>{p.papel}</p>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: p.ativo ? '#ecfdf5' : '#f1f5f9', color: p.ativo ? '#065f46' : '#94a3b8', flexShrink: 0 }}>
                  {p.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {MODULOS.filter(m => (p as any)[m.key]).map(m => (
                  <span key={m.key} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, background: '#f0f4ff', color: '#4338ca', fontWeight: 500 }}>
                    {m.icon} {m.label}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => abrirEdit(p)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', cursor: 'pointer', color: '#374151' }}>Permissões</button>
                <button onClick={() => toggleAtivo(p)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#fff', cursor: 'pointer', color: p.ativo ? '#ef4444' : '#10b981' }}>
                  {p.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{editId ? 'Editar permissões' : 'Novo usuário'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{erro}</div>}
              {sucesso && <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#065f46' }}>{sucesso}</div>}

              {/* Dados pessoais */}
              <div>
                <label style={lbl}>Nome completo *</label>
                <input style={inp} value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Nome do funcionário" />
              </div>

              {!editId && (
                <>
                  <div>
                    <label style={lbl}>E-mail de acesso *</label>
                    <input style={inp} type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@funcionario.com" />
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Este e-mail será usado para fazer login no sistema.</p>
                  </div>
                  <div>
                    <label style={lbl}>Senha inicial *</label>
                    <input style={inp} type="password" value={fSenha} onChange={e => setFSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>O funcionário poderá alterar a senha depois no perfil dele.</p>
                  </div>
                </>
              )}

              {/* Papel + cor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={lbl}>Perfil base</label>
                  <select style={inp} value={fPapel} onChange={e => aplicarPreset(e.target.value)}>
                    <option value="admin">Admin — acesso total</option>
                    <option value="gerente">Gerente</option>
                    <option value="tecnico">Técnico</option>
                    <option value="atendente">Atendente</option>
                  </select>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Define as permissões padrão — você pode ajustar abaixo.</p>
                </div>
                <div>
                  <label style={lbl}>Cor do avatar</label>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 120 }}>
                    {CORES.map(c => (
                      <button key={c} onClick={() => setFCor(c)} style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: fCor === c ? '3px solid #0f172a' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Checklist de módulos */}
              <div>
                <label style={{ ...lbl, marginBottom: 8 }}>Módulos com acesso</label>
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {MODULOS.map(m => (
                    <div key={m.key} onClick={() => setFAcessos(a => ({ ...a, [m.key]: !a[m.key] }))} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 10px', borderRadius: 8, background: fAcessos[m.key] ? '#eef2ff' : '#fff', border: `1px solid ${fAcessos[m.key] ? '#c7d2fe' : '#e2e8f0'}`, transition: 'all 0.1s', userSelect: 'none' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${fAcessos[m.key] ? '#6366f1' : '#d1d5db'}`, background: fAcessos[m.key] ? '#6366f1' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.1s' }}>
                        {fAcessos[m.key] && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 12, color: fAcessos[m.key] ? '#3730a3' : '#374151', fontWeight: fAcessos[m.key] ? 500 : 400 }}>{m.icon} {m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                {sucesso ? 'Fechar' : 'Cancelar'}
              </button>
              {!sucesso && (
                <button onClick={salvar} disabled={saving} style={{ padding: '8px 18px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Salvando...' : editId ? 'Salvar permissões' : 'Criar usuário'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
