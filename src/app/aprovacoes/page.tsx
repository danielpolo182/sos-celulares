'use client'
// Fila de aprovação de publicações: o que o programa da loja montou aparece aqui para conferir,
// aprovar (entra no próximo horário da grade), publicar na hora ou descartar.
import { useCallback, useEffect, useState } from 'react'

type Servico = { nome?: string; preco?: number | null }
type Item = {
  id: string; titulo: string; situacao: string
  dados: { os?: number; modelo?: string; servicos?: Servico[] } | null
  agendado_para: string | null; publicado_em: string | null; ig_link: string | null; erro: string | null
  atrasado: boolean; video_url: string | null; quadro_url: string | null
}
type Aba = 'aprovar' | 'agendados' | 'publicados'
type Acao = 'aprovar' | 'descartar' | 'publicar_agora' | 'cancelar' | 'tentar_de_novo'

const ABAS: { key: Aba; rotulo: string; vazio: string }[] = [
  { key: 'aprovar', rotulo: 'Para aprovar', vazio: 'Nada esperando aprovação. Quando um story for montado na loja, ele aparece aqui.' },
  { key: 'agendados', rotulo: 'Agendados', vazio: 'Nenhuma publicação agendada.' },
  { key: 'publicados', rotulo: 'Publicados', vazio: 'Nada publicado nos últimos 7 dias.' },
]
const FUSO = 'America/Sao_Paulo'
const diaDe = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d)

/** "Hoje às 18h00", "Amanhã às 7h30" ou "sáb., 29/11 às 12h00", na hora de Brasília. */
function quando(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: 'numeric', minute: '2-digit' }).format(d).replace(':', 'h')
  const hoje = diaDe(new Date()), amanha = diaDe(new Date(Date.now() + 86_400_000)), ontem = diaDe(new Date(Date.now() - 86_400_000))
  const dia = diaDe(d) === hoje ? 'Hoje' : diaDe(d) === amanha ? 'Amanhã' : diaDe(d) === ontem ? 'Ontem'
    : new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit' }).format(d)
  return `${dia} às ${hora}`
}
const reais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0 })

const botao = (cor: string, fundo: string, borda = fundo): React.CSSProperties => ({
  padding: '10px 14px', borderRadius: 10, border: `1px solid ${borda}`, background: fundo, color: cor,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
})

export default function AprovacoesPage() {
  const [aba, setAba] = useState<Aba>('aprovar')
  const [itens, setItens] = useState<Item[]>([])
  const [pendentes, setPendentes] = useState(0)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null)
  const [desligada, setDesligada] = useState(false)

  const carregar = useCallback(async (qual: Aba) => {
    setCarregando(true)
    try {
      const r = await fetch(`/api/marketing/fila?aba=${qual}`, { cache: 'no-store' })
      if (r.status === 401) { window.location.href = '/login'; return }
      if (r.status === 404) { setDesligada(true); return }
      const j = await r.json()
      if (!r.ok) { setAviso({ texto: j.error ?? 'Não consegui ler a fila.', erro: true }); return }
      setItens(j.itens ?? [])
      setPendentes(j.pendentes ?? 0)
      setMarcados(new Set())
    } catch {
      setAviso({ texto: 'Sem conexão. Tente de novo.', erro: true })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar(aba) }, [aba, carregar])

  async function agir(acao: Acao, ids: string[], confirmar?: string) {
    if (!ids.length || ocupado) return
    if (confirmar && !window.confirm(confirmar)) return
    setOcupado(true)
    setAviso(acao === 'publicar_agora' ? { texto: 'Publicando… pode levar até um minuto.', erro: false } : null)
    try {
      const r = await fetch('/api/marketing/fila', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, ids }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setAviso({ texto: j.error ?? 'Não deu certo. Tente de novo.', erro: true })
      else {
        const recusados: { motivo: string }[] = j.recusados ?? []
        const feito =
          acao === 'publicar_agora' ? (
            j.resultado === 'publicado' ? 'Publicado no Instagram.'
            : j.resultado === 'aguardando_meta' ? 'O Instagram ainda está processando o vídeo. Ele sai sozinho em alguns minutos.'
            : j.resultado === 'falhou' ? 'A publicação falhou. Veja o motivo no item.'
            : j.resultado === 'vai_tentar_de_novo' ? 'O Instagram recusou agora; o sistema vai tentar de novo sozinho.'
            : '')
          : acao === 'aprovar' ? `${j.feitos} aprovado(s). Veja os horários em Agendados.`
          : acao === 'descartar' ? `${j.feitos} descartado(s).`
          : acao === 'cancelar' ? 'Voltou para a aprovação.'
          : 'Vai ser publicado em instantes.'
        const texto = [j.feitos ? feito : '', ...recusados.map(x => x.motivo)].filter(Boolean).join(' ')
        setAviso(texto ? { texto, erro: recusados.length > 0 || j.resultado === 'falhou' } : null)
      }
    } catch {
      setAviso({ texto: 'Sem conexão. Tente de novo.', erro: true })
    } finally {
      setOcupado(false)
      carregar(aba)
    }
  }

  function marcar(id: string) {
    setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const selecionaveis = itens.filter(i => i.situacao === 'pendente' || i.situacao === 'falhou')
  const idsMarcados = [...marcados]
  const marcadosPendentes = itens.filter(i => marcados.has(i.id) && i.situacao === 'pendente').map(i => i.id)

  if (desligada) {
    return (
      <main style={{ minHeight: '100vh', background: '#f8fafc', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#475569' }}>
          <p style={{ fontSize: 16, marginBottom: 12 }}>A fila de aprovação não está ligada para esta loja.</p>
          <a href="/dashboard" style={{ color: '#2563eb' }}>← Voltar ao OctaOS</a>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', color: '#0f172a', paddingBottom: aba === 'aprovar' ? 96 : 24 }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 5 }}>
        <a href="/dashboard" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>← OctaOS</a>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#fff' }}>Aprovações</h1>
      </header>

      <nav role="tablist" style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 49, zIndex: 4 }}>
        {ABAS.map(a => (
          <button key={a.key} role="tab" aria-selected={aba === a.key} onClick={() => { setAviso(null); setAba(a.key) }}
            style={{ flex: 1, padding: '12px 6px', border: 'none', background: 'transparent', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
              fontWeight: aba === a.key ? 700 : 500, color: aba === a.key ? '#0f172a' : '#64748b',
              borderBottom: aba === a.key ? '3px solid #fdc900' : '3px solid transparent' }}>
            {a.rotulo}{a.key === 'aprovar' && pendentes > 0 ? ` (${pendentes})` : ''}
          </button>
        ))}
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 12px' }}>
        {aviso && (
          <div role="status" style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 12, fontSize: 14,
            background: aviso.erro ? '#fef2f2' : '#f0fdf4', color: aviso.erro ? '#991b1b' : '#166534', border: `1px solid ${aviso.erro ? '#fecaca' : '#bbf7d0'}` }}>
            {aviso.texto}
          </div>
        )}

        {carregando && <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: 24 }}>Carregando…</p>}
        {!carregando && itens.length === 0 && (
          <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: '40px 16px' }}>{ABAS.find(a => a.key === aba)!.vazio}</p>
        )}

        {!carregando && itens.map(item => {
          const servicos = (item.dados?.servicos ?? []).filter(s => s?.nome)
          const marcavel = aba === 'aprovar'
          return (
            <article key={item.id} style={{ background: '#fff', border: `1px solid ${marcados.has(item.id) ? '#fdc900' : '#e2e8f0'}`, borderRadius: 14, padding: 12, marginBottom: 12,
              boxShadow: marcados.has(item.id) ? '0 0 0 2px #fde68a' : 'none' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: marcavel ? 'pointer' : 'default' }}>
                {marcavel && (
                  <input type="checkbox" checked={marcados.has(item.id)} onChange={() => marcar(item.id)}
                    aria-label={`Selecionar ${item.titulo}`} style={{ width: 22, height: 22, marginTop: 2, accentColor: '#0f172a', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{item.titulo}</div>
                  {servicos.length > 0 && (
                    <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
                      {servicos.map(s => s.nome + (typeof s.preco === 'number' ? ` · ${reais(s.preco)}` : '')).join('  |  ')}
                    </div>
                  )}
                  {item.situacao === 'aprovado' && (
                    <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600, color: item.atrasado ? '#b91c1c' : '#166534' }}>
                      {quando(item.agendado_para)}{item.atrasado ? ' · atrasado' : ''}
                    </div>
                  )}
                  {item.situacao === 'publicando' && <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600, color: '#92400e' }}>Publicando…</div>}
                  {item.situacao === 'publicado' && <div style={{ fontSize: 13, marginTop: 4, color: '#166534' }}>Publicado · {quando(item.publicado_em)}</div>}
                  {item.situacao === 'falhou' && (
                    <div style={{ fontSize: 13, marginTop: 4, color: '#b91c1c', fontWeight: 600 }}>Falhou: {item.erro ?? 'motivo não informado'}</div>
                  )}
                </div>
              </label>

              {(item.video_url || item.quadro_url) && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  {item.video_url && (
                    <video src={item.video_url} controls playsInline preload="metadata"
                      style={{ width: 'min(100%, 200px)', aspectRatio: '9 / 16', background: '#000', borderRadius: 10 }} />
                  )}
                  {item.quadro_url && (
                    <figure style={{ margin: 0, width: 'min(100%, 200px)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.quadro_url} alt="Último quadro do vídeo" style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
                      <figcaption style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>Último quadro. Confira: aparece nome ou tela de cliente?</figcaption>
                    </figure>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {item.situacao === 'pendente' && (
                  <button disabled={ocupado} onClick={() => agir('publicar_agora', [item.id], `Publicar "${item.titulo}" no Instagram agora?`)}
                    style={botao('#0f172a', '#fff', '#cbd5e1')}>Publicar agora</button>
                )}
                {item.situacao === 'falhou' && (
                  <button disabled={ocupado} onClick={() => agir('tentar_de_novo', [item.id])} style={botao('#0f172a', '#fff', '#cbd5e1')}>Tentar de novo</button>
                )}
                {item.situacao === 'aprovado' && (
                  <>
                    <button disabled={ocupado} onClick={() => agir('publicar_agora', [item.id], `Publicar "${item.titulo}" no Instagram agora?`)}
                      style={botao('#0f172a', '#fff', '#cbd5e1')}>Publicar agora</button>
                    <button disabled={ocupado} onClick={() => agir('cancelar', [item.id])} style={botao('#b91c1c', '#fff', '#fecaca')}>Cancelar</button>
                  </>
                )}
                {item.situacao === 'publicado' && item.ig_link && (
                  <a href={item.ig_link} target="_blank" rel="noreferrer" style={{ ...botao('#0f172a', '#fff', '#cbd5e1'), textDecoration: 'none' }}>Ver no Instagram</a>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {aba === 'aprovar' && selecionaveis.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '10px 12px', display: 'flex', gap: 8, justifyContent: 'center', zIndex: 6 }}>
          <button disabled={ocupado || marcadosPendentes.length === 0} onClick={() => agir('aprovar', marcadosPendentes)}
            style={{ ...botao('#0f172a', '#fdc900'), flex: 1, maxWidth: 360, opacity: marcadosPendentes.length ? 1 : 0.5 }}>
            Aprovar selecionados{marcadosPendentes.length ? ` (${marcadosPendentes.length})` : ''}
          </button>
          <button disabled={ocupado || idsMarcados.length === 0}
            onClick={() => agir('descartar', idsMarcados, `Descartar ${idsMarcados.length} item(ns)? A gravação no computador da loja não é apagada.`)}
            style={{ ...botao('#b91c1c', '#fff', '#fecaca'), opacity: idsMarcados.length ? 1 : 0.5 }}>
            Descartar
          </button>
        </div>
      )}
    </main>
  )
}
