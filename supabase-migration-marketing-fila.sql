-- Fila de aprovação de publicações (marketing).
-- Especificação: docs/superpowers/specs/2026-11-27-fila-de-aprovacao-design.md
-- Rodar uma vez no SQL Editor do Supabase. Pode ser rodado de novo sem estragar nada.

-- Uma linha por loja com a fila ligada. A existência da linha é o que liga a fila.
create table if not exists marketing_config (
  filial_id uuid primary key,
  horarios text[] not null default '{07:30,12:00,18:00,20:30}',   -- hora de Brasília
  ig_user_id text,                                                  -- preenchido na primeira publicação
  atualizado_em timestamptz not null default now()
);

-- Um item por coisa a aprovar. Nunca guardar nome ou telefone de cliente em "dados".
create table if not exists marketing_fila (
  id uuid primary key default gen_random_uuid(),
  filial_id uuid not null,
  tipo text not null default 'story' check (tipo in ('story')),
  chave text not null,
  situacao text not null default 'pendente'
    check (situacao in ('pendente','aprovado','publicando','publicado','falhou','descartado')),
  titulo text not null,
  dados jsonb not null default '{}',
  video_path text,
  quadro_path text,
  agendado_para timestamptz,
  aprovado_por uuid,
  aprovado_em timestamptz,
  ig_container_id text,
  ig_media_id text,
  ig_link text,
  publicado_em timestamptz,
  tentativas int not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Impede dois itens vivos da mesma ordem de serviço
create unique index if not exists marketing_fila_chave_viva on marketing_fila (filial_id, chave)
  where situacao in ('pendente','aprovado','publicando');
create index if not exists marketing_fila_situacao on marketing_fila (filial_id, situacao, agendado_para);

-- Cada loja só LÊ a própria fila. Não há política de escrita: quem grava é o servidor, com a chave de serviço
-- (ver supabase-migration-marketing-fila-acesso.sql, que corrigiu a primeira versão deste arquivo).
alter table marketing_config enable row level security;
alter table marketing_fila enable row level security;
drop policy if exists rls_filial on marketing_config;
drop policy if exists leitura_da_loja on marketing_config;
create policy leitura_da_loja on marketing_config for select using (filial_id = public.get_filial_id());
drop policy if exists rls_filial on marketing_fila;
drop policy if exists leitura_da_loja on marketing_fila;
create policy leitura_da_loja on marketing_fila for select using (filial_id = public.get_filial_id());
revoke insert, update, delete on marketing_config from authenticated, anon;
revoke insert, update, delete on marketing_fila from authenticated, anon;

-- Pasta privada dos vídeos que ainda não foram conferidos (até 50 MB por arquivo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('marketing-fila', 'marketing-fila', false, 52428800, array['video/mp4','image/jpeg'])
  on conflict (id) do nothing;

-- Liga a fila para a SOS Celulares
insert into marketing_config (filial_id) values ('78832e32-3eff-4a1b-a44d-a2e1dbf6a4ba')
  on conflict do nothing;
