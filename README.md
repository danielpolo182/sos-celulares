# SOS Celulares — Sistema de Gestão

ERP modular para assistência técnica de celulares.

## Variáveis de ambiente (configurar no Vercel)

No painel do Vercel → Settings → Environment Variables, adicione:

```
NEXT_PUBLIC_SUPABASE_URL        → URL do seu projeto Supabase
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY → Sua Publishable key
SUPABASE_SECRET_KEY             → Sua Secret key
```

## Como executar o banco

1. Acesse seu projeto no Supabase
2. Clique em SQL Editor → New query
3. Cole o conteúdo de `supabase-migration.sql` e clique em Run

## Estrutura do projeto

```
src/
  app/
    auth/login/     # Tela de login
    dashboard/      # Dashboard principal
    os/             # Ordens de serviço
    clientes/       # Gestão de clientes
    pdv/            # Ponto de venda
    estoque/        # Controle de estoque
    pos-venda/      # Pós-venda e CRM
  components/
    layout/         # Sidebar, Header
    ui/             # Componentes reutilizáveis
  lib/
    supabase/       # Cliente do banco
```
