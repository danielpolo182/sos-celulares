'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Config = {
  id: string
  chave: string
  valor: string
  valor_padrao: string | null
  descricao: string | null
  categoria: string
  escopo: string
  filial_id: string | null
  versao: number
  permite_override: boolean
  obrigatorio: boolean
}

type Historico = {
  id: string
  chave: string
  valor_anterior: string | null
  valor_novo: string
  versao: number
  alterado_em: string
  perfis: { nome: string } | null
}

type NumeracaoConfig = {
  id: string
  modulo: string
  prefixo: string
  usar_ano: boolean
  usar_mes: boolean
  sequencial: number
  digitos: number
  sufixo: string
  reinicio: string
}

type Perfil = { id: string; papel: string }
type Filial = { id: string; nome: string }

const CATEGORIAS_CONFIG: Record<string, { label: string; icon: string; descricao: string }> = {
  loja:        { label: 'Dados da loja',          icon: '🏪', descricao: 'Nome, endereço, telefone e CNPJ — aparecem na OS impressa' },
  operacional: { label: 'Parâmetros operacionais', icon: '⚙️', descricao: 'Prazos, dias e valores usados nas regras do sistema' },
  whatsapp:    { label: 'Mensagens WhatsApp',      icon: '💬', descricao: 'Textos editáveis com preview. Variáveis: {nome}, {modelo}, {numero}, {valor}, {dias}' },
  impressao:   { label: 'Impressão',               icon: '🖨',  descricao: 'Formato de recibo por tipo de documento' },
  pdv:         { label: 'PDV',                     icon: '💳', descricao: 'Comportamento do ponto de venda' },
  rotinas:     { label: 'Rotinas & WhatsApp',      icon: '✅', descricao: 'Configurações das rotinas e integração com WhatsApp' },
  usuarios:    { label: 'Usuários',                icon: '👤', descricao: 'Limites e configurações de usuários' },
}

const MODULOS_NUMERACAO: Record<string, string> = {
  os: 'Ordem de Serviço', venda: 'Venda PDV', orcamento: 'Orçamento',
  cliente: 'Cliente', produto: 'Produto', fornecedor: 'Fornecedor',
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

const VARIAVEIS = ['{nome}', '{modelo}', '{numero}', '{valor}', '{dias}', '{defeito}']

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const [meuPerfil, setMeuPerfil] = useState<Perfil | null>(null)
  const [acesso, setAcesso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [categoriaAtiva, setCategoriaAtiva] = useState('loja')
  const [abaAtiva, setAbaAtiva] = useState<'configs' | 'numeracao' | 'historico' | 'empresa'>('configs')
  const [configs, setConfigs] = useState<Config[]>([])
  const [numeracoes, setNumeracoes] = useState<NumeracaoConfig[]>([])
  const [historico, setHistorico] = useState<Historico[]>([])
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [filialSelecionada, setFilialSelecionada] = useState<string>('global')
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [revertendo, setRevertendo] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfis').select('id,papel').eq('id', user.id).single()
      setMeuPerfil(p as Perfil | null)
      setAcesso(p?.papel === 'admin' || p?.papel === 'gerente')
    } else { setAcesso(true) }

    const [{ data: c }, { data: n }, { data: f }] = await Promise.all([
      supabase.from('sistema_config').select('*').order('categoria').order('chave'),
      supabase.from('numeracao_config').select('*').order('modulo'),
      supabase.from('filiais').select('id,nome').order('nome'),
    ])
    setConfigs((c ?? []) as Config[])
    setNumeracoes((n ?? []) as NumeracaoConfig[])
    setFiliais((f ?? []) as Filial[])
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

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (abaAtiva === 'historico') fetchHistorico() }, [abaAtiva, fetchHistorico])

  async function salvarConfig(cfg: Config) {
    const novoValor = editando[cfg.id]
    if (novoValor === undefined || novoValor === cfg.valor) return
    setSaving(cfg.id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('sistema_config').update({
      valor: novoValor,
      atualizado_por: user?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', cfg.id)
    setSaving(null); setSaved(cfg.id)
    setTimeout(() => setSaved(null), 2000)
    fetchAll()
  }

  async function reverterConfig(h: Historico) {
    setRevertendo(h.id)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: cfg } = await supabase.from('sistema_config').select('id').eq('chave', h.chave).single()
    if (cfg && h.valor_anterior) {
      await supabase.from('sistema_config').update({
        valor: h.valor_anterior,
        atualizado_por: user?.id,
      }).eq('id', cfg.id)
    }
    setRevertendo(null); fetchAll(); fetchHistorico()
  }

  async function salvarNumeracao(n: NumeracaoConfig, field: string, value: string | boolean | number) {
    await supabase.from('numeracao_config').update({ [field]: value }).eq('id', n.id)
    fetchAll()
  }

  function onEdit(id: string, valor: string) { setEditando(e => ({ ...e, [id]: valor })) }
  function getValue(cfg: Config) { return editando[cfg.id] !== undefined ? editando[cfg.id] : cfg.valor }

  // Filtrar configs por categoria e escopo
  const configsFiltradas = configs.filter(c => {
    if (c.categoria !== categoriaAtiva) return false
    if (filialSelecionada === 'global') return c.escopo === 'global' || !c.filial_id
    return c.filial_id === filialSelecionada || (!c.filial_id && c.escopo === 'global')
  })

  // Detectar overrides de filial
  function temOverride(cfg: Config): boolean {
    return configs.some(c => c.chave === cfg.chave && c.filial_id && c.filial_id !== cfg.filial_id)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>Carregando...</div>

  if (!acesso) return (
    <div style={{ padding: 80, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Acesso restrito</h2>
      <p style={{ fontSize: 14, color: '#64748b' }}>Somente administradores e gerentes podem acessar as configurações.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{ width: 230, borderRight: '1px solid #e2e8f0', background: '#f8fafc', padding: '20px 12px', flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>

        {/* Abas principais */}
        <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 8px', marginBottom: 6 }}>Seções</p>
        {([
          ['configs',    '⚙️', 'Configurações'],
          ['numeracao',  '🔢', 'Numeração'],
          ['historico',  '📜', 'Histórico'],
          ['empresa',    '🏢', 'Empresa'],
        ] as const).map(([k, i, l]) => (
          <button key={k} onClick={() => setAbaAtiva(k)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', background: abaAtiva === k ? '#e0e7ff' : 'transparent', color: abaAtiva === k ? '#3730a3' : '#374151', fontWeight: abaAtiva === k ? 500 : 400, fontSize: 13 }}>
            <span style={{ fontSize: 15 }}>{i}</span>{l}
          </button>
        ))}

        {/* Categorias (só em configs) */}
        {abaAtiva === 'configs' && (
          <>
            <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0 8px' }} />
            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 8px', marginBottom: 6 }}>Categorias</p>
            {Object.entries(CATEGORIAS_CONFIG).map(([key, cat]) => (
              <button key={key} onClick={() => setCategoriaAtiva(key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', background: categoriaAtiva === key ? '#e0e7ff' : 'transparent', color: categoriaAtiva === key ? '#3730a3' : '#374151', fontSize: 12, fontWeight: categoriaAtiva === key ? 500 : 400 }}>
                <span>{cat.icon}</span>{cat.label}
              </button>
            ))}
          </>
        )}

        <div style={{ marginTop: 'auto', padding: '12px 10px 0', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Perfil atual</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#374151', textTransform: 'capitalize' }}>{meuPerfil?.papel ?? 'Admin'}</p>
          <p style={{ fontSize: 11, color: '#10b981' }}>✓ Acesso total</p>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>

        {/* ═══ CONFIGURAÇÕES ═══ */}
        {abaAtiva === 'configs' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{CATEGORIAS_CONFIG[categoriaAtiva].icon}</span>
                  {CATEGORIAS_CONFIG[categoriaAtiva].label}
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{CATEGORIAS_CONFIG[categoriaAtiva].descricao}</p>
              </div>

              {/* Seletor de escopo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Escopo:</span>
                <select style={{ ...inp, width: 'auto', fontSize: 12 }} value={filialSelecionada} onChange={e => setFilialSelecionada(e.target.value)}>
                  <option value="global">🌐 Global</option>
                  {filiais.map(f => <option key={f.id} value={f.id}>🏪 {f.nome}</option>)}
                </select>
              </div>
            </div>

            {categoriaAtiva === 'whatsapp' && (
              <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#4338ca' }}>Variáveis:</span>
                {VARIAVEIS.map(v => <code key={v} style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 6 }}>{v}</code>)}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {configsFiltradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <p>Nenhuma configuração nesta categoria para o escopo selecionado.</p>
                </div>
              ) : configsFiltradas.map(cfg => {
                const isWA = cfg.categoria === 'whatsapp'
                const isSaving = saving === cfg.id
                const isSaved = saved === cfg.id
                const val = getValue(cfg)
                const modificado = editando[cfg.id] !== undefined && editando[cfg.id] !== cfg.valor
                const temOvr = temOverride(cfg)

                return (
                  <div key={cfg.id} style={{ background: '#fff', border: `1px solid ${modificado ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{cfg.descricao ?? cfg.chave}</p>
                          {temOvr && <span style={{ fontSize: 10, fontWeight: 500, background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 20 }}>Com override em filial</span>}
                          {cfg.obrigatorio && <span style={{ fontSize: 10, fontWeight: 500, background: '#fef2f2', color: '#991b1b', padding: '2px 7px', borderRadius: 20 }}>Obrigatório</span>}
                          <span style={{ fontSize: 10, color: '#94a3b8', background: '#f8fafc', padding: '2px 7px', borderRadius: 20 }}>v{cfg.versao}</span>
                        </div>
                        <code style={{ fontSize: 11, color: '#94a3b8' }}>{cfg.chave}</code>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                        {isSaved && <span style={{ fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '2px 8px', borderRadius: 20 }}>✓ Salvo</span>}
                        {modificado && !isSaved && <span style={{ fontSize: 11, color: '#4338ca', background: '#e0e7ff', padding: '2px 8px', borderRadius: 20 }}>Modificado</span>}
                        {modificado && (
                          <>
                            <button onClick={() => setEditando(e => { const n = {...e}; delete n[cfg.id]; return n })} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 11, background: '#fff', cursor: 'pointer', color: '#64748b' }}>Cancelar</button>
                            <button onClick={() => salvarConfig(cfg)} disabled={isSaving} style={{ padding: '5px 14px', background: isSaving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                              {isSaving ? 'Salvando...' : 'Salvar'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isWA ? (
                      <div>
                        <textarea value={val} onChange={e => onEdit(cfg.id, e.target.value)} style={{ ...inp, minHeight: 120, resize: 'vertical', lineHeight: 1.6 }} />
                        <div style={{ marginTop: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px' }}>
                          <p style={{ fontSize: 11, color: '#0369a1', fontWeight: 500, marginBottom: 4 }}>Preview</p>
                          <p style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                            {val.replace(/{nome}/g,'João').replace(/{modelo}/g,'Samsung A32').replace(/{numero}/g,'42').replace(/{valor}/g,'180,00').replace(/{dias}/g,'95').replace(/{defeito}/g,'Tela quebrada')}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input value={val} onChange={e => onEdit(cfg.id, e.target.value)} style={{ ...inp, flex: 1 }} />
                        {cfg.valor_padrao && cfg.valor !== cfg.valor_padrao && (
                          <button onClick={() => onEdit(cfg.id, cfg.valor_padrao!)} style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Restaurar padrão
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ═══ NUMERAÇÃO ═══ */}
        {abaAtiva === 'numeracao' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 4 }}>🔢 Numeração por módulo</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>Configure o formato dos números gerados em cada módulo (OS-2026-000001, VEN-2026-000001, etc.)</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {numeracoes.map(n => {
                const preview = [n.prefixo, n.usar_ano ? new Date().getFullYear() : '', n.usar_mes ? String(new Date().getMonth()+1).padStart(2,'0') : '', String(n.sequencial).padStart(n.digitos,'0'), n.sufixo].filter(Boolean).join(n.prefixo.endsWith('-') ? '' : '-')

                return (
                  <div key={n.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{MODULOS_NUMERACAO[n.modulo] ?? n.modulo}</p>
                        <code style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>{preview}</code>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, background: '#ecfdf5', color: '#065f46', padding: '3px 10px', borderRadius: 20 }}>Próximo: #{n.sequencial}</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                      <div>
                        <label style={lbl}>Prefixo</label>
                        <input style={inp} defaultValue={n.prefixo} onBlur={e => salvarNumeracao(n, 'prefixo', e.target.value)} placeholder="OS-" />
                      </div>
                      <div>
                        <label style={lbl}>Sufixo</label>
                        <input style={inp} defaultValue={n.sufixo} onBlur={e => salvarNumeracao(n, 'sufixo', e.target.value)} placeholder="" />
                      </div>
                      <div>
                        <label style={lbl}>Dígitos (zero-pad)</label>
                        <input style={inp} type="number" min="1" max="10" defaultValue={n.digitos} onBlur={e => salvarNumeracao(n, 'digitos', parseInt(e.target.value))} />
                      </div>
                      <div>
                        <label style={lbl}>Reinício</label>
                        <select style={inp} defaultValue={n.reinicio} onChange={e => salvarNumeracao(n, 'reinicio', e.target.value)}>
                          <option value="nunca">Nunca reiniciar</option>
                          <option value="anual">Reinício anual</option>
                          <option value="mensal">Reinício mensal</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                        <input type="checkbox" defaultChecked={n.usar_ano} onChange={e => salvarNumeracao(n, 'usar_ano', e.target.checked)} />
                        Incluir ano
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                        <input type="checkbox" defaultChecked={n.usar_mes} onChange={e => salvarNumeracao(n, 'usar_mes', e.target.checked)} />
                        Incluir mês
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ═══ HISTÓRICO ═══ */}
        {abaAtiva === 'historico' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 4 }}>📜 Histórico de alterações</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>Todas as mudanças de configuração com possibilidade de reverter.</p>
            </div>

            {historico.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📜</div>
                <p>Nenhuma alteração registrada ainda.</p>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Configuração', 'Valor anterior', 'Valor novo', 'Versão', 'Usuário', 'Quando', 'Ação'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map(h => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}><code style={{ fontSize: 11, color: '#6366f1' }}>{h.chave}</code></td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_anterior?.slice(0, 40) ?? '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#374151', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.valor_novo.slice(0, 40)}</td>
                        <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, fontWeight: 500, background: '#eef2ff', color: '#4338ca', padding: '2px 7px', borderRadius: 20 }}>v{h.versao}</span></td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{(h.perfis as any)?.nome ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8' }}>{new Date(h.alterado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {h.valor_anterior && (
                            <button onClick={() => reverterConfig(h)} disabled={revertendo === h.id} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #fde68a', borderRadius: 6, background: '#fef3c7', cursor: 'pointer', color: '#92400e', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {revertendo === h.id ? '...' : '↩ Reverter'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ═══ EMPRESA ═══ */}
        {abaAtiva === 'empresa' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 4 }}>🏢 Dados da empresa</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>Razão social, CNPJ e informações do grupo empresarial.</p>
            </div>
            <EmpresaForm supabase={supabase} />
          </>
        )}
      </div>
    </div>
  )
}

function EmpresaForm({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [empresa, setEmpresa] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('empresas').select('*').single().then(({ data }) => {
      if (data) { setEmpresa(data); setForm(data) }
    })
  }, [supabase])

  const inp2: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
  const lbl2: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

  async function salvar() {
    if (!empresa) return
    setSaving(true)
    await supabase.from('empresas').update({ ...form, updated_at: new Date().toISOString() }).eq('id', empresa.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!empresa) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div>

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '24px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { key: 'razao_social', label: 'Razão social *' },
          { key: 'nome_fantasia', label: 'Nome fantasia' },
          { key: 'cnpj', label: 'CNPJ' },
          { key: 'ie', label: 'Inscrição Estadual' },
          { key: 'im', label: 'Inscrição Municipal' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'whatsapp', label: 'WhatsApp' },
          { key: 'email', label: 'E-mail' },
          { key: 'site', label: 'Site' },
        ].map(f => (
          <div key={f.key}>
            <label style={lbl2}>{f.label}</label>
            <input style={inp2} value={form[f.key] ?? ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        {saved && <span style={{ fontSize: 13, color: '#065f46', background: '#ecfdf5', padding: '8px 14px', borderRadius: 8 }}>✓ Salvo!</span>}
        <button onClick={salvar} disabled={saving} style={{ padding: '9px 24px', background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {saving ? 'Salvando...' : 'Salvar empresa'}
        </button>
      </div>
    </div>
  )
}
