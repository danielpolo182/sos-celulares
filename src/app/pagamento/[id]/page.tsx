'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

type PixData = {
  qrCodeBase64: string
  pixCopiaCola: string
  expiraEm: string
  valor: number
  tipoReferencia: 'os' | 'pdv'
  referenciaId: string
}

export default function PagamentoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [pixData, setPixData] = useState<PixData | null>(null)
  const [status, setStatus] = useState<'pendente' | 'aprovado' | 'expirado'>('pendente')
  const [timeLeft, setTimeLeft] = useState(0)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem(`pix_${id}`)
    if (raw) {
      const data = JSON.parse(raw) as PixData
      setPixData(data)
      const ms = new Date(data.expiraEm).getTime() - Date.now()
      setTimeLeft(Math.max(0, Math.floor(ms / 1000)))
    }
  }, [id])

  // Countdown
  useEffect(() => {
    if (status !== 'pendente') return
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { setStatus('expirado'); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [status])

  // Polling
  const checkStatus = useCallback(async () => {
    if (status !== 'pendente') return
    try {
      const res = await fetch(`/api/pix/${id}/status`)
      if (!res.ok) return
      const data = await res.json() as { status: string }
      if (data.status === 'aprovado') setStatus('aprovado')
      else if (data.status === 'expirado') setStatus('expirado')
    } catch {}
  }, [id, status])

  useEffect(() => {
    const t = setInterval(checkStatus, 3000)
    return () => clearInterval(t)
  }, [checkStatus])

  const copiar = async () => {
    if (!pixData) return
    await navigator.clipboard.writeText(pixData.pixCopiaCola)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const voltar = () => {
    if (!pixData) { router.back(); return }
    if (pixData.tipoReferencia === 'os') router.push(`/os/${pixData.referenciaId}`)
    else router.push('/pdv')
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (status === 'aprovado') {
    return (
      <div style={{ minHeight: '100vh', background: '#16a34a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, color: '#fff' }}>
        <div style={{ fontSize: 80 }}>✅</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Pagamento confirmado!</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>O PIX foi recebido com sucesso.</p>
        <button onClick={voltar} style={{ marginTop: 16, padding: '12px 32px', background: '#fff', color: '#16a34a', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
          Voltar
        </button>
      </div>
    )
  }

  if (status === 'expirado') {
    return (
      <div style={{ minHeight: '100vh', background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, color: '#fff' }}>
        <div style={{ fontSize: 64 }}>⏰</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>QR Code expirado</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>O prazo de 15 minutos encerrou.</p>
        <button onClick={voltar} style={{ marginTop: 16, padding: '12px 32px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
          Gerar novo QR
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#fff' }}>
      {pixData ? (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Cobrança PIX</h1>
          <p style={{ fontSize: 36, fontWeight: 800, color: '#4ade80', margin: '0 0 24px' }}>
            R$ {Number(pixData.valor).toFixed(2).replace('.', ',')}
          </p>

          <div style={{ background: '#fff', padding: 16, borderRadius: 12, marginBottom: 20 }}>
            <img
              src={`data:image/png;base64,${pixData.qrCodeBase64}`}
              alt="QR Code PIX"
              style={{ width: 240, height: 240, display: 'block' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, color: timeLeft < 60 ? '#f87171' : '#94a3b8' }}>
            <span style={{ fontSize: 18 }}>⏱</span>
            <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700 }}>{formatTime(timeLeft)}</span>
          </div>

          <button
            onClick={copiar}
            style={{ padding: '10px 24px', background: copiado ? '#16a34a' : '#334155', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}
          >
            {copiado ? '✓ Copiado!' : '📋 Copiar código Pix'}
          </button>

          <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 280 }}>
            Aponte a câmera do celular para o QR Code ou cole o código no aplicativo do banco.
          </p>
        </>
      ) : (
        <p style={{ color: '#94a3b8' }}>Carregando...</p>
      )}
    </div>
  )
}
