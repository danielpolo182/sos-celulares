'use client'
// Tela da bancada, para um celular fixo ao lado do técnico: escolhe "Em
// andamento" ou "Pronta", digita o número da OS e aperta Enter. O sistema muda
// o status da OS e avisa o cliente pelo WhatsApp.
import { useEffect, useRef, useState } from 'react'

type Acao = 'em_andamento' | 'pronta'
type ResumoOS = { numero: number; cliente: string; telefone: string; aparelho: string; statusAtual: string }
type Aviso = { resultado: string; erro?: string }
type Registro = { hora: string; numero: number; acao: Acao; cliente: string; aparelho: string; aviso: string; ok: boolean }

const ACOES: Record<Acao, { rotulo: string; cor: string; ajuda: string }> = {
  em_andamento: { rotulo: 'Em andamento', cor: '#f59e0b', ajuda: 'Avisa o cliente que o reparo começou' },
  pronta: { rotulo: 'Pronta', cor: '#22c55e', ajuda: 'Avisa o cliente que pode retirar' },
}

const CHAVE_DE_CONFIRMACAO = 'bancada-confirmar'

function textoDoAviso(a: Aviso): { texto: string; ok: boolean } {
  switch (a.resultado) {
    case 'enviado': return { texto: 'WhatsApp enviado ao cliente', ok: true }
    case 'ja_avisado': return { texto: 'Cliente já tinha sido avisado; não enviei de novo', ok: true }
    case 'sem_telefone': return { texto: 'Status alterado, mas a OS não tem telefone: cliente NÃO avisado', ok: false }
    case 'sem_whatsapp': return { texto: 'Status alterado, mas o WhatsApp da loja não está configurado: cliente NÃO avisado', ok: false }
    case 'falhou': return { texto: `Status alterado, mas o WhatsApp recusou o envio: ${a.erro ?? 'motivo não informado'}`, ok: false }
    default: return { texto: 'Status alterado; aviso não enviado', ok: false }
  }
}

export default function Bancada() {
  const [acao, setAcao] = useState<Acao>('em_andamento')
  const [numero, setNumero] = useState('')
  const [pendente, setPendente] = useState<ResumoOS | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState<{ texto: string; ok: boolean } | null>(null)
  const [historico, setHistorico] = useState<Registro[]>([])
  const [confirmar, setConfirmar] = useState(true)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { if (localStorage.getItem(CHAVE_DE_CONFIRMACAO) === 'nao') setConfirmar(false) } catch { /* sem armazenamento local */ }
    campo.current?.focus()
  }, [])

  const focar = () => setTimeout(() => campo.current?.focus(), 50)

  function trocarConfirmacao(valor: boolean) {
    setConfirmar(valor)
    try { localStorage.setItem(CHAVE_DE_CONFIRMACAO, valor ? 'sim' : 'nao') } catch { /* sem armazenamento local */ }
    focar()
  }

  function limpar() { setNumero(''); setPendente(null); focar() }

  async function chamar(confirmando: boolean) {
    const res = await fetch('/api/bancada', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, status: acao, confirmar: confirmando }),
    })
    const json = await res.json().catch(() => ({ error: 'Resposta inesperada do servidor.' }))
    return { ok: res.ok, json: json as { error?: string; os?: ResumoOS; feito?: boolean; aviso?: Aviso } }
  }

  async function enviar() {
    if (ocupado || !numero.trim()) return
    setOcupado(true); setMensagem(null)
    try {
      // Sem conferência, o primeiro Enter já confirma
      const { ok, json } = await chamar(!confirmar || !!pendente)
      if (!ok) {
        setMensagem({ texto: json.error ?? 'Não deu certo. Tente de novo.', ok: false })
        setPendente(null); setNumero('')
      } else if (json.feito && json.os && json.aviso) {
        const aviso = textoDoAviso(json.aviso)
        setMensagem({ texto: `OS ${json.os.numero} → ${ACOES[acao].rotulo}. ${aviso.texto}.`, ok: aviso.ok })
        setHistorico(h => [{
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          numero: json.os!.numero, acao, cliente: json.os!.cliente, aparelho: json.os!.aparelho, aviso: aviso.texto, ok: aviso.ok,
        }, ...h].slice(0, 12))
        setPendente(null); setNumero('')
      } else if (json.os) {
        setPendente(json.os)
      }
    } catch {
      setMensagem({ texto: 'Sem conexão com o sistema. Confira a internet e tente de novo.', ok: false })
    }
    setOcupado(false)
    focar()
  }

  const cor = ACOES[acao].cor

  return (
    <div style={{ minHeight: '100dvh', background: '#0f172a', color: '#f8fafc', fontFamily: "'Segoe UI', Roboto, Arial, sans-serif", padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {(Object.keys(ACOES) as Acao[]).map(a => {
          const ativa = a === acao
          return (
            <button key={a} type="button" onClick={() => { setAcao(a); setPendente(null); setMensagem(null); focar() }}
              style={{ padding: '18px 8px', borderRadius: 14, border: `2px solid ${ativa ? ACOES[a].cor : '#334155'}`, background: ativa ? ACOES[a].cor : 'transparent', color: ativa ? '#0f172a' : '#94a3b8', fontSize: 20, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
              {ACOES[a].rotulo}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: -6 }}>{ACOES[acao].ajuda}</div>

      <form onSubmit={e => { e.preventDefault(); enviar() }}>
        <input ref={campo} name="numero-os" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="go" placeholder="Nº da OS"
          value={numero} disabled={ocupado}
          onChange={e => { setNumero(e.target.value.replace(/\D/g, '').slice(0, 7)); setPendente(null) }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '18px 12px', borderRadius: 14, border: `2px solid ${cor}`, background: '#1e293b', color: '#f8fafc', fontSize: 44, fontWeight: 800, textAlign: 'center', fontFamily: 'inherit', outline: 'none', letterSpacing: 2 }} />

        {pendente && (
          <div style={{ marginTop: 12, background: '#1e293b', border: `2px solid ${cor}`, borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>OS nº {pendente.numero} · hoje está como &quot;{pendente.statusAtual}&quot;</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{pendente.cliente}</div>
            <div style={{ fontSize: 16, color: '#cbd5e1', marginTop: 2 }}>{pendente.aparelho}{pendente.telefone ? ` · telefone ${pendente.telefone}` : ' · SEM TELEFONE'}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: pendente ? '1fr 2fr' : '1fr', gap: 10, marginTop: 12 }}>
          {pendente && (
            <button type="button" onClick={limpar} disabled={ocupado}
              style={{ padding: 16, borderRadius: 14, border: '2px solid #334155', background: 'transparent', color: '#cbd5e1', fontSize: 17, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              Cancelar
            </button>
          )}
          <button type="submit" disabled={ocupado || !numero}
            style={{ padding: 16, borderRadius: 14, border: 'none', background: cor, color: '#0f172a', fontSize: 19, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', opacity: ocupado || !numero ? 0.5 : 1 }}>
            {ocupado ? 'Aguarde…' : pendente ? `Confirmar: ${ACOES[acao].rotulo}` : confirmar ? 'Buscar OS' : `Marcar: ${ACOES[acao].rotulo}`}
          </button>
        </div>
      </form>

      {mensagem && (
        <div role="status" style={{ background: mensagem.ok ? '#14532d' : '#7f1d1d', border: `1px solid ${mensagem.ok ? '#22c55e' : '#f87171'}`, borderRadius: 12, padding: '12px 14px', fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
          {mensagem.ok ? '✓ ' : '⚠ '}{mensagem.texto}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8' }}>
        <input type="checkbox" checked={confirmar} onChange={e => trocarConfirmacao(e.target.checked)} style={{ width: 18, height: 18 }} />
        Mostrar o nome do cliente antes de enviar (dois Enter)
      </label>

      {historico.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Feito agora</div>
          {historico.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid #1e293b', fontSize: 14, alignItems: 'baseline' }}>
              <span style={{ color: '#64748b', width: 44, flexShrink: 0 }}>{h.hora}</span>
              <span style={{ fontWeight: 800, width: 54, flexShrink: 0 }}>{h.numero}</span>
              <span style={{ color: ACOES[h.acao].cor, fontWeight: 700, width: 104, flexShrink: 0 }}>{ACOES[h.acao].rotulo}</span>
              <span style={{ color: h.ok ? '#cbd5e1' : '#fca5a5', minWidth: 0 }}>{h.cliente} · {h.aparelho}{h.ok ? '' : ` · ${h.aviso}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
