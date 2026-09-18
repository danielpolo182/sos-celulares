-- ============================================================
--  Módulo Recondicionamento
--  Aparelhos próprios (custo R$ 0) que precisam de reparo antes
--  de irem para o estoque de Compra & Venda (/aparelhos).
--  Cada aparelho tem um passo a passo de diagnóstico guiado por IA.
-- ============================================================

-- Aparelho em recondicionamento
create table if not exists recond_aparelhos (
  id              uuid primary key default gen_random_uuid(),
  marca           text,
  modelo          text not null,
  capacidade      text,
  cor             text,
  imei            text,
  descricao       text,            -- texto livre inicial (o que foi observado)
  condicoes_json  jsonb,           -- [{ item, estado, gravidade }]
  diagnostico     text,            -- resumo técnico gerado pela IA
  status          text not null default 'triagem',
                  -- triagem | diagnostico | aguardando_pecas | reparo | pronto | descartado
  custo_pecas     numeric default 0,
  valor_venda     numeric default 0,   -- valor de venda estimado quando pronto
  observacoes     text,
  aparelho_id     uuid,            -- FK -> aparelhos, preenchido ao mover p/ Compra & Venda
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  deleted_at      timestamptz
);

-- Passo a passo interativo (instrução da IA + resultado do técnico)
create table if not exists recond_passos (
  id           uuid primary key default gen_random_uuid(),
  aparelho_id  uuid not null references recond_aparelhos(id) on delete cascade,
  ordem        int not null default 0,
  tipo         text default 'teste',   -- teste | reparo | info
  instrucao    text not null,          -- o que fazer / testar
  resultado    text,                   -- o que o técnico observou
  concluido    boolean default false,
  origem       text default 'ia',      -- ia | tecnico
  created_at   timestamptz default now()
);

-- Peças necessárias (com preço de fornecedor) e, no descarte, peças aproveitáveis
create table if not exists recond_pecas (
  id           uuid primary key default gen_random_uuid(),
  aparelho_id  uuid not null references recond_aparelhos(id) on delete cascade,
  peca_nome    text not null,
  preco        numeric,
  fornecedor   text,        -- iplay | fixcell | manual
  url          text,
  aproveitavel boolean default false,  -- true = peça boa p/ reaproveitar (desmonte)
  created_at   timestamptz default now()
);

create index if not exists idx_recond_passos_aparelho on recond_passos(aparelho_id);
create index if not exists idx_recond_pecas_aparelho  on recond_pecas(aparelho_id);

-- RLS: como as demais tabelas do app, usuários autenticados têm acesso total.
-- (Sem isso, o site logado enxerga a tabela mas não retorna nenhuma linha.)
alter table recond_aparelhos enable row level security;
alter table recond_passos    enable row level security;
alter table recond_pecas     enable row level security;

drop policy if exists "auth_full_access" on recond_aparelhos;
drop policy if exists "auth_full_access" on recond_passos;
drop policy if exists "auth_full_access" on recond_pecas;

create policy "auth_full_access" on recond_aparelhos for all to authenticated using (true) with check (true);
create policy "auth_full_access" on recond_passos    for all to authenticated using (true) with check (true);
create policy "auth_full_access" on recond_pecas     for all to authenticated using (true) with check (true);
