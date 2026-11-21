'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PecaFornecedor, TipoPeca, filtrarPecasDoModelo, filtrarPecasDoTipo, nomeBaseDoModelo } from '@/lib/fornecedores'
import { Preco, SERVICOS_SUGERIDOS, categoriaDoServico, lerLinhasColadas } from '@/lib/whatsapp/precos'

const NOME_FORNECEDOR: Record<string, string> = { iplay: 'iPlay', fixcell: 'Fix Cell' }
const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

// "250", "250,5", "R$ 1.250,00" → número; NaN se não der para entender
function lerPreco(texto: string): number {
  const limpo = texto.replace(/[^\d.,]/g, '')
  if (!limpo) return NaN
  return Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }
const campo: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const rotulo: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, color: '#0f172a', verticalAlign: 'middle' }
const botaoLeve = (cor: string): React.CSSProperties => ({ padding: '3px 9px', background: 'none', color: cor, border: `1px solid ${cor}44`, borderRadius: 5, fontSize: 11, cursor: 'pointer' })

type Rascunho = { servico: string; modelo: string; opcao: string; preco: string; observacao: string }
const VAZIO: Rascunho = { servico: SERVICOS_SUGERIDOS[0], modelo: '', opcao: '', preco: '', observacao: '' }

export default function TabelaDePrecosPage() {
  const supabase = createClient()
  const [precos, setPrecos] = useState<Preco[]>([])
  const [tabelaAusente, setTabelaAusente] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [filialId, setFilialId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [novo, setNovo] = useState<Rascunho>(VAZIO)
  const [msg, setMsg] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [colando, setColando] = useState(false)
  const [textoColado, setTextoColado] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Rascunho>(VAZIO)
  const [custos, setCustos] = useState<PecaFornecedor[]>([])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('wa_precos')
      .select('id, servico, modelo, opcao, preco, observacao, atualizado_em')
      .order('modelo').order('servico').order('preco')
      .limit(5000)
    setTabelaAusente(!!error)
    setPrecos(((data as Preco[] | null) ?? []).map(p => ({ ...p, preco: Number(p.preco) })))
    setCarregando(false)
  }, [supabase])

  useEffect(() => {
    carregar()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('perfis').select('filial_id').eq('id', user.id).single()
      setFilialId((data?.filial_id as string | undefined) ?? null)
    })
  }, [carregar, supabase])

  // Custo das peças nos fornecedores para o modelo e o serviço que estão sendo cadastrados
  useEffect(() => {
    const palavras = nomeBaseDoModelo(novo.modelo).split(' ').filter(p => p.length >= 2)
    const tipo = categoriaDoServico(novo.servico)
    if (palavras.length === 0 || !['tela', 'bateria', 'conector'].includes(tipo)) { setCustos([]); return }
    const t = setTimeout(async () => {
      let consulta = supabase.from('fornecedor_pecas').select('fornecedor, nome, preco, codigo, url')
      for (const p of palavras) consulta = consulta.ilike('nome', `%${p}%`)
      const { data } = await consulta.limit(300)
      const pecas = ((data ?? []) as { fornecedor: string; nome: string; preco: number }[])
        .map(p => ({ fornecedor: p.fornecedor as PecaFornecedor['fornecedor'], nome: p.nome, preco: Number(p.preco) }))
      setCustos(filtrarPecasDoTipo(filtrarPecasDoModelo(pecas, novo.modelo), tipo as TipoPeca).sort((a, b) => a.preco - b.preco).slice(0, 12))
    }, 400)
    return () => clearTimeout(t)
  }, [novo.modelo, novo.servico, supabase])

  function validar(r: Rascunho): { erro: string } | { linha: Omit<Preco, 'id' | 'atualizado_em'> } {
    const preco = lerPreco(r.preco)
    if (!r.modelo.trim()) return { erro: 'Informe o modelo do aparelho.' }
    if (!r.servico.trim()) return { erro: 'Informe o serviço.' }
    if (!Number.isFinite(preco) || preco <= 0) return { erro: 'Informe o preço, por exemplo 250 ou 250,00.' }
    return { linha: { servico: r.servico.trim(), modelo: r.modelo.trim(), opcao: r.opcao.trim() || null, preco, observacao: r.observacao.trim() || null } }
  }

  async function adicionar() {
    const v = validar(novo)
    if ('erro' in v) { setMsg(`❌ ${v.erro}`); return }
    if (!filialId) { setMsg('❌ Não consegui identificar a loja. Recarregue a página.'); return }
    setSalvando(true)
    const { error } = await supabase.from('wa_precos').insert({ ...v.linha, filial_id: filialId })
    setSalvando(false)
    if (error) { setMsg(`❌ Não consegui salvar: ${error.message}`); return }
    // Mantém modelo e serviço: o próximo cadastro costuma ser outra opção do mesmo aparelho
    setNovo(n => ({ ...n, opcao: '', preco: '', observacao: '' }))
    setMsg('✅ Preço adicionado.')
    carregar()
  }

  async function colarLinhas() {
    const { linhas, erros } = lerLinhasColadas(textoColado)
    if (linhas.length === 0) { setMsg('❌ Nenhuma linha válida. Use: modelo; serviço; opção; preço; observação'); return }
    if (!filialId) { setMsg('❌ Não consegui identificar a loja. Recarregue a página.'); return }
    setSalvando(true)
    const { error } = await supabase.from('wa_precos').insert(linhas.map(l => ({ ...l, filial_id: filialId })))
    setSalvando(false)
    if (error) { setMsg(`❌ Não consegui salvar: ${error.message}`); return }
    setMsg(`✅ ${linhas.length} preço${linhas.length > 1 ? 's' : ''} adicionado${linhas.length > 1 ? 's' : ''}.` + (erros.length ? ` ${erros.length} linha${erros.length > 1 ? 's' : ''} ignorada${erros.length > 1 ? 's' : ''} por não ter modelo, serviço e preço: ${erros.slice(0, 3).join(' | ')}` : ''))
    setTextoColado(erros.join('\n'))
    if (erros.length === 0) setColando(false)
    carregar()
  }

  async function salvarEdicao(id: string) {
    const v = validar(edicao)
    if ('erro' in v) { setMsg(`❌ ${v.erro}`); return }
    const { error } = await supabase.from('wa_precos').update({ ...v.linha, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) { setMsg(`❌ Não consegui salvar: ${error.message}`); return }
    setEditando(null); setMsg('✅ Preço atualizado.')
    carregar()
  }

  async function remover(p: Preco) {
    if (!confirm(`Remover ${p.servico} · ${p.modelo}${p.opcao ? ` · ${p.opcao}` : ''}?`)) return
    const { error } = await supabase.from('wa_precos').delete().eq('id', p.id)
    if (error) { setMsg(`❌ Não consegui remover: ${error.message}`); return }
    setPrecos(lista => lista.filter(x => x.id !== p.id))
  }

  const palavrasDoFiltro = filtro.toLowerCase().split(/\s+/).filter(Boolean)
  const visiveis = precos.filter(p => {
    const texto = `${p.modelo} ${p.servico} ${p.opcao ?? ''}`.toLowerCase()
    return palavrasDoFiltro.every(w => texto.includes(w))
  })

  return (
    <div style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100%' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Tabela de preços</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>Preços ao cliente que o agente do WhatsApp informa sozinho. O que não estiver aqui, ele pergunta para você.</p>
      </div>

      {tabelaAusente && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
          A tabela de preços ainda não existe no banco. Rode o arquivo <code>supabase-whatsapp-precos-migration.sql</code> e recarregue esta página.
        </div>
      )}

      {/* Novo preço */}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1.2fr 0.7fr 1.6fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={rotulo}>Modelo</label>
            <input style={campo} value={novo.modelo} onChange={e => setNovo(n => ({ ...n, modelo: e.target.value }))} placeholder="iPhone 11, Samsung A54 5G…" />
          </div>
          <div>
            <label style={rotulo}>Serviço</label>
            <input style={campo} list="servicos-sugeridos" value={novo.servico} onChange={e => setNovo(n => ({ ...n, servico: e.target.value }))} />
            <datalist id="servicos-sugeridos">{SERVICOS_SUGERIDOS.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label style={rotulo}>Opção (se houver)</label>
            <input style={campo} value={novo.opcao} onChange={e => setNovo(n => ({ ...n, opcao: e.target.value }))} placeholder="Incell, Soft OLED, com aro…" />
          </div>
          <div>
            <label style={rotulo}>Preço</label>
            <input style={campo} value={novo.preco} onChange={e => setNovo(n => ({ ...n, preco: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') adicionar() }} placeholder="250,00" inputMode="decimal" />
          </div>
          <div>
            <label style={rotulo}>Observação para o cliente (opcional)</label>
            <input style={campo} value={novo.observacao} onChange={e => setNovo(n => ({ ...n, observacao: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') adicionar() }} placeholder="pronto no mesmo dia" />
          </div>
          <button onClick={adicionar} disabled={salvando || tabelaAusente} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, background: salvando || tabelaAusente ? '#cbd5e1' : '#2563eb', color: '#fff', cursor: salvando || tabelaAusente ? 'not-allowed' : 'pointer' }}>Adicionar</button>
        </div>

        {custos.length > 0 && (
          <div style={{ marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Custo dessa peça nos fornecedores (do catálogo de peças)</div>
            {custos.map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: '#334155', display: 'flex', gap: 10 }}>
                <span style={{ width: 62, color: '#64748b', flexShrink: 0 }}>{NOME_FORNECEDOR[c.fornecedor] ?? c.fornecedor}</span>
                <span style={{ width: 84, fontWeight: 600, flexShrink: 0 }}>{reais(c.preco)}</span>
                <span>{c.nome}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setColando(v => !v)} style={botaoLeve('#2563eb')}>{colando ? 'Fechar' : 'Colar várias linhas de uma planilha'}</button>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('❌') ? '#dc2626' : '#059669' }}>{msg}</span>}
        </div>
        {colando && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              Uma linha por preço, com os campos separados por ponto e vírgula (ou copiados direto das colunas de uma planilha):<br />
              <code>modelo; serviço; opção; preço; observação</code> — opção e observação podem ficar vazias. Ex.: <code>iPhone 11; Troca de tela; Incell; 250</code>
            </div>
            <textarea rows={6} style={{ ...campo, fontFamily: 'ui-monospace, Consolas, monospace', resize: 'vertical' }} value={textoColado} onChange={e => setTextoColado(e.target.value)} placeholder={'iPhone 11; Troca de tela; Incell; 250\niPhone 11; Troca de tela; Soft OLED; 420\niPhone 11; Troca de bateria; ; 180; pronto no mesmo dia'} />
            <button onClick={colarLinhas} disabled={salvando || tabelaAusente} style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, background: salvando || tabelaAusente ? '#cbd5e1' : '#2563eb', color: '#fff', cursor: 'pointer' }}>Adicionar linhas</button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <input style={{ ...campo, maxWidth: 360 }} value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar: iphone 11 tela…" />
          <span style={{ fontSize: 12, color: '#64748b' }}>{visiveis.length} de {precos.length} preço{precos.length === 1 ? '' : 's'}</span>
        </div>
        {carregando && <div style={{ fontSize: 13, color: '#94a3b8' }}>Carregando…</div>}
        {!carregando && precos.length === 0 && !tabelaAusente && (
          <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>Nenhum preço cadastrado. Enquanto a tabela estiver vazia, o agente pergunta tudo para você.</div>
        )}
        {visiveis.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Modelo', 'Serviço', 'Opção', 'Preço', 'Observação', ''].map(h => <th key={h} style={{ ...th, textAlign: h === 'Preço' ? 'right' : 'left' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {visiveis.map(p => editando === p.id ? (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                  <td style={td}><input style={campo} value={edicao.modelo} onChange={e => setEdicao(x => ({ ...x, modelo: e.target.value }))} /></td>
                  <td style={td}><input style={campo} list="servicos-sugeridos" value={edicao.servico} onChange={e => setEdicao(x => ({ ...x, servico: e.target.value }))} /></td>
                  <td style={td}><input style={campo} value={edicao.opcao} onChange={e => setEdicao(x => ({ ...x, opcao: e.target.value }))} /></td>
                  <td style={td}><input style={{ ...campo, textAlign: 'right' }} value={edicao.preco} onChange={e => setEdicao(x => ({ ...x, preco: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(p.id) }} /></td>
                  <td style={td}><input style={campo} value={edicao.observacao} onChange={e => setEdicao(x => ({ ...x, observacao: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(p.id) }} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => salvarEdicao(p.id)} style={botaoLeve('#059669')}>Salvar</button>{' '}
                    <button onClick={() => setEditando(null)} style={botaoLeve('#64748b')}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.modelo}</td>
                  <td style={td}>{p.servico}</td>
                  <td style={td}>{p.opcao ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{reais(p.preco)}</td>
                  <td style={{ ...td, color: '#64748b' }}>{p.observacao ?? ''}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button onClick={() => { setEditando(p.id); setEdicao({ servico: p.servico, modelo: p.modelo, opcao: p.opcao ?? '', preco: String(p.preco).replace('.', ','), observacao: p.observacao ?? '' }) }} style={botaoLeve('#2563eb')}>Editar</button>{' '}
                    <button onClick={() => remover(p)} style={botaoLeve('#dc2626')}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
