'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RecondAparelho, RecondPasso, RecondPeca, Condicao, STATUS_CFG, GRAVIDADE_CFG, fm } from '../tipos'

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }
const sec: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em' }
const btnSm: React.CSSProperties = { padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }

const TIPO_BADGE: Record<string, { label: string; cor: string; bg: string }> = {
  teste:  { label: 'TESTE',  cor: '#2563eb', bg: '#eff6ff' },
  reparo: { label: 'REPARO', cor: '#0891b2', bg: '#ecfeff' },
  info:   { label: 'INFO',   cor: '#7c3aed', bg: '#f5f3ff' },
}

export default function RecondDetalhe() {
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [ap, setAp] = useState<RecondAparelho | null>(null)
  const [passos, setPassos] = useState<RecondPasso[]>([])
  const [pecas, setPecas] = useState<RecondPeca[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [a, p, pc] = await Promise.all([
      supabase.from('recond_aparelhos').select('*').eq('id', id).single(),
      supabase.from('recond_passos').select('*').eq('aparelho_id', id).order('ordem', { ascending: true }),
      supabase.from('recond_pecas').select('*').eq('aparelho_id', id).order('created_at', { ascending: true }),
    ])
    setAp(a.data as RecondAparelho | null)
    setPassos((p.data ?? []) as RecondPasso[])
    setPecas((pc.data ?? []) as RecondPeca[])
    setLoading(false)
  }, [supabase, id])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function patch(campos: Partial<RecondAparelho>) {
    setAp(prev => prev ? { ...prev, ...campos } : prev)
    await supabase.from('recond_aparelhos').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id)
  }

  // ── Condições
  const [condItem, setCondItem] = useState('')
  const [condEstado, setCondEstado] = useState('')
  const [condGrav, setCondGrav] = useState<'baixa' | 'media' | 'alta'>('media')
  function addCondicao() {
    if (!condItem.trim()) return
    const nova: Condicao = { item: condItem.trim(), estado: condEstado.trim(), gravidade: condGrav }
    const lista = [...(ap?.condicoes_json ?? []), nova]
    patch({ condicoes_json: lista })
    setCondItem(''); setCondEstado(''); setCondGrav('media')
  }
  function removeCondicao(i: number) {
    const lista = (ap?.condicoes_json ?? []).filter((_, idx) => idx !== i)
    patch({ condicoes_json: lista })
  }

  // ── Passos
  const [novoPasso, setNovoPasso] = useState('')
  const [novoTipo, setNovoTipo] = useState<'teste' | 'reparo' | 'info'>('teste')
  async function addPasso() {
    if (!novoPasso.trim()) return
    const ordem = (passos[passos.length - 1]?.ordem ?? 0) + 1
    const { data } = await supabase.from('recond_passos').insert({
      aparelho_id: id, ordem, tipo: novoTipo, instrucao: novoPasso.trim(), origem: 'tecnico',
    }).select().single()
    if (data) setPassos(prev => [...prev, data as RecondPasso])
    setNovoPasso(''); setNovoTipo('teste')
  }
  async function updatePasso(pid: string, campos: Partial<RecondPasso>) {
    setPassos(prev => prev.map(p => p.id === pid ? { ...p, ...campos } : p))
    await supabase.from('recond_passos').update(campos).eq('id', pid)
  }
  async function delPasso(pid: string) {
    setPassos(prev => prev.filter(p => p.id !== pid))
    await supabase.from('recond_passos').delete().eq('id', pid)
  }

  // ── Peças
  const [pecaNome, setPecaNome] = useState('')
  const [pecaPreco, setPecaPreco] = useState('')
  async function recalcCusto(lista: RecondPeca[]) {
    const total = lista.filter(p => !p.aproveitavel).reduce((s, p) => s + (p.preco ?? 0), 0)
    await patch({ custo_pecas: total })
  }
  async function addPeca(nome: string, preco: number | null, fornecedor: string, url?: string) {
    if (!nome.trim()) return
    const { data } = await supabase.from('recond_pecas').insert({
      aparelho_id: id, peca_nome: nome.trim(), preco, fornecedor, url: url ?? null,
    }).select().single()
    if (data) { const lista = [...pecas, data as RecondPeca]; setPecas(lista); recalcCusto(lista) }
  }
  async function delPeca(pid: string) {
    const lista = pecas.filter(p => p.id !== pid); setPecas(lista); recalcCusto(lista)
    await supabase.from('recond_pecas').delete().eq('id', pid)
  }
  async function toggleAproveitavel(pid: string, v: boolean) {
    const lista = pecas.map(p => p.id === pid ? { ...p, aproveitavel: v } : p)
    setPecas(lista); recalcCusto(lista)
    await supabase.from('recond_pecas').update({ aproveitavel: v }).eq('id', pid)
  }

  // ── Busca de fornecedor (Iplay / Fixcell)
  const [buscaQ, setBuscaQ] = useState('')
  const [buscaFonte, setBuscaFonte] = useState<'iplay' | 'fixcell'>('iplay')
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [buscaRes, setBuscaRes] = useState<{ nome: string; preco: number; codigo?: string; url?: string }[]>([])
  const [buscaErro, setBuscaErro] = useState('')
  async function buscarPeca() {
    if (!buscaQ.trim()) return
    setBuscaLoading(true); setBuscaRes([]); setBuscaErro('')
    try {
      const endpoint = buscaFonte === 'iplay' ? '/api/fornecedor/buscar' : '/api/fornecedor/fixcell'
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: buscaQ }) })
      const data = await res.json() as { produtos?: { nome: string; preco: number; codigo?: string; url?: string }[]; error?: string }
      if (data.produtos) setBuscaRes(data.produtos)
      else setBuscaErro(data.error ?? 'Erro')
    } catch (e) { setBuscaErro(String(e)) } finally { setBuscaLoading(false) }
  }

  // ── Finalizar
  const [finalizando, setFinalizando] = useState(false)
  async function marcarPronto() {
    if (!ap) return
    if (!confirm('Enviar este aparelho para o estoque de Compra & Venda como disponível para venda?')) return
    setFinalizando(true)
    const { data, error } = await supabase.from('aparelhos').insert({
      tipo: 'usado',
      status: 'disponivel',
      marca: ap.marca ?? null,
      modelo: ap.modelo,
      capacidade: ap.capacidade ?? null,
      cor: ap.cor ?? null,
      imei: ap.imei ?? null,
      preco_compra: ap.custo_pecas ?? 0,
      preco_venda: ap.valor_venda ?? 0,
      data_compra: new Date().toISOString().slice(0, 10),
      observacoes: `Origem: Recondicionamento.${ap.diagnostico ? ' ' + ap.diagnostico : ''}`,
    }).select().single()
    if (error) { setFinalizando(false); alert('Erro ao enviar para estoque: ' + error.message); return }
    await patch({ status: 'pronto', aparelho_id: data?.id ?? null })
    setFinalizando(false)
    alert('Aparelho enviado para o estoque de Compra & Venda!')
    router.push('/aparelhos')
  }
  async function descartar() {
    if (!confirm('Marcar como descartado (conserto não vale a pena)? Você pode registrar as peças aproveitáveis abaixo.')) return
    await patch({ status: 'descartado' })
  }

  if (loading) return <div style={{ padding: 40, color: '#94a3b8' }}>Carregando...</div>
  if (!ap) return <div style={{ padding: 40, color: '#94a3b8' }}>Aparelho não encontrado. <a href="/recondicionamento" style={{ color: '#0891b2' }}>Voltar</a></div>

  const st = STATUS_CFG[ap.status] ?? { label: ap.status, cor: '#64748b', bg: '#f1f5f9' }
  const pecasNecessarias = pecas.filter(p => !p.aproveitavel)
  const pecasAproveitaveis = pecas.filter(p => p.aproveitavel)

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans)', maxWidth: 1100, margin: '0 auto' }}>
      <a href="/recondicionamento" style={{ fontSize: 13, color: '#0891b2', textDecoration: 'none' }}>← Recondicionamento</a>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '10px 0 20px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>{ap.marca ? `${ap.marca} ` : ''}{ap.modelo}</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            {[ap.cor, ap.capacidade, ap.imei && `IMEI ${ap.imei}`].filter(Boolean).join(' · ') || 'Sem detalhes'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: st.cor, background: st.bg }}>{st.label}</span>
          <select value={ap.status} onChange={e => patch({ status: e.target.value })} style={{ ...inp, width: 'auto', padding: '6px 10px' }}>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div>
          {/* Diagnóstico e condições */}
          <div style={card}>
            <div style={sec}>Diagnóstico e condições</div>
            <label style={lbl}>Descrição observada</label>
            <textarea style={{ ...inp, minHeight: 56, resize: 'vertical', marginBottom: 12 }} defaultValue={ap.descricao ?? ''} onBlur={e => patch({ descricao: e.target.value })} />
            <label style={lbl}>Diagnóstico</label>
            <textarea style={{ ...inp, minHeight: 56, resize: 'vertical', marginBottom: 14 }} defaultValue={ap.diagnostico ?? ''} onBlur={e => patch({ diagnostico: e.target.value })} placeholder="Resumo técnico / principal suspeita" />

            <label style={lbl}>Condições</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {(ap.condicoes_json ?? []).length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nenhuma condição registrada.</span>}
              {(ap.condicoes_json ?? []).map((c, i) => {
                const g = GRAVIDADE_CFG[c.gravidade ?? 'media'] ?? GRAVIDADE_CFG.media
                return (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 12, color: g.cor, background: g.bg, border: `1px solid ${g.cor}22` }}>
                    <strong>{c.item}</strong>{c.estado ? `: ${c.estado}` : ''}
                    <button type="button" onClick={() => removeCondicao(i)} style={{ background: 'none', border: 'none', color: g.cor, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input style={{ ...inp, flex: '1 1 120px' }} placeholder="Item (ex: Tela)" value={condItem} onChange={e => setCondItem(e.target.value)} />
              <input style={{ ...inp, flex: '1 1 140px' }} placeholder="Estado (ex: trincada)" value={condEstado} onChange={e => setCondEstado(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCondicao()} />
              <select style={{ ...inp, width: 'auto' }} value={condGrav} onChange={e => setCondGrav(e.target.value as 'baixa' | 'media' | 'alta')}>
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
              </select>
              <button type="button" onClick={addCondicao} style={{ ...btnSm, background: '#f1f5f9', color: '#334155' }}>+ Add</button>
            </div>
          </div>

          {/* Passo a passo */}
          <div style={card}>
            <div style={sec}>Passo a passo — diagnóstico e reparo</div>
            {passos.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px' }}>Nenhum passo ainda. Adicione o primeiro passo abaixo (ou peça a categorização).</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {passos.map(p => {
                const tb = TIPO_BADGE[p.tipo] ?? TIPO_BADGE.info
                return (
                  <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', background: p.concluido ? '#f8fafc' : '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', minWidth: 20 }}>{p.ordem}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, color: tb.cor, background: tb.bg }}>{tb.label}</span>
                          {p.concluido && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ concluído</span>}
                        </div>
                        <div style={{ fontSize: 13, color: '#1e293b', marginBottom: 8, textDecoration: p.concluido ? 'line-through' : 'none' }}>{p.instrucao}</div>
                        <textarea style={{ ...inp, minHeight: 40, resize: 'vertical', fontSize: 12 }} defaultValue={p.resultado ?? ''} placeholder="Resultado observado pelo técnico..." onBlur={e => updatePasso(p.id, { resultado: e.target.value })} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button type="button" onClick={() => updatePasso(p.id, { concluido: !p.concluido })} style={{ ...btnSm, background: p.concluido ? '#f1f5f9' : '#dcfce7', color: p.concluido ? '#64748b' : '#166534' }}>{p.concluido ? 'Reabrir' : 'Marcar concluído'}</button>
                          <button type="button" onClick={() => delPasso(p.id)} style={{ ...btnSm, background: 'none', color: '#dc2626' }}>Excluir</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <select style={{ ...inp, width: 'auto' }} value={novoTipo} onChange={e => setNovoTipo(e.target.value as 'teste' | 'reparo' | 'info')}>
                <option value="teste">Teste</option><option value="reparo">Reparo</option><option value="info">Info</option>
              </select>
              <input style={{ ...inp, flex: 1 }} placeholder="Novo passo / instrução..." value={novoPasso} onChange={e => setNovoPasso(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPasso()} />
              <button type="button" onClick={addPasso} style={{ ...btnSm, background: '#0891b2', color: '#fff', padding: '8px 14px' }}>+ Passo</button>
            </div>
          </div>
        </div>

        {/* Coluna lateral */}
        <div>
          {/* Peças */}
          <div style={card}>
            <div style={sec}>Peças necessárias</div>
            {pecasNecessarias.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 10px' }}>Nenhuma peça.</p>}
            {pecasNecessarias.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#1e293b', fontWeight: 500 }}>{p.peca_nome}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{p.fornecedor}</div>
                </div>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>{p.preco != null ? fm(p.preco) : '—'}</span>
                <button type="button" title="Marcar como peça p/ aproveitar" onClick={() => toggleAproveitavel(p.id, true)} style={{ ...btnSm, background: 'none', color: '#64748b', padding: '2px 6px' }}>♻</button>
                <button type="button" onClick={() => delPeca(p.id)} style={{ ...btnSm, background: 'none', color: '#dc2626', padding: '2px 6px' }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              <span>Custo total</span><span>{fm(ap.custo_pecas)}</span>
            </div>

            {/* adicionar manual */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input style={{ ...inp, flex: 1, fontSize: 12 }} placeholder="Peça" value={pecaNome} onChange={e => setPecaNome(e.target.value)} />
              <input style={{ ...inp, width: 70, fontSize: 12 }} placeholder="R$" value={pecaPreco} onChange={e => setPecaPreco(e.target.value)} />
              <button type="button" onClick={() => { addPeca(pecaNome, pecaPreco ? parseFloat(pecaPreco.replace(',', '.')) : null, 'manual'); setPecaNome(''); setPecaPreco('') }} style={{ ...btnSm, background: '#f1f5f9', color: '#334155' }}>+</button>
            </div>
          </div>

          {/* Buscar peça em fornecedor */}
          <div style={card}>
            <div style={sec}>Buscar preço em fornecedor</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['iplay', 'fixcell'] as const).map(f => (
                <button key={f} type="button" onClick={() => setBuscaFonte(f)} style={{ ...btnSm, flex: 1, background: buscaFonte === f ? (f === 'iplay' ? '#16a34a' : '#2563eb') : '#f1f5f9', color: buscaFonte === f ? '#fff' : '#334155' }}>{f === 'iplay' ? 'Iplay' : 'Fix Cell'}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input style={{ ...inp, flex: 1, fontSize: 12 }} placeholder="Ex: tela iphone 13" value={buscaQ} onChange={e => setBuscaQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarPeca()} />
              <button type="button" onClick={buscarPeca} disabled={buscaLoading} style={{ ...btnSm, background: buscaLoading ? '#94a3b8' : '#0891b2', color: '#fff' }}>{buscaLoading ? '...' : '🔍'}</button>
            </div>
            {buscaErro && <p style={{ fontSize: 11, color: '#dc2626', margin: '4px 0', wordBreak: 'break-all' }}>{buscaErro}</p>}
            {buscaRes.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 8 }}>
                {buscaRes.map((r, i) => (
                  <button key={i} type="button" onClick={() => addPeca(r.nome, r.preco, buscaFonte, r.url)}
                    style={{ display: 'flex', width: '100%', gap: 6, padding: '7px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: 11, alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ flex: 1, color: '#1e293b' }}>{r.nome}</span>
                    <span style={{ color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap' }}>{fm(r.preco)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Peças aproveitáveis (desmonte) */}
          {(ap.status === 'descartado' || pecasAproveitaveis.length > 0) && (
            <div style={card}>
              <div style={sec}>Peças para aproveitar (desmonte)</div>
              {pecasAproveitaveis.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Marque peças com ♻ ou adicione abaixo.</p>}
              {pecasAproveitaveis.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                  <span style={{ flex: 1, color: '#1e293b' }}>{p.peca_nome}</span>
                  <button type="button" onClick={() => toggleAproveitavel(p.id, false)} style={{ ...btnSm, background: 'none', color: '#64748b', padding: '2px 6px' }}>↩</button>
                  <button type="button" onClick={() => delPeca(p.id)} style={{ ...btnSm, background: 'none', color: '#dc2626', padding: '2px 6px' }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Finalizar */}
          <div style={card}>
            <div style={sec}>Finalizar</div>
            <label style={lbl}>Valor de venda estimado</label>
            <input style={{ ...inp, marginBottom: 12 }} defaultValue={ap.valor_venda ? String(ap.valor_venda) : ''} placeholder="R$" onBlur={e => patch({ valor_venda: e.target.value ? parseFloat(e.target.value.replace(',', '.')) : 0 })} />
            {ap.status === 'pronto' && ap.aparelho_id ? (
              <p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>✓ Já está no estoque de <a href="/aparelhos" style={{ color: '#0891b2' }}>Compra &amp; Venda</a>.</p>
            ) : (
              <>
                <button type="button" onClick={marcarPronto} disabled={finalizando} style={{ ...btnSm, width: '100%', padding: '10px', background: finalizando ? '#94a3b8' : '#16a34a', color: '#fff', marginBottom: 8 }}>
                  {finalizando ? 'Enviando...' : '✓ Pronto → enviar p/ estoque'}
                </button>
                {ap.status !== 'descartado' && (
                  <button type="button" onClick={descartar} style={{ ...btnSm, width: '100%', padding: '9px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>Não vale — descartar</button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
