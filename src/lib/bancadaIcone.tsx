// Ícone do aplicativo da bancada, desenhado em código para não depender de arquivo de imagem.
import { ImageResponse } from 'next/og'

export function iconeDaBancada(lado: number) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f8fafc' }}>
        <div style={{ display: 'flex', fontSize: lado * 0.34, fontWeight: 800, letterSpacing: -2 }}>OS</div>
        <div style={{ display: 'flex', marginTop: lado * 0.04 }}>
          <div style={{ width: lado * 0.2, height: lado * 0.07, borderRadius: lado * 0.035, background: '#f59e0b', marginRight: lado * 0.04 }} />
          <div style={{ width: lado * 0.2, height: lado * 0.07, borderRadius: lado * 0.035, background: '#22c55e' }} />
        </div>
      </div>
    ),
    { width: lado, height: lado }
  )
}
