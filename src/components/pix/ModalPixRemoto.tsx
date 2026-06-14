'use client'

import { useEffect, useState, useCallback } from 'react'

type Props = {
  cobrancaId: string
  pixCopiaCola: string
  valor: number
  expiraEm: string
  temTelefone: boolean
  onClose: () => void
  onPago: () => void
}

export default function ModalPixRemoto({ cobrancaId, pixCopiaCola, valor, expiraEm, temTelefone, onClose, onPago }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [waEnviado, setWaEnviado] = useState(false)
  const [enviandoWa, setEnviandoWa] = useState(false)
  const [status, setStatus] = useState<'pendente' | 'aprovado' | 'expirado'>('pendente')
  const [erroWa, setErroWa] = useState<string | null>(null)

  const copiar = async () => {
    await navigator.clipboard.writeText(pixCopiaCola)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const enviarWa = async () => {
    setEnviandoWa(true)
    setErroWa(null)
    try {
      const res = await fetch(`/api/pix/${cobrancaId}/enviar-wa`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setErroWa(d.error ?? 'Erro ao enviar')
      } else {
        setWaEnviado(true)
      }
    } catch {
      setErroWa('Erro de conexão')
    } finally {
      setEnviandoWa(false)
    }
  }

  const checkStatus = useCallback(async () => {
    if (status !== 'pendente') return
    try {
      const res = await fetch(`/api/pix/${cobrancaId}/status`)
      if (!res.ok) return
      const d = await res.json() as { status: string }
      if (d.status === 'aprovado') {
        setStatus('aprovado')
        onPago()
      } else if (d.status === 'expirado') {
        setStatus('expirado')
      }
    } catch {}
  }, [cobrancaId, status, onPago])

  useEffect(() => {
    const t = setInterval(checkStatus, 10000)
    return () => clearInterval(t)
  }, [checkStatus])

  const valorFmt = `R$ ${Number(valor).toFixed(2).replace('.', ',')}`
  const expiraFmt = new Date(expiraEm).toLocaleString('pt-BR')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Cobrança PIX Remota</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {status === 'aprovado' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 56 }}>✅</div>
            <p style={{ fontSize: 20, fontWeight: 700, color: '#16a34a', margin: '12px 0 4px' }}>Pagamento confirmado!</p>
            <p style={{ color: '#64748b', margin: 0 }}>O PIX foi recebido com sucesso.</p>
            <button onClick={onClose} style={{ marginTop: 20, padding: '10px 28px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                <span>Valor</span>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{valorFmt}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                <span>Válido até</span>
                <span>{expiraFmt}</span>
              </div>
            </div>

            {status === 'expirado' ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 16, textAlign: 'center', marginBottom: 16 }}>
                <p style={{ color: '#dc2626', margin: 0, fontWeight: 600 }}>⏰ Código expirado</p>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', fontWeight: 600 }}>Código PIX copia e cola:</p>
                <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 11, color: '#374151', wordBreak: 'break-all', marginBottom: 12, maxHeight: 80, overflow: 'auto' }}>
                  {pixCopiaCola}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button
                onClick={copiar}
                disabled={status === 'expirado'}
                style={{ padding: '10px 16px', background: copiado ? '#16a34a' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: status === 'expirado' ? 'not-allowed' : 'pointer', opacity: status === 'expirado' ? 0.5 : 1 }}
              >
                {copiado ? '✓ Copiado!' : '📋 Copiar código PIX'}
              </button>

              <button
                onClick={enviarWa}
                disabled={!temTelefone || waEnviado || enviandoWa || status === 'expirado'}
                title={!temTelefone ? 'Cliente sem telefone cadastrado' : undefined}
                style={{ padding: '10px 16px', background: waEnviado ? '#16a34a' : '#25d366', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: (!temTelefone || waEnviado || enviandoWa || status === 'expirado') ? 'not-allowed' : 'pointer', opacity: (!temTelefone || status === 'expirado') ? 0.5 : 1 }}
              >
                {enviandoWa ? 'Enviando...' : waEnviado ? '✓ WA enviado' : '📲 Enviar via WhatsApp'}
              </button>

              {erroWa && (
                <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>Erro: {erroWa}</p>
              )}

              {!temTelefone && (
                <p style={{ color: '#94a3b8', fontSize: 11, margin: 0, textAlign: 'center' }}>
                  Cliente sem telefone — envio via WhatsApp indisponível
                </p>
              )}
            </div>

            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
              Verificando pagamento automaticamente a cada 10 segundos…
            </p>
          </>
        )}
      </div>
    </div>
  )
}
