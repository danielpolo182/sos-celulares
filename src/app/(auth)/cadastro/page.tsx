'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function CadastroPage() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nome.trim()) { setError('Informe seu nome.'); return }
    if (senha.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (senha !== confirma) { setError('As senhas não coincidem.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { data: { nome: nome.trim() } },
    })
    if (err) {
      setError(
        err.message === 'User already registered'
          ? 'Este e-mail já está cadastrado. Faça login.'
          : 'Erro ao criar conta: ' + err.message
      )
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .cad-root { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'DM Sans', sans-serif; background: #f1f5f9; padding: 24px; }
        .cad-card { width: 100%; max-width: 440px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 48px 44px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .cad-logo { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #1e293b; display: inline-flex; align-items: center; text-decoration: none; margin-bottom: 32px; }
        .cad-logo em { font-style: normal; color: #fff; background: #2563eb; padding: 0.04em 0.18em 0.06em; border-radius: 0.12em; margin-left: 0.1em; }
        .cad-h { font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.03em; margin-bottom: 6px; }
        .cad-sub { font-size: 13px; color: #94a3b8; margin-bottom: 28px; }
        .cad-trial { background: #dbeafe; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #1d4ed8; font-weight: 500; margin-bottom: 24px; }
        .field { margin-bottom: 16px; }
        .field-label { display: block; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 7px; }
        .field-input { width: 100%; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; color: #0f172a; outline: none; font-family: 'DM Sans', sans-serif; transition: border-color 0.2s, background 0.2s; }
        .field-input:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .field-input::placeholder { color: #cbd5e1; }
        .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 11px 14px; font-size: 13px; color: #dc2626; margin-bottom: 16px; }
        .submit-btn { width: 100%; padding: 14px; background: #2563eb; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #fff; cursor: pointer; font-family: 'DM Sans', sans-serif; margin-top: 4px; transition: background 0.2s; box-shadow: 0 2px 8px rgba(37,99,235,0.3); }
        .submit-btn:hover:not(:disabled) { background: #1d4ed8; }
        .submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .cad-footer { margin-top: 24px; text-align: center; font-size: 13px; color: #64748b; }
        .cad-footer a { color: #2563eb; font-weight: 500; text-decoration: none; }
        @media (max-width: 500px) { .cad-card { padding: 36px 24px; } }
      `}</style>

      <div className="cad-root">
        <div className="cad-card">
          <Link href="/" className="cad-logo">Octa<em>OS</em></Link>
          <h2 className="cad-h">Crie sua conta</h2>
          <p className="cad-sub">Comece agora, grátis por 7 dias.</p>
          <div className="cad-trial">🎉 7 dias grátis · Sem cartão de crédito · Cancele quando quiser</div>

          <form onSubmit={handleCadastro}>
            <div className="field">
              <label className="field-label">Nome completo</label>
              <input className="field-input" type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" required autoComplete="name" />
            </div>
            <div className="field">
              <label className="field-label">E-mail</label>
              <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email" />
            </div>
            <div className="field">
              <label className="field-label">Senha</label>
              <input className="field-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" required autoComplete="new-password" />
            </div>
            <div className="field">
              <label className="field-label">Confirmar senha</label>
              <input className="field-input" type="password" value={confirma} onChange={e => setConfirma(e.target.value)} placeholder="Repita a senha" required autoComplete="new-password" />
            </div>

            {error && <div className="error-box">{error}</div>}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta gratuita →'}
            </button>
          </form>

          <div className="cad-footer">
            Já tem conta? <Link href="/login">Entrar no sistema</Link>
          </div>
        </div>
      </div>
    </>
  )
}