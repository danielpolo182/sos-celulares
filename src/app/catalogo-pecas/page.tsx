'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TIPOS_DE_PECA, TipoPeca, consultaParaModelo } from '@/lib/fornecedores'
import { gerarModelos } from '@/data/modelos-dispositivos'

type Peca = { id: string; fornecedor: string; nome: string; codigo: string | null; preco: number; url: string | null; atualizado_em: string }
type Resumo = { fornecedor: string; total: number; ultima: string | null }

const NOME_FORNECEDOR: Record<string, string> = { iplay: 'iPlay', fixcell: 'Fix Cell Parts' }

// Intervalo entre consultas: a captura não pode pesar no site do fornecedor
const PAUSA_FIXCELL_MS = 1200
const PAUSA_IPLAY_MS = 2500
const FALHAS_SEGUIDAS_PARA_PARAR = 5
// Consultas da iPlay refeitas só depois deste prazo; guardado no navegador
const REFAZER_APOS_MS = 7 * 86_400_000
const CHAVE_FEITAS = 'catalogo_iplay_consultas_feitas'

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function lerFeitas(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHAVE_FEITAS) ?? '{}') } catch { return {} }
}

type Progresso = { feito: number; total: number; encontradas: number; falhas: number; mensagem: string }
const PROGRESSO_VAZIO: Progresso = { feito: 0, total: 0, encontradas: 0, falhas: 0, mensagem: '' }

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }
const botao = (cor: string, desabilitado = false): React.CSSProperties => ({
  padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
  background: desabilitado ? '#cbd5e1' : cor, color: '#fff', cursor: desabilitado ? 'not-allowed' : 'pointer',
})

export default function CatalogoPecasPage() {
  const supabase = createClient()
  const [resumo, setResumo] = useState<Resumo[]>([])
  const [tabelaAusente, setTabelaAusente] = useState(false)
  const [busca, setBusca] = useState('')
  const [pecas, setPecas] = useState<Peca[]>([])
  const [buscando, setBuscando] = useState(false)

  const [capturando, setCapturando] = useState<'fixcell' | 'iplay' | null>(null)
  const [progFix, setProgFix] = useState<Progresso>(PROGRESSO_VAZIO)
  const [progIplay, setProgIplay] = useState<Progresso>(PROGRESSO_VAZIO)
  const [origemModelos, setOrigemModelos] = useState<'os' | 'todos'>('os')
  const parar = useRef(false)

  const carregarResumo = useCallback(async () => {
    const linhas: Resumo[] = []
    for (const fornecedor of ['iplay', 'fixcell']) {
      const { count, error } = await supabase.from('fornecedor_pecas').select('id', { count: 'exact', head: true }).eq('fornecedor', fornecedor)
      if (error) { setTabelaAusente(true); return }
      const { data } = await supabase.from('fornecedor_pecas').select('atualizado_em').eq('fornecedor', fornecedor).order('atualizado_em', { ascending: false }).limit(1)
      linhas.push({ fornecedor, total: count ?? 0, ultima: (data?.[0]?.atualizado_em as string | undefined) ?? null })
    }
    setTabelaAusente(false)
    setResumo(linhas)
  }, [supabase])

  const procurar = useCallback(async (texto: string) => {
    setBuscando(true)
    let consulta = supabase.from('fornecedor_pecas').select('id, fornecedor, nome, codigo, preco, url, atualizado_em')
    for (const palavra of texto.trim().split(/\s+/).filter(Boolean)) consulta = consulta.ilike('nome', `%${palavra}%`)
    const { data } = await consulta.order('preco', { ascending: true }).limit(200)
    setPecas((data as Peca[] | null) ?? [])
    setBuscando(false)
  }, [supabase])

  useEffect(() => { carregarResumo() }, [carregarResumo])

  useEffect(() => {
    const t = setTimeout(() => { if (busca.trim().length >= 2) procurar(busca); else setPecas([]) }, 350)
    return () => clearTimeout(t)
  }, [busca, procurar])

  async function passo(corpo: unknown): Promise<{ ok: true; dados: { encontradas: number; ultimaPagina?: number; consulta?: string } } | { ok: false; erro: string; semTabela: boolean }> {
    try {
      const res = await fetch('/api/fornecedor/capturar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const json = await res.json()
      if (!res.ok) return { ok: false, erro: json.error ?? `erro ${res.status}`, semTabela: res.status === 409 }
      return { ok: true, dados: json }
    } catch (e) {
      return { ok: false, erro: String(e), semTabela: false }
    }
  }

  async function capturarFixcell() {
    parar.current = false
    setCapturando('fixcell')
    const p: Progresso = { ...PROGRESSO_VAZIO, total: 1, mensagem: 'Lendo a primeira página…' }
    setProgFix({ ...p })
    let falhasSeguidas = 0
    let encerradaPorErro = false

    for (let pagina = 1; pagina <= p.total && !parar.current; pagina++) {
      const r = await passo({ fornecedor: 'fixcell', pagina })
      if (!r.ok) {
        if (r.semTabela) { setTabelaAusente(true); p.mensagem = r.erro; encerradaPorErro = true; break }
        p.falhas++
        if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) { p.mensagem = `Parei depois de ${falhasSeguidas} falhas seguidas: ${r.erro}`; encerradaPorErro = true; break }
      } else {
        falhasSeguidas = 0
        if (r.dados.encontradas === 0) { p.feito = pagina; break }
        p.encontradas += r.dados.encontradas
        p.total = Math.max(p.total, r.dados.ultimaPagina ?? pagina)
      }
      p.feito = pagina
      p.mensagem = `Página ${pagina} de ${p.total}`
      setProgFix({ ...p })
      await esperar(PAUSA_FIXCELL_MS)
    }

    if (!encerradaPorErro) p.mensagem = parar.current ? 'Interrompido.' : 'Catálogo capturado.'
    setProgFix({ ...p })
    setCapturando(null)
    carregarResumo()
  }

  async function modelosParaCapturar(): Promise<string[]> {
    if (origemModelos === 'todos') return gerarModelos().map(m => `${m.marca} ${m.modelo}`)
    const { data } = await supabase.from('ordens_servico').select('modelo').not('modelo', 'is', null).is('deleted_at', null).order('created_at', { ascending: false }).limit(5000)
    return [...new Set((data ?? []).map(o => String(o.modelo).trim()).filter(m => m.length >= 2))]
  }

  async function capturarIPlay() {
    parar.current = false
    setCapturando('iplay')
    const p: Progresso = { ...PROGRESSO_VAZIO, mensagem: 'Montando a lista de modelos…' }
    setProgIplay({ ...p })

    // Modelos escritos de formas diferentes viram a mesma consulta; cada uma roda uma vez só
    const feitas = lerFeitas()
    const agora = Date.now()
    const fila = new Map<string, { modelo: string; tipo: TipoPeca }>()
    for (const modelo of await modelosParaCapturar()) {
      for (const tipo of TIPOS_DE_PECA) {
        const consulta = consultaParaModelo('iplay', modelo, tipo)
        const base = consulta.split(' ').slice(1).join(' ')
        if (base.length < 2 || fila.has(consulta)) continue
        if (feitas[consulta] && agora - feitas[consulta] < REFAZER_APOS_MS) continue
        fila.set(consulta, { modelo, tipo })
      }
    }

    p.total = fila.size
    if (p.total === 0) {
      p.mensagem = 'Nada a capturar: todas as consultas desta lista foram feitas nos últimos 7 dias.'
      setProgIplay({ ...p }); setCapturando(null); return
    }

    let falhasSeguidas = 0
    let encerradaPorErro = false
    for (const [consulta, item] of fila) {
      if (parar.current) break
      const r = await passo({ fornecedor: 'iplay', modelo: item.modelo, tipo: item.tipo })
      if (!r.ok) {
        if (r.semTabela) { setTabelaAusente(true); p.mensagem = r.erro; encerradaPorErro = true; break }
        p.falhas++
        if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) { p.mensagem = `Parei depois de ${falhasSeguidas} falhas seguidas: ${r.erro}`; encerradaPorErro = true; break }
      } else {
        falhasSeguidas = 0
        p.encontradas += r.dados.encontradas
        feitas[consulta] = Date.now()
        try { localStorage.setItem(CHAVE_FEITAS, JSON.stringify(feitas)) } catch { /* armazenamento cheio: só perde a retomada */ }
      }
      p.feito++
      p.mensagem = `"${consulta}" (${p.feito} de ${p.total})`
      setProgIplay({ ...p })
      await esperar(PAUSA_IPLAY_MS)
    }

    if (!encerradaPorErro) {
      p.mensagem = parar.current ? 'Interrompido. Ao retomar, as consultas já feitas são puladas.' : 'Captura concluída.'
    }
    setProgIplay({ ...p })
    setCapturando(null)
    carregarResumo()
  }

  function barra(p: Progresso) {
    if (p.total === 0 && !p.mensagem) return null
    const pct = p.total > 0 ? Math.round((p.feito / p.total) * 100) : 0
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#2563eb', transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
          {p.mensagem}
          {p.encontradas > 0 && <> · {p.encontradas} peças lidas</>}
          {p.falhas > 0 && <span style={{ color: '#b45309' }}> · {p.falhas} falha{p.falhas > 1 ? 's' : ''}</span>}
        </div>
      </div>
    )
  }

  const minutosIplay = (consultas: number) => Math.max(1, Math.round((consultas * (PAUSA_IPLAY_MS + 2000)) / 60_000))

  return (
    <div style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100%' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Catálogo de peças</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>Custo das peças nos fornecedores, guardado a cada consulta. É a base dos orçamentos e da regra de preço.</p>
      </div>

      {tabelaAusente && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
          A tabela de peças ainda não existe. Rode o arquivo <code>supabase-whatsapp-agente-migration.sql</code> no banco e recarregue esta página.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Fix Cell */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 15, color: '#0f172a' }}>Fix Cell Parts</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {resumo.find(r => r.fornecedor === 'fixcell')?.total ?? 0} peças
              {resumo.find(r => r.fornecedor === 'fixcell')?.ultima ? ` · ${dataHora(resumo.find(r => r.fornecedor === 'fixcell')!.ultima as string)}` : ''}
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 12px', lineHeight: 1.5 }}>
            A loja deles lista todos os produtos. A captura percorre as páginas uma a uma (cerca de 60, pouco mais de um minuto).
          </p>
          {capturando === 'fixcell'
            ? <button onClick={() => { parar.current = true }} style={botao('#dc2626')}>Parar</button>
            : <button onClick={capturarFixcell} disabled={!!capturando || tabelaAusente} style={botao('#2563eb', !!capturando || tabelaAusente)}>Capturar catálogo completo</button>}
          {barra(progFix)}
        </div>

        {/* iPlay */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 15, color: '#0f172a' }}>iPlay</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {resumo.find(r => r.fornecedor === 'iplay')?.total ?? 0} peças
              {resumo.find(r => r.fornecedor === 'iplay')?.ultima ? ` · ${dataHora(resumo.find(r => r.fornecedor === 'iplay')!.ultima as string)}` : ''}
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 10px', lineHeight: 1.5 }}>
            A iPlay só oferece busca, não lista. A captura consulta tela, bateria e conector de cada modelo, uma busca a cada {PAUSA_IPLAY_MS / 1000} segundos. Pode parar e retomar: o que já foi consultado nos últimos 7 dias é pulado.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, fontSize: 13, color: '#334155' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name="origem-modelos" checked={origemModelos === 'os'} onChange={() => setOrigemModelos('os')} disabled={!!capturando} />
              Modelos que já passaram pela loja (das ordens de serviço)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name="origem-modelos" checked={origemModelos === 'todos'} onChange={() => setOrigemModelos('todos')} disabled={!!capturando} />
              Todos os {gerarModelos().length} modelos do sistema (cerca de {minutosIplay(gerarModelos().length * 3)} minutos)
            </label>
          </div>
          {capturando === 'iplay'
            ? <button onClick={() => { parar.current = true }} style={botao('#dc2626')}>Parar</button>
            : <button onClick={capturarIPlay} disabled={!!capturando || tabelaAusente} style={botao('#2563eb', !!capturando || tabelaAusente)}>Capturar por modelo</button>}
          {barra(progIplay)}
        </div>
      </div>

      {capturando && (
        <div style={{ fontSize: 12, color: '#b45309', marginBottom: 16 }}>
          Mantenha esta aba aberta até terminar. Fechar ou trocar de página interrompe a captura; o que já foi lido fica salvo.
        </div>
      )}

      {/* Consulta ao que já foi guardado */}
      <div style={card}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Procurar no catálogo: frontal a54, bateria iphone 11…"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        {busca.trim().length >= 2 && (
          <div style={{ marginTop: 12 }}>
            {buscando && <div style={{ fontSize: 12, color: '#94a3b8' }}>Procurando…</div>}
            {!buscando && pecas.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma peça guardada com esses termos.</div>}
            {pecas.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Fornecedor', 'Peça', 'Custo', 'Atualizado'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Custo' ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pecas.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{NOME_FORNECEDOR[p.fornecedor] ?? p.fornecedor}</td>
                      <td style={{ padding: '8px 10px', color: '#0f172a' }}>
                        {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0f172a', textDecoration: 'underline' }}>{p.nome}</a> : p.nome}
                        {p.codigo && <span style={{ color: '#94a3b8' }}> · cód. {p.codigo}</span>}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{reais(p.preco)}</td>
                      <td style={{ padding: '8px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{dataHora(p.atualizado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {pecas.length === 200 && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Mostrando as 200 mais baratas. Refine a busca para ver menos.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
