-- supabase-migration-campos.sql

-- ── Tabela de definição de campos personalizados ──────────────────────────────
CREATE TABLE IF NOT EXISTS campos_personalizados (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id   UUID REFERENCES filiais(id) ON DELETE CASCADE,
  entidade    TEXT NOT NULL CHECK (entidade IN ('produto','venda','os','cliente')),
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('texto','numero','lista')),
  opcoes      TEXT[] DEFAULT '{}',
  obrigatorio BOOLEAN DEFAULT false,
  ordem       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campos_filial_entidade
  ON campos_personalizados(filial_id, entidade);

-- ── Adicionar campos_extras nas tabelas que ainda não têm ────────────────────
ALTER TABLE vendas         ADD COLUMN IF NOT EXISTS campos_extras JSONB DEFAULT '{}';
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS campos_extras JSONB DEFAULT '{}';
ALTER TABLE clientes       ADD COLUMN IF NOT EXISTS campos_extras JSONB DEFAULT '{}';
