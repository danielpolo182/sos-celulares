# Landing Page OctaOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o redirect em `src/app/page.tsx` pela landing page de vendas do OctaOS e criar a página de cadastro de trial em `src/app/(auth)/cadastro/page.tsx`.

**Architecture:** A landing page é um único componente 'use client' com seções inline e CSS via tag `<style>` (media queries de responsividade). O mockup do sistema é renderizado em HTML/CSS puro, sem imagens externas. A página de cadastro segue o padrão visual do login existente.

**Tech Stack:** Next.js 15, React, inline styles, `<style>` para media queries, Supabase Auth (`@supabase/ssr` createBrowserClient), DM Sans + Bebas Neue (já carregadas em globals.css).

---

## Mapa de arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Modificar | `src/app/page.tsx` | Landing page completa (substitui redirect) |
| Criar | `src/app/(auth)/cadastro/page.tsx` | Formulário de cadastro de trial |

---

## Task 1: Navbar + Hero

**Arquivos:**
- Modificar: `src/app/page.tsx`

- [ ] **Substituir o conteúdo de `src/app/page.tsx` pelo esqueleto da landing com Navbar e Hero:**

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'

// ── Dados dos módulos ─────────────────────────────────────
const MODULOS = [
  { icon: '📋', nome: 'Ordens de Serviço', frase: 'Abertura, acompanhamento e entrega' },
  { icon: '👥', nome: 'Clientes',          frase: 'Cadastro completo com histórico' },
  { icon: '📣', nome: 'CRM',               frase: 'Retenção e reativação automática' },
  { icon: '📦', nome: 'Estoque',           frase: 'Peças, produtos e alertas de estoque' },
  { icon: '💳', nome: 'PDV',               frase: 'Vendas rápidas no balcão' },
  { icon: '🛡', nome: 'Garantias',         frase: 'Controle de garantias acionadas' },
  { icon: '📄', nome: 'Contratos',         frase: 'Geração de contratos e termos' },
  { icon: '🏭', nome: 'Fornecedores',      frase: 'Cadastro e pedidos de peças' },
  { icon: '✅', nome: 'Rotinas',           frase: 'Checklist diário da equipe' },
  { icon: '📱', nome: 'Compra & Venda',    frase: 'Aparelhos usados com termo legal' },
  { icon: '🔒', nome: 'Fechamento',        frase: 'Fechamento de caixa diário' },
  { icon: '📈', nome: 'Relatórios',        frase: 'Financeiro, OS, estoque e mais' },
]

const FEATURES = [
  {
    icon: '📋', bg: '#dbeafe', titulo: 'Ordens de serviço do início ao fim',
    texto: 'Abertura, orçamento, execução e entrega com histórico completo. Impressão em A4 ou bobina. Notificação automática ao cliente via WhatsApp.',
    badges: ['Histórico completo', 'Impressão', 'WhatsApp', 'Assinatura digital'],
  },
  {
    icon: '💳', bg: '#d1fae5', titulo: 'PDV integrado ao estoque',
    texto: 'Venda peças e serviços com baixa automática no estoque. Fechamento de caixa com relatório de formas de pagamento.',
    badges: ['Baixa automática', 'Fechamento de caixa', 'Múltiplas formas de pgto'],
  },
  {
    icon: '📣', bg: '#fef3c7', titulo: 'CRM com WhatsApp automático',
    texto: 'Identifique clientes inativos, OS prontas não retiradas e aniversariantes. Disparo de mensagens WhatsApp diretamente pelo sistema.',
    badges: ['Clientes inativos', 'Aniversariantes', 'OS prontas', 'Rotina diária'],
  },
]

const BENEFICIOS = [
  'Acesso completo a todos os módulos',
  '1 loja incluída',
  'Suporte por e-mail',
  'Atualizações inclusas',
  '7 dias grátis para testar',
]

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: 'DM Sans', sans-serif; background: #fff; color: #0f172a; -webkit-font-smoothing: antialiased; }

        .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

        /* Navbar */
        .navbar { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid #e2e8f0; height: 60px; display: flex; align-items: center; }
        .navbar-inner { display: flex; justify-content: space-between; align-items: center; width: 100%; }
        .logo { font-family: 'Bebas Neue', sans-serif; font-size: 24px; font-weight: 400; letter-spacing: 0.03em; color: #1e293b; text-decoration: none; display: flex; align-items: center; }
        .logo em { font-style: normal; color: #fff; background: #2563eb; padding: 0.04em 0.18em 0.06em; border-radius: 0.12em; margin-left: 0.1em; }
        .nav-link { font-size: 14px; color: #374151; text-decoration: none; padding: 8px 16px; border: 1px solid #e2e8f0; border-radius: 8px; transition: background 0.15s; }
        .nav-link:hover { background: #f8fafc; }

        /* Hero */
        .hero { padding: 80px 0; display: grid; grid-template-columns: 60fr 40fr; gap: 60px; align-items: center; }
        .hero-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; color: #2563eb; text-transform: uppercase; margin-bottom: 16px; }
        .hero-headline { font-size: 42px; font-weight: 700; color: #0f172a; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 18px; }
        .hero-sub { font-size: 17px; color: #475569; line-height: 1.6; margin-bottom: 32px; }
        .hero-btns { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .btn-primary { display: inline-flex; align-items: center; padding: 14px 28px; background: #2563eb; color: #fff; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none; transition: background 0.15s, transform 0.1s; border: none; cursor: pointer; }
        .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); }
        .btn-ghost { display: inline-flex; align-items: center; padding: 14px 24px; color: #374151; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 15px; font-weight: 500; text-decoration: none; transition: background 0.15s; }
        .btn-ghost:hover { background: #f8fafc; }
        .hero-note { font-size: 12px; color: #94a3b8; }

        /* Mockup */
        .mockup-wrap { border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.12); border: 1px solid #e2e8f0; overflow: hidden; }
        .mockup-bar { background: #f1f5f9; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; display: flex; align-items: center; gap: 6px; }
        .mockup-dot { width: 10px; height: 10px; border-radius: 50%; }
        .mockup-body { display: flex; height: 280px; }
        .mockup-sidebar { width: 56px; background: #1e293b; padding: 12px 8px; display: flex; flex-direction: column; gap: 8px; }
        .mockup-sidebar-item { width: 40px; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; }
        .mockup-sidebar-item.active { background: #2563eb; }
        .mockup-content { flex: 1; background: #f1f5f9; padding: 14px; overflow: hidden; }
        .mockup-title { font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
        .mockup-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
        .mockup-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
        .mockup-card-num { font-size: 16px; font-weight: 700; color: #0f172a; }
        .mockup-card-label { font-size: 8px; color: #94a3b8; margin-top: 2px; }
        .mockup-row { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
        .mockup-badge { font-size: 7px; padding: 2px 6px; border-radius: 20px; font-weight: 600; }

        /* Strip */
        .strip { background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 32px 0; }
        .strip-inner { display: grid; grid-template-columns: repeat(4, 1fr); }
        .strip-item { text-align: center; padding: 0 24px; }
        .strip-item + .strip-item { border-left: 1px solid #e2e8f0; }
        .strip-num { font-size: 32px; font-weight: 700; color: #2563eb; line-height: 1; margin-bottom: 6px; }
        .strip-label { font-size: 13px; color: #64748b; }

        /* Módulos */
        .section { padding: 80px 0; }
        .section-title { font-size: 32px; font-weight: 700; color: #0f172a; text-align: center; letter-spacing: -0.02em; margin-bottom: 10px; }
        .section-sub { font-size: 16px; color: #64748b; text-align: center; margin-bottom: 48px; }
        .modulos-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .modulo-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; transition: box-shadow 0.15s, transform 0.15s; cursor: default; }
        .modulo-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-2px); }
        .modulo-icon { font-size: 24px; margin-bottom: 10px; }
        .modulo-nome { font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 4px; }
        .modulo-frase { font-size: 12px; color: #64748b; line-height: 1.4; }

        /* Features */
        .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .feature-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; }
        .feature-icon-wrap { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 26px; margin-bottom: 20px; }
        .feature-titulo { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 10px; line-height: 1.3; }
        .feature-texto { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 18px; }
        .feature-badges { display: flex; flex-wrap: wrap; gap: 6px; }
        .feature-badge { font-size: 11px; background: #f1f5f9; color: #374151; padding: 4px 10px; border-radius: 20px; font-weight: 500; }

        /* Preços */
        .precos-section { padding: 80px 0; background: #f8fafc; }
        .precos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 800px; margin: 0 auto; }
        .preco-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; position: relative; }
        .preco-card.destaque { border: 2px solid #2563eb; }
        .badge-popular { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #2563eb; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 16px; border-radius: 20px; white-space: nowrap; }
        .preco-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
        .preco-valor { font-size: 42px; font-weight: 700; color: #0f172a; line-height: 1; margin-bottom: 4px; }
        .preco-valor span { font-size: 18px; font-weight: 500; color: #64748b; }
        .preco-cobranca { font-size: 13px; color: #64748b; margin-bottom: 8px; }
        .preco-economia { display: inline-block; font-size: 11px; font-weight: 600; background: #d1fae5; color: #065f46; padding: 3px 10px; border-radius: 20px; margin-bottom: 24px; }
        .preco-divider { height: 1px; background: #f1f5f9; margin: 20px 0; }
        .preco-beneficios { list-style: none; display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
        .preco-beneficio { font-size: 14px; color: #374151; display: flex; align-items: center; gap: 10px; }
        .preco-beneficio::before { content: '✓'; color: #10b981; font-weight: 700; flex-shrink: 0; }
        .btn-preco-outline { display: block; text-align: center; padding: 13px; border: 2px solid #2563eb; border-radius: 8px; color: #2563eb; font-size: 14px; font-weight: 600; text-decoration: none; transition: background 0.15s; }
        .btn-preco-outline:hover { background: #eff6ff; }
        .btn-preco-solid { display: block; text-align: center; padding: 13px; background: #2563eb; border-radius: 8px; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; transition: background 0.15s; }
        .btn-preco-solid:hover { background: #1d4ed8; }

        /* CTA Final */
        .cta-final { background: #2563eb; padding: 80px 0; text-align: center; }
        .cta-headline { font-size: 36px; font-weight: 700; color: #fff; margin-bottom: 12px; }
        .cta-sub { font-size: 16px; color: rgba(255,255,255,0.75); margin-bottom: 32px; }
        .btn-white { display: inline-flex; align-items: center; padding: 14px 32px; background: #fff; color: #1d4ed8; border-radius: 8px; font-size: 15px; font-weight: 700; text-decoration: none; transition: transform 0.1s; }
        .btn-white:hover { transform: translateY(-1px); }

        /* Footer */
        .footer { background: #0f172a; padding: 48px 0 24px; }
        .footer-main { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
        .footer-logo { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: #e2e8f0; display: flex; align-items: center; margin-bottom: 8px; }
        .footer-logo em { font-style: normal; background: #2563eb; color: #fff; padding: 0.04em 0.18em 0.06em; border-radius: 0.12em; margin-left: 0.1em; }
        .footer-tagline { font-size: 13px; color: #475569; }
        .footer-links { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
        .footer-link { font-size: 13px; color: #64748b; text-decoration: none; transition: color 0.15s; }
        .footer-link:hover { color: #94a3b8; }
        .footer-bottom { border-top: 1px solid #1e293b; padding-top: 20px; font-size: 12px; color: #334155; text-align: center; }

        /* Responsivo */
        @media (max-width: 768px) {
          .hero { grid-template-columns: 1fr; gap: 40px; padding: 48px 0; }
          .hero-headline { font-size: 30px; }
          .mockup-wrap { display: none; }
          .strip-inner { grid-template-columns: repeat(2, 1fr); gap: 20px; }
          .strip-item + .strip-item { border-left: none; }
          .strip-item:nth-child(odd) { border-right: 1px solid #e2e8f0; }
          .modulos-grid { grid-template-columns: repeat(2, 1fr); }
          .features-grid { grid-template-columns: 1fr; }
          .precos-grid { grid-template-columns: 1fr; }
          .precos-grid .destaque { order: -1; }
          .footer-main { flex-direction: column; gap: 24px; }
          .footer-links { align-items: flex-start; }
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <div className="container">
          <div className="navbar-inner">
            <Link href="/" className="logo">Octa<em>OS</em></Link>
            <Link href="/login" className="nav-link">Entrar no sistema</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="container">
        <div className="hero">
          <div>
            <p className="hero-eyebrow">Gestão para assistências técnicas</p>
            <h1 className="hero-headline">O sistema que a sua assistência técnica merecia</h1>
            <p className="hero-sub">OS, estoque, PDV, CRM e muito mais. Tudo no browser, sem instalação, sem complicação.</p>
            <div className="hero-btns">
              <Link href="/cadastro" className="btn-primary">Começar 7 dias grátis</Link>
              <a href="#modulos" className="btn-ghost">Ver como funciona →</a>
            </div>
            <p className="hero-note">Sem cartão de crédito · Cancele quando quiser</p>
          </div>
          <div>
            <MockupDashboard />
          </div>
        </div>
      </section>

      {/* ── STRIP ── */}
      <div className="strip">
        <div className="container">
          <div className="strip-inner">
            {[
              { num: '12+',   label: 'módulos integrados' },
              { num: '100%',  label: 'no browser' },
              { num: '7 dias', label: 'grátis para testar' },
              { num: '1 loja', label: 'no plano base' },
            ].map(s => (
              <div key={s.label} className="strip-item">
                <div className="strip-num">{s.num}</div>
                <div className="strip-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MÓDULOS ── */}
      <section id="modulos" className="section">
        <div className="container">
          <h2 className="section-title">Tudo que você precisa, em um só lugar</h2>
          <p className="section-sub">Cada módulo foi desenhado para a rotina real de uma assistência técnica.</p>
          <div className="modulos-grid">
            {MODULOS.map(m => (
              <div key={m.nome} className="modulo-card">
                <div className="modulo-icon">{m.icon}</div>
                <div className="modulo-nome">{m.nome}</div>
                <div className="modulo-frase">{m.frase}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="section" style={{ background: '#f8fafc', padding: '80px 0' }}>
        <div className="container">
          <h2 className="section-title">Por que o OctaOS é diferente</h2>
          <p className="section-sub">Funcionalidades pensadas para o dia a dia de quem conserta celular.</p>
          <div className="features-grid">
            {FEATURES.map(f => (
              <div key={f.titulo} className="feature-card">
                <div className="feature-icon-wrap" style={{ background: f.bg }}>{f.icon}</div>
                <h3 className="feature-titulo">{f.titulo}</h3>
                <p className="feature-texto">{f.texto}</p>
                <div className="feature-badges">
                  {f.badges.map(b => <span key={b} className="feature-badge">{b}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PREÇOS ── */}
      <section className="precos-section">
        <div className="container">
          <h2 className="section-title">Planos simples, sem surpresa</h2>
          <p className="section-sub">Todos os módulos em qualquer plano. Escolha a forma de pagamento.</p>
          <div className="precos-grid">
            {/* Mensal */}
            <div className="preco-card">
              <p className="preco-label">Mensal</p>
              <div className="preco-valor">R$ 49<span>,99/mês</span></div>
              <p className="preco-cobranca">Cobrado mensalmente</p>
              <div className="preco-divider" />
              <ul className="preco-beneficios">
                {BENEFICIOS.map(b => <li key={b} className="preco-beneficio">{b}</li>)}
              </ul>
              <Link href="/cadastro" className="btn-preco-outline">Começar trial gratuito</Link>
            </div>
            {/* Anual */}
            <div className="preco-card destaque">
              <div className="badge-popular">⭐ Mais popular</div>
              <p className="preco-label">Anual</p>
              <div className="preco-valor">R$ 39<span>,99/mês</span></div>
              <p className="preco-cobranca">12x sem juros · R$ 479,88/ano</p>
              <span className="preco-economia">Economize R$ 120/ano</span>
              <div className="preco-divider" />
              <ul className="preco-beneficios">
                {BENEFICIOS.map(b => <li key={b} className="preco-beneficio">{b}</li>)}
              </ul>
              <Link href="/cadastro" className="btn-preco-solid">Começar trial gratuito</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="cta-final">
        <div className="container">
          <h2 className="cta-headline">Comece grátis por 7 dias</h2>
          <p className="cta-sub">Sem cartão de crédito. Cancele quando quiser.</p>
          <Link href="/cadastro" className="btn-white">Criar conta gratuita →</Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-main">
            <div>
              <div className="footer-logo">Octa<em>OS</em></div>
              <p className="footer-tagline">Gestão para assistências técnicas</p>
            </div>
            <div className="footer-links">
              <Link href="/login" className="footer-link">Entrar no sistema</Link>
              <a href="mailto:suporte@octaos.com.br" className="footer-link">Suporte</a>
            </div>
          </div>
          <div className="footer-bottom">© 2026 OctaOS · Todos os direitos reservados</div>
        </div>
      </footer>
    </>
  )
}

// ── Mockup do sistema (HTML/CSS puro, sem imagem) ─────────
function MockupDashboard() {
  return (
    <div className="mockup-wrap">
      <div className="mockup-bar">
        <div className="mockup-dot" style={{ background: '#ef4444' }} />
        <div className="mockup-dot" style={{ background: '#f59e0b' }} />
        <div className="mockup-dot" style={{ background: '#10b981' }} />
        <span style={{ marginLeft: 8, fontSize: 10, color: '#94a3b8' }}>octaos.com.br/dashboard</span>
      </div>
      <div className="mockup-body">
        <div className="mockup-sidebar">
          <div style={{ width: 40, height: 8, background: '#2563eb', borderRadius: 4, marginBottom: 12 }} />
          {['active','','','','',''].map((a, i) => (
            <div key={i} className="mockup-sidebar-item" style={a === 'active' ? { background: '#2563eb' } : {}} />
          ))}
        </div>
        <div className="mockup-content">
          <div className="mockup-title">Dashboard</div>
          <div className="mockup-cards">
            <div className="mockup-card">
              <div className="mockup-card-num" style={{ color: '#2563eb' }}>42</div>
              <div className="mockup-card-label">OS abertas</div>
            </div>
            <div className="mockup-card">
              <div className="mockup-card-num" style={{ color: '#10b981' }}>R$ 8.420</div>
              <div className="mockup-card-label">Faturamento mês</div>
            </div>
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Últimas OS</div>
          {[
            { num: '#1042', status: 'Pronta',    cor: '#10b981', bg: '#d1fae5' },
            { num: '#1041', status: 'Em reparo', cor: '#f59e0b', bg: '#fef3c7' },
            { num: '#1040', status: 'Aguardando',cor: '#ef4444', bg: '#fee2e2' },
          ].map(os => (
            <div key={os.num} className="mockup-row">
              <span style={{ fontSize: 9, fontWeight: 700, color: '#0f172a', flex: 1 }}>{os.num}</span>
              <span className="mockup-badge" style={{ background: os.bg, color: os.cor }}>{os.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Verificar que o arquivo salvo não tem caracteres corrompidos:**

```powershell
$content = [System.IO.File]::ReadAllText('src/app/page.tsx', [System.Text.Encoding]::UTF8)
if ($content -match 'ðŸ|Ã£|Ã©') { Write-Host "ENCODING ERROR" } else { Write-Host "OK" }
```

- [ ] **Rodar o servidor de dev e abrir http://localhost:3000 para validar visualmente:**

```bash
npm run dev
```

Esperado: landing page carrega, navbar sticky, hero com mockup à direita, sem erros de console.

- [ ] **Commit:**

```bash
git add src/app/page.tsx
git commit -m "feat(landing): navbar + hero + strip + módulos + features + preços + CTA + footer"
```

---

## Task 2: Página de cadastro

**Arquivos:**
- Criar: `src/app/(auth)/cadastro/page.tsx`

- [ ] **Criar `src/app/(auth)/cadastro/page.tsx`:**

```tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()

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
      setError(err.message === 'User already registered'
        ? 'Este e-mail já está cadastrado. Faça login.'
        : 'Erro ao criar conta: ' + err.message)
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
        html, body { background: #f1f5f9; }
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
```

- [ ] **Verificar encoding do arquivo criado:**

```powershell
$content = [System.IO.File]::ReadAllText('src/app/(auth)/cadastro/page.tsx', [System.Text.Encoding]::UTF8)
if ($content -match 'ðŸ|Ã£|Ã©') { Write-Host "ENCODING ERROR" } else { Write-Host "OK" }
```

- [ ] **Testar fluxo no browser:**

1. Abrir http://localhost:3000/cadastro
2. Verificar visual idêntico ao login (card centralizado, fundo `#f1f5f9`)
3. Testar validações: submeter com campos vazios, senhas que não coincidem, senha curta
4. Verificar que erros aparecem corretamente

- [ ] **Commit:**

```bash
git add src/app/(auth)/cadastro/page.tsx
git commit -m "feat(cadastro): página de registro de trial (7 dias grátis)"
```

---

## Task 3: Ajuste no metadata do root layout

**Arquivos:**
- Modificar: `src/app/layout.tsx`

- [ ] **Atualizar o metadata para refletir a landing page:**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OctaOS — Sistema de Gestão para Assistências Técnicas',
  description: 'OS, estoque, PDV, CRM, garantias e muito mais. Gerencie sua assistência técnica de celulares com o OctaOS. Teste grátis por 7 dias.',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Verificar no browser que o título da aba mudou para "OctaOS — Sistema de Gestão para Assistências Técnicas".**

- [ ] **Commit:**

```bash
git add src/app/layout.tsx
git commit -m "chore: atualizar metadata do root layout para landing page"
```

---

## Self-review checklist

### Spec coverage

| Requisito da spec | Coberto em |
|-------------------|-----------|
| Navbar: logo + link login | Task 1 |
| Hero: duas colunas, eyebrow, headline, subtítulo, 2 botões, nota | Task 1 |
| Hero: mockup HTML/CSS do sistema | Task 1 — componente `MockupDashboard` |
| Strip de números (4 métricas) | Task 1 |
| Grid de módulos 12 cards | Task 1 |
| Features em destaque (3 cards) | Task 1 |
| Planos: Mensal R$49,99 / Anual R$39,99 12x | Task 1 |
| CTA final azul | Task 1 |
| Footer escuro | Task 1 |
| Responsivo < 768px | Task 1 — media queries no `<style>` |
| Página de cadastro: campos + validação | Task 2 |
| Cadastro: Supabase signUp + redirect dashboard | Task 2 |
| Cadastro: visual idêntico ao login | Task 2 |
| Metadata atualizado | Task 3 |

### Placeholder scan: nenhum TBD, TODO ou "similar ao task N" encontrado. ✅

### Consistência de tipos: `MockupDashboard` é função local sem props, usado inline. `MODULOS`, `FEATURES`, `BENEFICIOS` são arrays constantes no topo do arquivo — referenciados corretamente nas seções. ✅

### Encoding: ambas as tasks incluem verificação de encoding após criação do arquivo. ✅
