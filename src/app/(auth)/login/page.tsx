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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .oc-root {
          min-height: 100vh;
          display: flex;
          font-family: 'DM Sans', -apple-system, sans-serif;
          background: #030a10;
          color: #c8dff0;
          overflow: hidden;
        }

        /* ── LEFT BRAND PANEL ── */
        .oc-brand {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 56px 60px;
          overflow: hidden;
          background: radial-gradient(ellipse 80% 80% at 40% 60%, #041929 0%, #030a10 70%);
        }

        /* subtle grid texture */
        .oc-brand::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(13,245,216,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(13,245,216,0.025) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 80% 80% at 40% 60%, black 30%, transparent 80%);
        }

        /* glow blob */
        .oc-brand::after {
          content: '';
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(13,245,216,0.06) 0%, transparent 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        /* octopus svg container */
        .oc-octo {
          position: absolute;
          right: -60px;
          top: 50%;
          transform: translateY(-55%);
          animation: octo-float 9s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes octo-float {
          0%, 100% { transform: translateY(-55%) rotate(0deg); }
          30%       { transform: translateY(calc(-55% - 18px)) rotate(1.5deg); }
          65%       { transform: translateY(calc(-55% + 10px)) rotate(-1deg); }
        }

        /* tentacle individual animations */
        .t1 { animation: tw1 5s ease-in-out infinite; transform-origin: 50% 0%; }
        .t2 { animation: tw2 6s ease-in-out infinite 0.4s; transform-origin: 50% 0%; }
        .t3 { animation: tw1 4.5s ease-in-out infinite 0.8s; transform-origin: 50% 0%; }
        .t4 { animation: tw2 5.5s ease-in-out infinite 0.2s; transform-origin: 50% 0%; }
        .t5 { animation: tw1 6.5s ease-in-out infinite 0.6s; transform-origin: 50% 0%; }
        .t6 { animation: tw2 4.8s ease-in-out infinite 1s; transform-origin: 50% 0%; }
        .t7 { animation: tw1 5.2s ease-in-out infinite 0.3s; transform-origin: 50% 0%; }
        .t8 { animation: tw2 5.8s ease-in-out infinite 0.7s; transform-origin: 50% 0%; }

        @keyframes tw1 {
          0%, 100% { transform: rotate(0deg) scaleX(1); }
          50%       { transform: rotate(4deg) scaleX(0.97); }
        }
        @keyframes tw2 {
          0%, 100% { transform: rotate(0deg) scaleX(1); }
          50%       { transform: rotate(-4deg) scaleX(1.03); }
        }

        /* eye blink */
        .oc-eye-pupil {
          animation: blink 7s ease-in-out infinite 2s;
          transform-origin: center;
        }
        @keyframes blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%            { transform: scaleY(0.05); }
        }

        /* brand text */
        .oc-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(13,245,216,0.22);
          border-radius: 100px;
          padding: 5px 13px;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #0df5d8;
          font-weight: 500;
          margin-bottom: 22px;
          position: relative;
          z-index: 1;
        }

        .oc-chip-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #0df5d8;
          animation: pulse-dot 2.5s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }

        .oc-brand-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(58px, 7vw, 92px);
          font-weight: 800;
          line-height: 0.88;
          letter-spacing: -0.05em;
          color: #dff0ff;
          position: relative;
          z-index: 1;
          margin-bottom: 18px;
        }

        .oc-brand-title em {
          font-style: normal;
          color: #0df5d8;
        }

        .oc-brand-desc {
          font-size: 15px;
          color: #2d4f66;
          line-height: 1.65;
          max-width: 340px;
          font-weight: 300;
          position: relative;
          z-index: 1;
          margin-bottom: 44px;
        }

        .oc-metrics {
          display: flex;
          gap: 36px;
          position: relative;
          z-index: 1;
        }

        .oc-metric {
          border-left: 2px solid rgba(13,245,216,0.25);
          padding-left: 14px;
        }

        .oc-metric-val {
          font-family: 'Syne', sans-serif;
          font-size: 20px;
          font-weight: 700;
          color: #0df5d8;
          letter-spacing: -0.03em;
        }

        .oc-metric-lbl {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #1e3f55;
          margin-top: 3px;
          font-weight: 500;
        }

        /* ── RIGHT LOGIN PANEL ── */
        .oc-login {
          width: 460px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 52px;
          background: #060e17;
          border-left: 1px solid rgba(255,255,255,0.04);
          position: relative;
        }

        /* top accent line */
        .oc-login::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, #0df5d8 50%, transparent 100%);
          opacity: 0.5;
        }

        .oc-login-inner {
          width: 100%;
          animation: rise 0.6s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* logomark in login panel */
        .oc-logomark {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 48px;
        }

        .oc-logomark-name {
          font-family: 'Syne', sans-serif;
          font-size: 18px;
          font-weight: 800;
          color: #dff0ff;
          letter-spacing: -0.03em;
        }

        .oc-login-h {
          font-family: 'Syne', sans-serif;
          font-size: 26px;
          font-weight: 700;
          color: #dff0ff;
          letter-spacing: -0.04em;
          margin-bottom: 8px;
        }

        .oc-login-sub {
          font-size: 13px;
          color: #2d4f66;
          margin-bottom: 34px;
          line-height: 1.55;
          font-weight: 300;
        }

        .oc-field {
          margin-bottom: 18px;
        }

        .oc-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          color: #1e3f55;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-bottom: 8px;
        }

        .oc-input {
          width: 100%;
          padding: 13px 16px;
          background: rgba(13,245,216,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          font-size: 14px;
          color: #c8dff0;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }

        .oc-input::placeholder { color: #1e3347; }

        .oc-input:focus {
          border-color: rgba(13,245,216,0.45);
          background: rgba(13,245,216,0.05);
          box-shadow: 0 0 0 3px rgba(13,245,216,0.07), 0 0 16px rgba(13,245,216,0.04);
        }

        .oc-error {
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

        .oc-btn {
          width: 100%;
          padding: 14px;
          background: #0df5d8;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #03090e;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.01em;
          margin-top: 6px;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .oc-btn:hover:not(:disabled) {
          background: #06f0d0;
          box-shadow: 0 0 28px rgba(13,245,216,0.28), 0 4px 16px rgba(13,245,216,0.12);
          transform: translateY(-1px);
        }

        .oc-btn:active:not(:disabled) { transform: translateY(0); }

        .oc-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .oc-footer {
          margin-top: 40px;
          padding-top: 22px;
          border-top: 1px solid rgba(255,255,255,0.04);
        }

        .oc-footer p {
          font-size: 11px;
          color: #1a3045;
          line-height: 1.7;
          font-weight: 300;
        }

        .oc-footer code {
          font-size: 10px;
          color: rgba(13,245,216,0.45);
          font-family: 'DM Mono', monospace;
        }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        @media (max-width: 860px) {
          .oc-brand { display: none; }
          .oc-login { width: 100%; border-left: none; padding: 40px 28px; }
        }
      `}</style>

      <div className="oc-root">

        {/* ═══ LEFT: BRAND PANEL ═══ */}
        <div className="oc-brand">

          {/* Octopus SVG illustration */}
          <svg className="oc-octo" width="520" height="580" viewBox="0 0 520 580" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Mantle glow */}
            <ellipse cx="260" cy="195" rx="120" ry="140" fill="url(#mantle-glow)" opacity="0.12"/>

            {/* Tentacles — each with own class for stagger */}
            <path className="t1" d="M185 295 Q148 355 118 415 Q100 460 94 500 Q92 520 97 535" stroke="#0df5d8" strokeWidth="16" strokeLinecap="round" fill="none" opacity="0.9"/>
            <path className="t2" d="M215 308 Q192 375 182 435 Q176 472 179 505 Q181 522 185 532" stroke="#0df5d8" strokeWidth="13" strokeLinecap="round" fill="none" opacity="0.85"/>
            <path className="t3" d="M244 315 Q240 385 244 448 Q246 488 250 518 Q252 530 254 538" stroke="#0df5d8" strokeWidth="13" strokeLinecap="round" fill="none" opacity="0.82"/>
            <path className="t4" d="M272 314 Q282 382 292 445 Q300 488 303 520 Q305 532 306 540" stroke="#0df5d8" strokeWidth="12" strokeLinecap="round" fill="none" opacity="0.85"/>
            <path className="t5" d="M300 305 Q328 368 346 428 Q358 472 360 508 Q361 524 360 538" stroke="#0df5d8" strokeWidth="13" strokeLinecap="round" fill="none" opacity="0.88"/>
            <path className="t6" d="M325 292 Q360 352 382 410 Q396 455 400 492 Q402 512 400 528" stroke="#0df5d8" strokeWidth="12" strokeLinecap="round" fill="none" opacity="0.78"/>
            <path className="t7" d="M158 280 Q112 338 84 398 Q66 444 60 482 Q58 504 62 522" stroke="#0df5d8" strokeWidth="11" strokeLinecap="round" fill="none" opacity="0.72"/>
            <path className="t8" d="M346 278 Q392 334 418 393 Q436 440 440 478 Q442 500 438 518" stroke="#0df5d8" strokeWidth="11" strokeLinecap="round" fill="none" opacity="0.68"/>

            {/* Sucker dots on tentacles */}
            <circle cx="155" cy="348" r="5" fill="#0df5d8" opacity="0.35"/>
            <circle cx="128" cy="405" r="4" fill="#0df5d8" opacity="0.3"/>
            <circle cx="300" cy="352" r="4.5" fill="#0df5d8" opacity="0.35"/>
            <circle cx="332" cy="415" r="4" fill="#0df5d8" opacity="0.28"/>
            <circle cx="185" cy="372" r="3.5" fill="#0df5d8" opacity="0.3"/>
            <circle cx="360" cy="380" r="3.5" fill="#0df5d8" opacity="0.28"/>

            {/* Mantle body */}
            <ellipse cx="260" cy="188" rx="108" ry="128" fill="#051a28" stroke="#0df5d8" strokeWidth="1.5" strokeOpacity="0.4"/>

            {/* Mantle highlight top */}
            <ellipse cx="248" cy="108" rx="52" ry="28" fill="rgba(13,245,216,0.06)" stroke="none"/>

            {/* Eyes */}
            <ellipse cx="225" cy="182" rx="20" ry="22" fill="#03111d" stroke="#0df5d8" strokeWidth="1" strokeOpacity="0.5"/>
            <ellipse cx="295" cy="182" rx="20" ry="22" fill="#03111d" stroke="#0df5d8" strokeWidth="1" strokeOpacity="0.5"/>

            {/* Pupils */}
            <g className="oc-eye-pupil">
              <circle cx="228" cy="179" r="9" fill="#0df5d8" opacity="0.9"/>
              <circle cx="298" cy="179" r="9" fill="#0df5d8" opacity="0.9"/>
              <circle cx="231" cy="176" r="4" fill="#030e19"/>
              <circle cx="301" cy="176" r="4" fill="#030e19"/>
              {/* catchlight */}
              <circle cx="234" cy="173" r="2" fill="rgba(255,255,255,0.7)"/>
              <circle cx="304" cy="173" r="2" fill="rgba(255,255,255,0.7)"/>
            </g>

            {/* Mouth hint */}
            <path d="M248 228 Q260 238 272 228" stroke="#0df5d8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.35" fill="none"/>

            {/* Texture spots on mantle */}
            <circle cx="240" cy="145" r="3" fill="rgba(13,245,216,0.1)"/>
            <circle cx="275" cy="138" r="2" fill="rgba(13,245,216,0.08)"/>
            <circle cx="218" cy="160" r="2.5" fill="rgba(13,245,216,0.07)"/>
            <circle cx="300" cy="155" r="2" fill="rgba(13,245,216,0.09)"/>
            <circle cx="258" cy="252" r="2.5" fill="rgba(13,245,216,0.1)"/>

            {/* Web connecting base of tentacles */}
            <path d="M175 285 Q215 310 260 316 Q305 310 345 285" stroke="#0df5d8" strokeWidth="1" strokeOpacity="0.2" fill="rgba(13,245,216,0.04)"/>

            <defs>
              <radialGradient id="mantle-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0df5d8"/>
                <stop offset="100%" stopColor="#0df5d8" stopOpacity="0"/>
              </radialGradient>
            </defs>
          </svg>

          {/* Brand content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="oc-chip">
              <span className="oc-chip-dot"/>
              Assistência técnica
            </div>

            <h1 className="oc-brand-title">
              Octa<em>OS</em>
            </h1>

            <p className="oc-brand-desc">
              Gestão inteligente para assistência técnica de celulares. Ordens de serviço, estoque, clientes e aparelhos — tudo interligado como tentáculos.
            </p>

            <div className="oc-metrics">
              <div className="oc-metric">
                <div className="oc-metric-val">OS</div>
                <div className="oc-metric-lbl">Ordens de serviço</div>
              </div>
              <div className="oc-metric">
                <div className="oc-metric-val">360°</div>
                <div className="oc-metric-lbl">Visibilidade total</div>
              </div>
              <div className="oc-metric">
                <div className="oc-metric-val">8×</div>
                <div className="oc-metric-lbl">Mais ágil</div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: LOGIN PANEL ═══ */}
        <div className="oc-login">
          <div className="oc-login-inner">

            {/* Logomark */}
            <div className="oc-logomark">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="18" fill="rgba(13,245,216,0.08)"/>
                <ellipse cx="18" cy="16.5" rx="8.5" ry="9.5" fill="#0df5d8"/>
                <circle cx="14.5" cy="14.5" r="2.5" fill="#030e19"/>
                <circle cx="21.5" cy="14.5" r="2.5" fill="#030e19"/>
                <circle cx="15.5" cy="13.5" r="1" fill="rgba(255,255,255,0.6)"/>
                <circle cx="22.5" cy="13.5" r="1" fill="rgba(255,255,255,0.6)"/>
                <path d="M12 25.5 Q10 29 9.5 33" stroke="#0df5d8" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M15 26.5 Q14.5 30 15 33.5" stroke="#0df5d8" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M18 27 Q18 31 18 34" stroke="#0df5d8" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M21 26.5 Q21.5 30 21 33.5" stroke="#0df5d8" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M24 25.5 Q26 29 26.5 33" stroke="#0df5d8" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
              <span className="oc-logomark-name">OctaOS</span>
            </div>

            <h2 className="oc-login-h">Bem-vindo de volta</h2>
            <p className="oc-login-sub">Entre com suas credenciais para acessar o sistema</p>

            <form onSubmit={handleLogin}>
              <div className="oc-field">
                <label className="oc-label">E-mail</label>
                <input
                  className="oc-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="oc-field">
                <label className="oc-label">Senha</label>
                <input
                  className="oc-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="oc-error">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" className="oc-btn" disabled={loading}>
                {loading ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.75s linear infinite', flexShrink: 0 }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Acessando...
                  </>
                ) : (
                  <>Acessar o sistema <span style={{ opacity: 0.6 }}>→</span></>
                )}
              </button>
            </form>

            <div className="oc-footer">
              <p>
                Primeiro acesso? Crie o usuário em:<br/>
                <code>Supabase → Authentication → Users → Add User</code>
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
