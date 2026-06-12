'use client'
export const dynamic = 'force-dynamic'

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
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #030a10; }

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Sans', sans-serif;
          background: #030a10;
        }

        .login-card {
          width: 420px;
          background: #060e17;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 48px 44px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.5);
        }

        .logo-row {
          margin-bottom: 40px;
        }

        .logo-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px;
          font-weight: 400;
          letter-spacing: 0.03em;
          color: #dff0ff;
          line-height: 1;
          display: inline-flex;
          align-items: center;
        }

        .logo-name em {
          font-style: normal;
          color: #020c12;
          background: #0df5d8;
          padding: 0.04em 0.18em 0.06em;
          border-radius: 0.12em;
          margin-left: 0.1em;
          display: inline-block;
          letter-spacing: 0.01em;
        }

        .login-h {
          font-family: 'Syne', sans-serif;
          font-size: 26px;
          font-weight: 700;
          color: #dff0ff;
          letter-spacing: -0.04em;
          margin-bottom: 8px;
        }

        .login-sub {
          font-size: 13px;
          color: #2a4a60;
          margin-bottom: 32px;
          font-weight: 300;
        }

        .field { margin-bottom: 18px; }

        .field-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          color: #1e3a50;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-bottom: 7px;
        }

        .field-input {
          width: 100%;
          padding: 13px 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          font-size: 14px;
          color: #c8dff0;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }

        .field-input::placeholder { color: #1c3348; }

        .field-input:focus {
          border-color: rgba(13,245,216,0.4);
          background: rgba(13,245,216,0.04);
          box-shadow: 0 0 0 3px rgba(13,245,216,0.07);
        }

        .error-box {
          background: rgba(239,68,68,0.07);
          border: 1px solid rgba(239,68,68,0.18);
          border-radius: 8px;
          padding: 11px 14px;
          font-size: 13px;
          color: #fca5a5;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 18px;
          font-weight: 300;
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          background: #0df5d8;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #020c12;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          margin-top: 6px;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .submit-btn:hover:not(:disabled) {
          background: #06f0d0;
          box-shadow: 0 0 28px rgba(13,245,216,0.28);
          transform: translateY(-1px);
        }

        .submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .card-footer {
          margin-top: 36px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.04);
          font-size: 11px;
          color: #18303f;
          font-weight: 300;
          line-height: 1.7;
        }

        .card-footer code { font-size: 10px; color: rgba(13,245,216,0.4); }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 500px) {
          .login-card { width: 100%; margin: 16px; padding: 36px 24px; }
        }
      `}</style>

      <div className="login-root">
        <div className="login-card">

          <div className="logo-row">
            <div className="logo-name">Octa<em>OS</em></div>
          </div>

          <h2 className="login-h">Bem-vindo de volta</h2>
          <p className="login-sub">Entre com suas credenciais para acessar o sistema</p>

          <form onSubmit={handleLogin}>
            <div className="field">
              <label className="field-label">E-mail</label>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label className="field-label">Senha</label>
              <input
                className="field-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="error-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ animation: 'spin 0.75s linear infinite', flexShrink: 0 }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Verificando...
                </>
              ) : (
                <>Acessar o sistema <span style={{ opacity: 0.6 }}>→</span></>
              )}
            </button>
          </form>

          <div className="card-footer">
            Primeiro acesso? Crie o usuário em:<br/>
            <code>Supabase → Authentication → Users → Add User</code>
          </div>

        </div>
      </div>
    </>
  )
}
