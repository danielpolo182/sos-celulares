'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha incorretos. Tente novamente.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#0f172a',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Left panel — branding */}
      <div style={{
        width: '45%',
        padding: '60px 64px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60,
          width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: '#6366f1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>
              📱
            </div>
            <span style={{
              fontSize: 20, fontWeight: 600, color: '#f8fafc',
              letterSpacing: '-0.02em',
            }}>
              SOS Celulares
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#475569', marginLeft: 52 }}>
            Sistema de Gestão
          </p>
        </div>

        {/* Central message */}
        <div>
          <h1 style={{
            fontSize: 42, fontWeight: 600, color: '#f8fafc',
            lineHeight: 1.15, letterSpacing: '-0.03em',
            marginBottom: 20,
          }}>
            Sua assistência<br />
            <span style={{ color: '#818cf8' }}>no controle total.</span>
          </h1>
          <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.7, maxWidth: 340 }}>
            OS, clientes, estoque e vendas em um único lugar.
            Acesse de qualquer dispositivo, funciona mesmo offline.
          </p>

          {/* Feature pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 28 }}>
            {['Ordens de serviço', 'PDV', 'Estoque', 'Multi-filial', 'Offline'].map(f => (
              <span key={f} style={{
                fontSize: 12, fontWeight: 500,
                background: 'rgba(99,102,241,0.12)',
                color: '#a5b4fc',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 20, padding: '4px 12px',
              }}>{f}</span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 12, color: '#334155' }}>
          © 2026 SOS Celulares · Todos os direitos reservados
        </p>
      </div>

      {/* Right panel — login form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 80px',
        background: '#0f172a',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{
            fontSize: 26, fontWeight: 600, color: '#f8fafc',
            letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            Bem-vindo de volta
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 36 }}>
            Entre com suas credenciais para continuar
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: '#94a3b8', marginBottom: 6,
              }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8, fontSize: 14,
                  color: '#f1f5f9',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = '#334155'}
              />
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: '#94a3b8', marginBottom: 6,
              }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8, fontSize: 14,
                  color: '#f1f5f9',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = '#334155'}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 13, color: '#fca5a5',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? '#4338ca' : '#6366f1',
                color: '#fff',
                border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, transform 0.1s',
                marginTop: 4,
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#4f46e5' }}
              onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#6366f1' }}
            >
              {loading ? 'Entrando...' : 'Entrar no sistema'}
            </button>
          </form>

          <div style={{
            marginTop: 28, padding: '16px',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: 8,
          }}>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 500 }}>
              Primeiro acesso? Crie sua conta no painel do Supabase:
            </p>
            <p style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-mono)' }}>
              Authentication → Users → Add User
            </p>
          </div>

          <p style={{
            fontSize: 12, color: '#334155', textAlign: 'center', marginTop: 28,
          }}>
            Protegido por criptografia de ponta a ponta
          </p>
        </div>
      </div>
    </div>
  )
}
