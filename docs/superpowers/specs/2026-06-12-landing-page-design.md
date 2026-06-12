# Landing Page OctaOS — Especificação

**Data:** 2026-06-12
**Domínio:** octaos.com.br
**Stack:** Next.js 15, React, inline styles, Supabase Auth

---

## Objetivo

Página de vendas e entrada do sistema OctaOS. Serve dois propósitos:
1. Convencer donos de assistências técnicas a iniciar um trial gratuito
2. Dar acesso ao login para clientes já cadastrados

---

## Roteamento

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `src/app/page.tsx` | Landing page (substitui redirect atual) |
| `/cadastro` | `src/app/cadastro/page.tsx` | Página de cadastro do trial (nova) |
| `/login` | `src/app/(auth)/login/page.tsx` | Já existe — sem alterações |

A landing page usa o layout raiz `src/app/layout.tsx` (sem sidebar nem topbar — esses ficam apenas no `(app)/layout.tsx`). Nenhuma alteração de layout é necessária.

---

## Seções da landing (ordem de cima para baixo)

### 1. Navbar
- **Fundo:** branco, `border-bottom: 1px solid #e2e8f0`, `position: sticky, top: 0`, `z-index: 50`
- **Esquerda:** logo `Octa` + badge `OS` (Bebas Neue, mesmo padrão do `/login`)
- **Direita:** link "Entrar no sistema" → `/login` (estilo ghost, `color: #374151`)
- **Altura:** 60px, max-width 1200px centralizado

### 2. Hero
- **Layout:** duas colunas, gap 60px, padding vertical 80px
- **Coluna esquerda (60%):**
  - Eyebrow: "Gestão para assistências técnicas" — texto pequeno, `color: #2563eb`, `font-weight: 600`, `letter-spacing: 0.06em`, maiúsculas
  - Headline: ~40px, `font-weight: 700`, `color: #0f172a`, line-height 1.15 — ex: *"O sistema que a sua assistência técnica merecia"*
  - Subtítulo: 16px, `color: #475569` — ex: *"OS, estoque, PDV, CRM e muito mais. Tudo no browser, sem instalação."*
  - Botão primário: "Começar 7 dias grátis" → `/cadastro`, `background: #2563eb`, `color: #fff`, padding `14px 28px`, border-radius 8px
  - Botão secundário: "Ver como funciona →" — ghost, âncora `#modulos`, `color: #374151`, `border: 1px solid #e2e8f0`
  - Nota abaixo dos botões: "Sem cartão de crédito · Cancele quando quiser" — `font-size: 12px`, `color: #94a3b8`
- **Coluna direita (40%):**
  - Mockup estilizado do dashboard renderizado em HTML/CSS puro
  - Simula a sidebar escura + área de conteúdo com cards de OS
  - `border-radius: 12px`, `box-shadow: 0 20px 60px rgba(0,0,0,0.12)`, `border: 1px solid #e2e8f0`
  - Não usar imagem — renderizar com divs para não depender de screenshot

### 3. Strip de números
- Fundo: `#f8fafc`, `border-top` e `border-bottom: 1px solid #e2e8f0`, padding 24px
- 4 métricas em linha: **12+ módulos**, **100% no browser**, **7 dias grátis**, **1 loja incluída**
- Cada métrica: número grande bold azul + label cinza embaixo
- Separadores verticais entre elas

### 4. Grid de módulos (âncora: `id="modulos"`)
- Título: "Tudo que você precisa, em um só lugar"
- Subtítulo: "Cada módulo foi desenhado para a rotina real de uma assistência técnica."
- Grid: `grid-template-columns: repeat(4, 1fr)`, gap 14px (2 colunas em mobile)
- 12 cards — um por módulo:

| Ícone | Módulo | Frase |
|-------|--------|-------|
| 📋 | Ordens de Serviço | Abertura, acompanhamento e entrega |
| 👥 | Clientes | Cadastro completo com histórico |
| 📣 | CRM | Retenção e reativação automática |
| 📦 | Estoque | Peças, produtos e alertas de estoque |
| 💳 | PDV | Vendas rápidas no balcão |
| 🛡 | Garantias | Controle de garantias acionadas |
| 📄 | Contratos | Geração de contratos e termos |
| 🏭 | Fornecedores | Cadastro e pedidos de peças |
| ✅ | Rotinas | Checklist diário da equipe |
| 📱 | Compra & Venda | Aparelhos usados com termo legal |
| 🔒 | Fechamento | Fechamento de caixa diário |
| 📈 | Relatórios | Financeiro, OS, estoque e mais |

- Cada card: `background: #fff`, `border: 1px solid #e2e8f0`, `border-radius: 12px`, padding 20px, hover `box-shadow: 0 4px 16px rgba(0,0,0,0.08)`, `transition: 0.15s`

### 5. Features em destaque
- 3 cards grandes em row (colapsa para coluna em mobile)
- Cada card: ícone grande (48px) em fundo colorido arredondado, título, parágrafo, badges de sub-features

**Feature 1 — OS Completa**
- Ícone: 📋, fundo `#dbeafe`
- Título: "Ordens de serviço do início ao fim"
- Texto: "Abertura, orçamento, execução e entrega com histórico completo. Impressão em A4 ou bobina. Notificação automática ao cliente via WhatsApp."
- Badges: Histórico completo · Impressão · WhatsApp · Assinatura digital

**Feature 2 — PDV + Estoque**
- Ícone: 💳, fundo `#d1fae5`
- Título: "PDV integrado ao estoque"
- Texto: "Venda peças e serviços com baixa automática no estoque. Fechamento de caixa com relatório de formas de pagamento."
- Badges: Baixa automática · Fechamento de caixa · Múltiplas formas de pgto

**Feature 3 — CRM + WhatsApp**
- Ícone: 📣, fundo `#fef3c7`
- Título: "CRM com WhatsApp automático"
- Texto: "Identifique clientes inativos, OS prontas não retiradas e aniversariantes. Disparo de mensagens WhatsApp diretamente pelo sistema."
- Badges: Clientes inativos · Aniversariantes · OS prontas · Rotina diária

### 6. Planos e preços
- Título: "Planos simples, sem surpresa"
- Dois cards lado a lado (coluna em mobile), max-width 800px centralizado

**Card Mensal**
- `border: 1px solid #e2e8f0`, `border-radius: 16px`, padding 32px
- Label: "Mensal"
- Preço: **R$ 49,99**/mês
- Cobrança: "Cobrado mensalmente"
- Lista de benefícios (checkmarks verdes): Acesso completo a todos os módulos · 1 loja · Suporte por e-mail · Atualizações inclusas · Trial 7 dias grátis
- CTA: "Começar trial gratuito" → `/cadastro` (botão outline azul)

**Card Anual** ← destacado
- `border: 2px solid #2563eb`, `border-radius: 16px`, padding 32px
- Badge topo: "Mais popular" — `background: #2563eb`, `color: #fff`, pill
- Label: "Anual"
- Preço: **R$ 39,99**/mês
- Cobrança: "12x sem juros · R$ 479,88/ano"
- Economia: badge "Economize R$ 120/ano" em verde
- Mesma lista de benefícios
- CTA: "Começar trial gratuito" → `/cadastro` (botão solid azul)

### 7. CTA Final
- Fundo: `#2563eb`, padding vertical 80px
- Headline branca: "Comece grátis por 7 dias"
- Subtítulo branco/opaco: "Sem cartão de crédito. Cancele quando quiser."
- Botão: branco, texto azul, "Criar conta gratuita" → `/cadastro`

### 8. Footer
- Fundo: `#0f172a`, texto `#94a3b8`
- Esquerda: logo OctaOS + tagline "Gestão para assistências técnicas"
- Direita: links — Entrar no sistema · Suporte
- Rodapé inferior: "© 2026 OctaOS · Todos os direitos reservados"

---

## Página de Cadastro (`/cadastro`)

Página simples de registro de trial. Mesmo estilo visual do `/login`.

**Campos:**
- Nome completo
- E-mail
- Senha (mín. 6 caracteres)
- Confirmação de senha

**Ação:** `supabase.auth.signUp({ email, password, options: { data: { nome } } })` → redireciona para `/dashboard`

**Nota:** O controle de trial (7 dias) será gerenciado via campo `trial_expira_em` na tabela `perfis` ou via metadata do usuário no Supabase. Fora do escopo desta landing — a página de cadastro apenas cria a conta e redireciona.

**Visual:** card centralizado, mesmo padrão do login (420px, fundo `#f1f5f9`, card branco com sombra).

---

## Responsividade

| Breakpoint | Mudanças |
|------------|----------|
| < 768px | Hero colapsa para coluna única; mockup vai abaixo do texto |
| < 768px | Grid de módulos: 2 colunas |
| < 768px | Features em destaque: coluna única |
| < 768px | Planos: coluna única, anual primeiro |

---

## Fora de escopo

- Integração real de pagamento (Stripe, etc.)
- Sistema de trial automático com expiração no backend
- Página de sucesso pós-cadastro elaborada
- Blog, FAQ, changelog
- Analytics / pixel de conversão
