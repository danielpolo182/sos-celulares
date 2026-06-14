# Pendências Humanas

Lista de ações que precisam ser feitas manualmente fora do código.

---

## WhatsApp Business API (Meta)

- [ ] **Adicionar `META_APP_SECRET` nas variáveis de ambiente do Vercel**
  - Onde encontrar: Meta for Developers → seu App → Settings → Basic → App Secret
  - Variável: `META_APP_SECRET`

- [ ] **Adicionar `ANTHROPIC_API_KEY` nas variáveis de ambiente do Vercel**
  - Onde obter: console.anthropic.com → API Keys
  - Variável: `ANTHROPIC_API_KEY`

- [ ] **Configurar URL do webhook no Meta Business Manager**
  - URL: `https://<seu-dominio>/api/whatsapp/webhook`
  - Campos a assinar: `messages`
  - Verify Token: copiar do painel Configurações → WhatsApp API

- [ ] **Criar e aguardar aprovação dos 5 templates de notificação de OS**
  - `os_aberta` — parâmetros: nome, número da OS
  - `os_em_andamento` — parâmetros: nome, número da OS
  - `os_pronta` — parâmetros: nome, número da OS, valor
  - `os_entregue` — parâmetros: nome, número da OS
  - `os_cancelada` — parâmetros: nome, número da OS
  - Onde criar: Meta Business Manager → Conta do WhatsApp → Modelos de mensagem
  - Prazo de aprovação: 24–48h

---

## PIX — Mercado Pago

- [ ] **Executar migração SQL no Supabase**
  - Arquivo: `supabase-pix-migration.sql` (raiz do projeto, no .gitignore)
  - Onde: Supabase Dashboard → SQL Editor → colar e executar

- [ ] **Adicionar `NEXT_PUBLIC_APP_URL` nas variáveis do Vercel**
  - Valor: URL de produção da aplicação, ex: `https://sos-celulares.vercel.app`
  - Necessário para gerar a `notification_url` enviada ao Mercado Pago

- [ ] **Criar conta/aplicação no Mercado Pago Developers**
  - Acessar: mercadopago.com.br/developers → Suas integrações → Criar aplicação
  - Ativar modo Produção e copiar o **Access Token de produção** (começa com APP_USR-)
  - Em Webhooks, cadastrar `https://<seu-dominio>/api/pix/webhook` com evento **"payment"**
  - Copiar o **Webhook Secret** gerado

- [ ] **Configurar credenciais PIX no sistema**
  - Acessar: `/configuracoes` → aba PIX (somente admin/gerente)
  - Colar o Access Token e o Webhook Secret
  - Ativar o toggle PIX e salvar

---

## Verificar antes de ir para produção

- [ ] Confirmar que `SUPABASE_SERVICE_ROLE_KEY` está nas variáveis do Vercel
- [ ] Confirmar que `NEXT_PUBLIC_APP_URL` está nas variáveis do Vercel
