'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Config = {
  chave: string
  valor: string
  descricao: string | null
  categoria: string
}

type Perfil = {
  id: string
  papel: string
}

const CATEGORIAS: Record<string, { label: string; icon: string; descricao: string }> = {
  loja:        { label: 'Dados da loja',         icon: '🏪', descricao: 'Informações que aparecem na OS impressa e nos documentos' },
  operacional: { label: 'Parâmetros operacionais', icon: '⚙️', descricao: 'Prazos, dias e valores usados nas regras do sistema' },
  whatsapp:    { label: 'Mensagens WhatsApp',    icon: '💬', descricao: 'Textos enviados em cada situação. Use {nome}, {modelo}, {numero}, {valor}, {dias}' },
}

const VARIAVEIS_DISPONIVEIS = ['{nome}', '{modelo}', '{numero}', '{valor}', '{dias}', '{defeito}']

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const [configs, setConfigs] = useState<Config[]>([])
  const [meuPerfil, setMeuPerfil] = useState<Perfil | null>(null)
  const [acesso, setAcesso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [categoriaAtiva, setCategoriaAtiva] = useState('loja')
  const [editando, setEditando] = useState<Record<string, string>>({})

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfis').select('id,papel').eq('id', user.id).single()
      setMeuPerfil(p as Perfil | null)
      setAcesso(p?.papel === 'admin' || p?.papel === 'gerente')
    } else {
      // Se não tem perfil cadastrado, permite acesso (primeiro admin)
      setAcesso(true)
    }
    const { data } = await supabase.from('sistema_config').select('*').order('categoria').order('chave')
    setConfigs((data ?? []) as Config[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function salvarConfig(chave: string) {
    const novoValor = editando[chave]
    if (novoValor === undefined) return
    setSaving(chave)
    await supabase.from('sistema_config').update({ valor: novoValor, updated_at: new Date().toISOString() }).eq('chave', chave)
    setSaving(null)
    setSaved(chave)
    setTimeout(() => setSaved(null), 2000)
    fetchAll()
  }

  function onEdit(chave: string, valor: string) {
    setEditando(e => ({ ...e, [chave]: valor }))
  }

  function getValue(cfg: Config) {
    return editando[cfg.chave] !== undefined ? editando[cfg.chave] : cfg.valor
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando...</div>

  if (!acesso) return (
    <div style={{ padding: 80, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Acesso restrito</h2>
      <p style={{ fontSize: 14, color: '#64748b' }}>Somente administradores e gerentes podem acessar as configurações.</p>
    </div>
  )

  const configsPorCategoria = configs.filter(c => c.categoria === categoriaAtiva)

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* Sidebar de categorias */}
      <div style={{ width: 220, borderRight: '1px solid #e2e8f0', background: '#f8fafc', padding: '20px 12px', flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 8px', marginBottom: 10 }}>
          Configurações
        </p>
        {Object.entries(CATEGORIAS).map(([key, cat]) => (
          <button key={key} onClick={() => setCategoriaAtiva(key)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 10px', borderRadius: 8, marginBottom: 3,
            border: 'none', cursor: 'pointer', textAlign: 'left',
            background: categoriaAtiva === key ? '#e0e7ff' : 'transparent',
            color: categoriaAtiva === key ? '#3730a3' : '#374151',
            fontWeight: categoriaAtiva === key ? 500 : 400,
            fontSize: 13,
          }}>
            <span style={{ fontSize: 16 }}>{cat.icon}</span>
            {cat.label}
          </button>
        ))}

        <div style={{ marginTop: 20, padding: '12px 10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Perfil atual</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#374151', textTransform: 'capitalize' }}>{meuPerfil?.papel ?? 'Admin'}</p>
          <p style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>✓ Acesso total</p>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{CATEGORIAS[categoriaAtiva].icon}</span>
            {CATEGORIAS[categoriaAtiva].label}
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{CATEGORIAS[categoriaAtiva].descricao}</p>
        </div>

        {/* Variáveis disponíveis para mensagens WA */}
        {categoriaAtiva === 'whatsapp' && (
          <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#4338ca' }}>Variáveis disponíveis:</span>
            {VARIAVEIS_DISPONIVEIS.map(v => (
              <code key={v} style={{ fontSize: 12, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 6 }}>{v}</code>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {configsPorCategoria.map(cfg => {
            const isWA = cfg.categoria === 'whatsapp'
            const isSaving = saving === cfg.chave
            const isSaved = saved === cfg.chave
            const val = getValue(cfg)
            const modificado = editando[cfg.chave] !== undefined && editando[cfg.chave] !== cfg.valor

            return (
              <div key={cfg.chave} style={{ background: '#fff', border: `1px solid ${modificado ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 2 }}>{cfg.descricao ?? cfg.chave}</p>
                    <code style={{ fontSize: 11, color: '#94a3b8' }}>{cfg.chave}</code>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {modificado && !isSaved && (
                      <span style={{ fontSize: 11, color: '#4338ca', background: '#e0e7ff', padding: '2px 8px', borderRadius: 20 }}>Modificado</span>
                    )}
                    {isSaved && (
                      <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '2px 8px', borderRadius: 20 }}>✓ Salvo</span>
                    )}
                    {modificado && (
                      <button onClick={() => salvarConfig(cfg.chave)} disabled={isSaving} style={{
                        padding: '6px 14px', background: isSaving ? '#a5b4fc' : '#6366f1',
                        color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 500,
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                      }}>
                        {isSaving ? 'Salvando...' : 'Salvar'}
                      </button>
                    )}
                  </div>
                </div>

                {isWA ? (
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={val}
                      onChange={e => onEdit(cfg.chave, e.target.value)}
                      style={{
                        width: '100%', minHeight: 140, padding: '10px 12px',
                        border: '1px solid #e2e8f0', borderRadius: 8,
                        fontSize: 13, color: '#1e293b', background: '#fff',
                        outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                        lineHeight: 1.6,
                      }}
                    />
                    {/* Preview */}
                    <div style={{ marginTop: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px' }}>
                      <p style={{ fontSize: 11, color: '#0369a1', fontWeight: 500, marginBottom: 4 }}>Preview (com dados de exemplo)</p>
                      <p style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {val
                          .replace(/{nome}/g, 'João')
                          .replace(/{modelo}/g, 'Samsung A32')
                          .replace(/{numero}/g, '42')
                          .replace(/{valor}/g, '180,00')
                          .replace(/{dias}/g, '95')
                          .replace(/{defeito}/g, 'Tela quebrada')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <input
                    value={val}
                    onChange={e => onEdit(cfg.chave, e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px',
                      border: '1px solid #e2e8f0', borderRadius: 8,
                      fontSize: 13, color: '#1e293b', background: '#fff',
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
