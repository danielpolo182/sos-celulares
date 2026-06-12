'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Perfil = {
  id: string; nome: string; email: string | null
  papel: string; ativo: boolean; avatar_cor: string
}

// Cargo 'admin' Ã© imutÃ¡vel â€” definido no banco, nunca alterÃ¡vel pelo app
// Apenas gerente e abaixo podem ser atribuÃ­dos/alterados pela UI
const HIERARQUIA = ['admin', 'gerente', 'tecnico', 'atendente', 'caixa'] as const
type Cargo = typeof HIERARQUIA[number]
const CARGOS_UI = ['gerente', 'tecnico', 'atendente', 'caixa'] as const // admin excluÃ­do da UI

const CARGO_LABEL: Record<string, string> = {
  admin:     'Administrador',
  gerente:   'Gerente',
  tecnico:   'TÃ©cnico',
  atendente: 'Atendente',
  caixa:     'Caixa',
}

const CARGO_COR: Record<string, { bg: string; color: string }> = {
  admin:     { bg: '#dbeafe', color: '#1d4ed8' },
  gerente:   { bg: '#fef3c7', color: '#92400e' },
  tecnico:   { bg: '#ecfdf5', color: '#065f46' },
  atendente: { bg: '#f0f9ff', color: '#0369a1' },
  caixa:     { bg: '#eff6ff', color: '#7e22ce' },
}

const CORES = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#ec4899','#14b8a6']

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
  borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff',
  outline: 'none', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
}

export default function UsuariosPage() {
  const supabase = createClient()
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [meuCargo, setMeuCargo] = useState<Cargo>('atendente')
  const [meuId, setMeuId] = useState('')
  const [maxUsuarios, setMaxUsuarios] = useState(10)

  const [fNome, setFNome] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fSenha, setFSenha] = useState('')
  const [fPapel, setFPapel] = useState<Cargo>('tecnico')
  const [fCor, setFCor] = useState('#2563eb')
  const [fAtivo, setFAtivo] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setMeuId(user.id)
      const { data: eu } = await supabase.from('perfis').select('papel').eq('id', user.id).single()
      if (eu) setMeuCargo((eu.papel as Cargo) ?? 'atendente')
    }
    const [{ data: p }, { data: cfg }] = await Promise.all([
      supabase.from('perfis').select('id,nome,email,papel,ativo,avatar_cor').order('nome'),
      supabase.from('sistema_config').select('valor').eq('chave', 'max_usuarios_filial').single(),
    ])
    setPerfis((p ?? []) as Perfil[])
    if (cfg) setMaxUsuarios(parseInt(cfg.valor) || 10)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Cargos que o usuÃ¡rio atual pode atribuir â€” 'admin' NUNCA aparece na UI
  function cargosAtribuiveis(): typeof CARGOS_UI[number][] {
    if (meuCargo === 'admin') return [...CARGOS_UI]
    if (meuCargo === 'gerente') return CARGOS_UI.filter(c => c !== 'gerente')
    return []
  }

  function podeCriar() {
    return ['admin', 'gerente'].includes(meuCargo)
  }

  function podeEditar(perfil: Perfil) {
    // Admin nunca pode ser editado â€” cargo imutÃ¡vel pelo app
    if (perfil.papel === 'admin') return false
    if (meuCargo === 'admin') return true
    if (meuCargo === 'gerente') return !['admin', 'gerente'].includes(perfil.papel)
    return false
  }

  function abrirNovo() {
    const cargos = cargosAtribuiveis()
    setFNome(''); setFEmail(''); setFSenha('')
    setFPapel(cargos[0] ?? 'tecnico'); setFCor('#2563eb'); setFAtivo(true)
    setEditId(null); setErro(''); setSucesso(''); setShowModal(true)
  }

  function abrirEdit(p: Perfil) {
    setFNome(p.nome); setFEmail(p.email ?? ''); setFSenha('')
    setFPapel((p.papel === 'admin' ? 'gerente' : p.papel) as Cargo)
    setFCor(p.avatar_cor ?? '#2563eb'); setFAtivo(p.ativo)
    setEditId(p.id); setErro(''); setSucesso(''); setShowModal(true)
  }

  async function salvar() {
    if (!fNome.trim()) { setErro('Nome Ã© obrigatÃ³rio.'); return }
    if (!editId && !fEmail.trim()) { setErro('E-mail Ã© obrigatÃ³rio.'); return }
    if (!editId && fSenha.length < 6) { setErro('Senha deve ter pelo menos 6 caracteres.'); return }
    // 'admin' nunca pode ser atribuÃ­do pelo app â€” imutÃ¡vel

    setSaving(true); setErro(''); setSucesso('')

    if (editId) {
      const { error } = await supabase.from('perfis')
        .update({ nome: fNome.trim(), papel: fPapel, avatar_cor: fCor, ativo: fAtivo })
        .eq('id', editId)
      if (error) { setErro('Erro ao salvar: ' + error.message); setSaving(false); return }
      setSucesso('UsuÃ¡rio atualizado com sucesso!')
    } else {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: fEmail.trim(), password: fSenha,
        options: { data: { nome: fNome.trim() } }
      })
      if (authError) { setErro('Erro ao criar acesso: ' + authError.message); setSaving(false); return }
      if (authData.user) {
        const { error: perfilError } = await supabase.from('perfis').upsert({
          id: authData.user.id, nome: fNome.trim(), email: fEmail.trim(),
          papel: fPapel, avatar_cor: fCor, ativo: true,
        })
        if (perfilError) { setErro('UsuÃ¡rio criado mas erro no perfil: ' + perfilError.message); setSaving(false); return }
        setSucesso(`UsuÃ¡rio ${fNome} criado! E-mail de confirmaÃ§Ã£o enviado para ${fEmail}.`)
      }
    }

    setSaving(false)
    fetchAll()
  }

  async function toggleAtivo(p: Perfil) {
    // Admin nunca pode ser desativado pelo app
    if (p.papel === 'admin') {
      alert('O Administrador fundador nÃ£o pode ser desativado pelo app.')
      return
    }
    await supabase.from('perfis').update({ ativo: !p.ativo }).eq('id', p.id)
    fetchAll()
  }

  const ativos = perfis.filter(p => p.ativo).length
  const slots = maxUsuarios - ativos

  return (
    <div style={{ padding: '28px 36px', fontFamily: 'var(--font-sans)', maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>UsuÃ¡rios</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{ativos} de {maxUsuarios} slots utilizados</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/configuracoes?menu=permissoes" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', textDecoration: 'none', background: '#fff' }}>
            ðŸ” PermissÃµes por cargo
          </Link>
          {podeCriar() && (
            <button onClick={abrirNovo} disabled={slots <= 0} style={{ padding: '9px 18px', background: slots <= 0 ? '#e2e8f0' : '#2563eb', color: slots <= 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: slots <= 0 ? 'not-allowed' : 'pointer' }}>
              {slots <= 0 ? 'Limite atingido' : '+ Novo usuÃ¡rio'}
            </button>
          )}
        </div>
      </div>

      {/* Info hierarquia */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#0369a1' }}>
        ðŸ” O <strong>Administrador Fundador</strong> Ã© imutÃ¡vel e nÃ£o pode ser alterado pelo app.
        Gerentes podem criar e editar tÃ©cnicos, atendentes e caixas.
        Para alterar permissÃµes por cargo, acesse <Link href="/configuracoes?menu=permissoes" style={{ color: '#2563eb', fontWeight: 600 }}>ConfiguraÃ§Ãµes â†’ PermissÃµes</Link>.
      </div>

      {/* Slots */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: '#64748b' }}>Slots utilizados</span>
          <span style={{ fontWeight: 600, color: slots <= 2 ? '#ef4444' : '#374151' }}>{ativos}/{maxUsuarios}</span>
        </div>
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(ativos / maxUsuarios) * 100}%`, background: slots <= 2 ? '#ef4444' : '#2563eb', borderRadius: 4 }} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['UsuÃ¡rio', 'Cargo', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perfis.map(p => {
                const cor = CARGO_COR[p.papel] ?? { bg: '#f1f5f9', color: '#374151' }
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: p.ativo ? 1 : 0.5 }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: p.avatar_cor ?? '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                          {p.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontWeight: 500, color: '#0f172a' }}>
                            {p.nome}
                            {p.id === meuId && <span style={{ fontSize: 11, color: '#2563eb', marginLeft: 6 }}>(vocÃª)</span>}
                          </p>
                          {p.email && <p style={{ fontSize: 11, color: '#94a3b8' }}>{p.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: cor.bg, color: cor.color }}>
                          {CARGO_LABEL[p.papel] ?? p.papel}
                        </span>
                        {p.papel === 'admin' && (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#1e1b4b', color: '#93c5fd', fontWeight: 600 }}>
                            ðŸ” Fundador
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: p.ativo ? '#ecfdf5' : '#f1f5f9', color: p.ativo ? '#065f46' : '#94a3b8' }}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {p.papel === 'admin' ? (
                        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>protegido</span>
                      ) : podeEditar(p) ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => abrirEdit(p)} style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>Editar</button>
                          <button onClick={() => toggleAtivo(p)} style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: p.ativo ? '#ef4444' : '#10b981' }}>
                            {p.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{editId ? 'Editar usuÃ¡rio' : 'Novo usuÃ¡rio'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>Ã—</button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{erro}</div>}
              {sucesso && <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#065f46' }}>{sucesso}</div>}

              <div>
                <label style={lbl}>Nome completo *</label>
                <input style={inp} value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Nome do funcionÃ¡rio" />
              </div>

              {!editId && (
                <>
                  <div>
                    <label style={lbl}>E-mail de acesso *</label>
                    <input style={inp} type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@funcionario.com" />
                  </div>
                  <div>
                    <label style={lbl}>Senha inicial *</label>
                    <input style={inp} type="password" value={fSenha} onChange={e => setFSenha(e.target.value)} placeholder="MÃ­nimo 6 caracteres" />
                  </div>
                </>
              )}

              <div>
                <label style={lbl}>Cargo</label>
                <select style={inp} value={fPapel} onChange={e => setFPapel(e.target.value as Cargo)}>
                  {cargosAtribuiveis().map(c => (
                    <option key={c} value={c}>{CARGO_LABEL[c]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={lbl}>Cor do avatar</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CORES.map(c => (
                    <button key={c} onClick={() => setFCor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: fCor === c ? '3px solid #0f172a' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                  ))}
                </div>
              </div>

              {editId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={fAtivo} onChange={e => setFAtivo(e.target.checked)} />
                  UsuÃ¡rio ativo
                </label>
              )}

              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0369a1' }}>
                ðŸ’¡ Para ajustar as permissÃµes deste cargo, acesse{' '}
                <Link href="/configuracoes?menu=permissoes" style={{ color: '#2563eb', fontWeight: 600 }} onClick={() => setShowModal(false)}>ConfiguraÃ§Ãµes â†’ PermissÃµes</Link>.
              </div>
            </div>

            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                {sucesso ? 'Fechar' : 'Cancelar'}
              </button>
              {!sucesso && (
                <button onClick={salvar} disabled={saving} style={{ padding: '8px 18px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar usuÃ¡rio'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

