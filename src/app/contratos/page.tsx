'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Contrato = {
  id: string; tipo: string; titulo: string; conteudo: string | null
  ativo: boolean; imprimir_na_os: boolean
  requer_assinatura_cliente: boolean; requer_assinatura_gestor: boolean
  permite_assinatura_digital: boolean; created_at: string
}

const TIPO_CONFIG: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  prestacao_servico: { label: 'Prestação de serviço', icon: '🔧', bg: '#eef2ff', color: '#3730a3' },
  fornecedor:        { label: 'Fornecedor',            icon: '🏭', bg: '#f0fdf4', color: '#065f46' },
  outro:             { label: 'Outro',                 icon: '📄', bg: '#f8fafc', color: '#475569' },
}

const VARIAVEIS = ['{nome}','{cpf}','{modelo}','{imei}','{valor}','{garantia_dias}','{prazo_retirada}','{taxa_armazenagem}','{empresa_nome}','{cidade}','{data}']

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }

export default function ContratosPage() {
  const supabase = createClient()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [abaModal, setAbaModal] = useState<'editor' | 'preview' | 'config'>('editor')

  // Form
  const [fTitulo, setFTitulo] = useState('')
  const [fTipo, setFTipo] = useState('prestacao_servico')
  const [fConteudo, setFConteudo] = useState('')
  const [fAtivo, setFAtivo] = useState(true)
  const [fImprimirOS, setFImprimirOS] = useState(false)
  const [fAssinaturaCliente, setFAssinaturaCliente] = useState(true)
  const [fAssinaturaGestor, setFAssinaturaGestor] = useState(true)
  const [fDigital, setFDigital] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('contratos').select('*').order('tipo').order('titulo')
    setContratos((data ?? []) as Contrato[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  function abrirNovo() {
    setFTitulo(''); setFTipo('prestacao_servico'); setFConteudo('')
    setFAtivo(true); setFImprimirOS(false); setFAssinaturaCliente(true)
    setFAssinaturaGestor(true); setFDigital(true)
    setEditId(null); setAbaModal('editor'); setShowModal(true)
  }

  function abrirEdit(c: Contrato) {
    setFTitulo(c.titulo); setFTipo(c.tipo); setFConteudo(c.conteudo ?? '')
    setFAtivo(c.ativo); setFImprimirOS(c.imprimir_na_os)
    setFAssinaturaCliente(c.requer_assinatura_cliente)
    setFAssinaturaGestor(c.requer_assinatura_gestor)
    setFDigital(c.permite_assinatura_digital)
    setEditId(c.id); setAbaModal('editor'); setShowModal(true)
  }

  function inserirVariavel(variavel: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart; const end = ta.selectionEnd
    const novo = fConteudo.slice(0, start) + variavel + fConteudo.slice(end)
    setFConteudo(novo)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + variavel.length, start + variavel.length) }, 0)
  }

  async function salvar() {
    if (!fTitulo.trim()) return
    setSaving(true)
    const payload = {
      tipo: fTipo, titulo: fTitulo.trim(), conteudo: fConteudo || null,
      ativo: fAtivo, imprimir_na_os: fImprimirOS,
      requer_assinatura_cliente: fAssinaturaCliente,
      requer_assinatura_gestor: fAssinaturaGestor,
      permite_assinatura_digital: fDigital,
    }
    if (editId) await supabase.from('contratos').update(payload).eq('id', editId)
    else await supabase.from('contratos').insert(payload)
    setSaving(false); setShowModal(false); fetchAll()
  }

  async function toggleAtivo(c: Contrato) {
    await supabase.from('contratos').update({ ativo: !c.ativo }).eq('id', c.id)
    fetchAll()
  }

  // Preview do contrato com dados de exemplo
  const preview = (fConteudo || '')
    .replace(/{nome}/g, 'João Pedro Santos')
    .replace(/{cpf}/g, '111.222.333-44')
    .replace(/{modelo}/g, 'Samsung Galaxy A32')
    .replace(/{imei}/g, '351234567890001')
    .replace(/{valor}/g, 'R$ 280,00')
    .replace(/{garantia_dias}/g, '90')
    .replace(/{prazo_retirada}/g, '90')
    .replace(/{taxa_armazenagem}/g, '10,00')
    .replace(/{empresa_nome}/g, 'SOS Celulares')
    .replace(/{cidade}/g, 'São Paulo')
    .replace(/{data}/g, new Date().toLocaleDateString('pt-BR'))

  function imprimirContrato(c: Contrato) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${c.titulo}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;max-width:700px;margin:40px auto;padding:0 40px;line-height:1.7}
    h1{font-size:16px;text-align:center;margin-bottom:24px}.assinatura{margin-top:60px;display:flex;gap:60px}
    .ass-box{flex:1;text-align:center}.ass-linha{border-top:1px solid #000;padding-top:6px;font-size:11px}</style></head><body>
    <h1>${c.titulo}</h1>
    <div style="white-space:pre-wrap">${c.conteudo ?? ''}</div>
    ${c.requer_assinatura_cliente || c.requer_assinatura_gestor ? `
    <div class="assinatura">
      ${c.requer_assinatura_cliente ? '<div class="ass-box"><div class="ass-linha">Assinatura do cliente</div></div>' : ''}
      ${c.requer_assinatura_gestor ? '<div class="ass-box"><div class="ass-linha">Responsável técnico</div></div>' : ''}
    </div>` : ''}
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const _b = new Blob([html], { type: 'text/html;charset=utf-8' }); const _u = URL.createObjectURL(_b); const _w = window.open(_u, '_blank'); if (_w) _w.onload = () => URL.revokeObjectURL(_u)
  }

  const ativos = contratos.filter(c => c.ativo).length

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)',  }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em' }}>Contratos</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{contratos.length} contratos · {ativos} ativos</p>
        </div>
        <button onClick={abrirNovo} style={{ padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Novo contrato</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Carregando...</div>
      ) : contratos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Nenhum contrato cadastrado</p>
          <button onClick={abrirNovo} style={{ marginTop: 16, padding: '9px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>+ Criar primeiro contrato</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contratos.map(c => {
            const tc = TIPO_CONFIG[c.tipo] ?? TIPO_CONFIG.outro
            return (
              <div key={c.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{tc.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{c.titulo}</p>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color }}>{tc.label}</span>
                    {c.imprimir_na_os && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#eef2ff', color: '#3730a3' }}>🖨 Imprime na OS</span>}
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: c.ativo ? '#ecfdf5' : '#f1f5f9', color: c.ativo ? '#065f46' : '#94a3b8' }}>{c.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#94a3b8', flexWrap: 'wrap' }}>
                    {c.requer_assinatura_cliente && <span>✍ Assinatura do cliente</span>}
                    {c.requer_assinatura_gestor && <span>✍ Assinatura do gestor</span>}
                    {c.permite_assinatura_digital && <span>📱 Permite digital</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => imprimirContrato(c)} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#374151' }}>🖨 Imprimir</button>
                  <button onClick={() => abrirEdit(c)} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#374151' }}>Editar</button>
                  <button onClick={() => toggleAtivo(c)} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', cursor: 'pointer', color: c.ativo ? '#ef4444' : '#10b981' }}>{c.ativo ? 'Desativar' : 'Ativar'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%',  maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{editId ? 'Editar contrato' : 'Novo contrato'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {/* Título e tipo */}
            <div style={{ padding: '14px 22px', borderBottom: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, flexShrink: 0 }}>
              <div><label style={lbl}>Título *</label><input style={inp} value={fTitulo} onChange={e => setFTitulo(e.target.value)} placeholder="Ex: Contrato de Prestação de Serviços" /></div>
              <div><label style={lbl}>Tipo</label>
                <select style={inp} value={fTipo} onChange={e => setFTipo(e.target.value)}>
                  {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 22px', flexShrink: 0 }}>
              {([['editor','✏️ Editor'], ['preview','👁 Preview'], ['config','⚙️ Configurações']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setAbaModal(k)} style={{ padding: '10px 16px', fontSize: 13, fontWeight: abaModal === k ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: abaModal === k ? '#6366f1' : '#64748b', borderBottom: abaModal === k ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>

              {/* EDITOR */}
              {abaModal === 'editor' && (
                <div>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inserir variável no cursor:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {VARIAVEIS.map(v => (
                        <button key={v} onClick={() => inserirVariavel(v)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #c7d2fe', borderRadius: 6, background: '#eef2ff', color: '#3730a3', cursor: 'pointer', fontFamily: 'monospace' }}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={fConteudo}
                    onChange={e => setFConteudo(e.target.value)}
                    style={{ ...inp, minHeight: 360, resize: 'vertical', lineHeight: 1.8, fontFamily: 'monospace', fontSize: 12 }}
                    placeholder="Digite o conteúdo do contrato aqui. Use as variáveis acima para dados dinâmicos de cada OS..."
                  />
                </div>
              )}

              {/* PREVIEW */}
              {abaModal === 'preview' && (
                <div>
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                    👁 Preview com dados fictícios de exemplo
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '32px 40px', lineHeight: 1.8 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, textAlign: 'center', marginBottom: 24, color: '#0f172a' }}>{fTitulo || 'Título do contrato'}</h2>
                    <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{preview || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Conteúdo do contrato aparecerá aqui...</span>}</div>
                    {(fAssinaturaCliente || fAssinaturaGestor) && (
                      <div style={{ marginTop: 60, display: 'flex', gap: 60 }}>
                        {fAssinaturaCliente && (
                          <div style={{ flex: 1, textAlign: 'center' }}>
                            {fDigital && (
                              <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, height: 80, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>Área para assinatura digital</span>
                              </div>
                            )}
                            <div style={{ borderTop: '1px solid #374151', paddingTop: 6, fontSize: 12, color: '#374151' }}>Assinatura do cliente</div>
                          </div>
                        )}
                        {fAssinaturaGestor && (
                          <div style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ borderTop: '1px solid #374151', paddingTop: 6, fontSize: 12, color: '#374151', marginTop: fDigital ? 88 : 0 }}>Responsável técnico</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CONFIGURAÇÕES */}
              {abaModal === 'config' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px 18px' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Comportamento na OS</p>
                    {[
                      { field: 'fImprimirOS', value: fImprimirOS, set: setFImprimirOS, label: 'Imprimir automaticamente junto com a OS', sub: 'O contrato será incluído ao imprimir a OS' },
                      { field: 'fAtivo', value: fAtivo, set: setFAtivo, label: 'Contrato ativo', sub: 'Contratos inativos não aparecem nas OS' },
                    ].map(opt => (
                      <label key={opt.field} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 12 }}>
                        <div onClick={() => opt.set(!opt.value)} style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: opt.value ? '#6366f1' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginTop: 2 }}>
                          <div style={{ position: 'absolute', top: 3, left: opt.value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{opt.label}</p>
                          <p style={{ fontSize: 12, color: '#94a3b8' }}>{opt.sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px 18px' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Assinaturas</p>
                    {[
                      { field: 'fAssinaturaCliente', value: fAssinaturaCliente, set: setFAssinaturaCliente, label: 'Requer assinatura do cliente', sub: 'Campo de assinatura será exibido na impressão' },
                      { field: 'fAssinaturaGestor', value: fAssinaturaGestor, set: setFAssinaturaGestor, label: 'Requer assinatura do responsável técnico', sub: 'Campo para o técnico assinar' },
                      { field: 'fDigital', value: fDigital, set: setFDigital, label: 'Permite assinatura digital', sub: 'Cliente pode assinar via toque na tela ou mouse' },
                    ].map(opt => (
                      <label key={opt.field} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 12 }}>
                        <div onClick={() => opt.set(!opt.value)} style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: opt.value ? '#6366f1' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginTop: 2 }}>
                          <div style={{ position: 'absolute', top: 3, left: opt.value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{opt.label}</p>
                          <p style={{ fontSize: 12, color: '#94a3b8' }}>{opt.sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
              <button onClick={salvar} disabled={saving || !fTitulo.trim()} style={{ padding: '8px 20px', background: saving || !fTitulo.trim() ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar contrato'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
