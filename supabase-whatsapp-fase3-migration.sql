-- ============================================================
-- WHATSAPP — base + mídia (fase 3)
-- Rode no Supabase → SQL Editor → New query → colar → Run.
-- Pode ser rodado mais de uma vez e substitui o supabase-whatsapp-migration.sql:
-- cria o que faltar e alinha os nomes de coluna com o código.
-- ============================================================

-- ── 1. Tabelas base ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_conversas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id     UUID NOT NULL REFERENCES filiais(id),
  telefone      TEXT NOT NULL,
  cliente_id    UUID REFERENCES clientes(id),
  status        TEXT NOT NULL DEFAULT 'bot' CHECK (status IN ('bot', 'humano', 'resolvida')),
  atribuido_a   UUID REFERENCES perfis(id),
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_mensagens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES wa_conversas(id) ON DELETE CASCADE,
  direcao     TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  conteudo    TEXT NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_config (
  filial_id       UUID PRIMARY KEY REFERENCES filiais(id),
  phone_number_id TEXT,
  access_token    TEXT,
  verify_token    TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  bot_ativo       BOOLEAN DEFAULT FALSE,
  bot_prompt      TEXT DEFAULT 'Você é o assistente da loja, uma assistência técnica de celulares. Seja simpático e objetivo. Quando o cliente perguntar sobre uma OS, busque pelo telefone dele. Se não conseguir ajudar, transfira para um atendente.',
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id  UUID,
  cliente_id UUID,
  tipo       TEXT,
  telefone   TEXT,
  mensagem   TEXT,
  status     TEXT,
  criado_em  TIMESTAMPTZ DEFAULT NOW(),
  enviado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Colunas que o código usa ─────────────────────────────
ALTER TABLE wa_mensagens
  ADD COLUMN IF NOT EXISTS criado_em     TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS tipo          TEXT NOT NULL DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS media_path    TEXT,
  ADD COLUMN IF NOT EXISTS media_mime    TEXT,
  ADD COLUMN IF NOT EXISTS media_nome    TEXT;

ALTER TABLE wa_conversas
  ADD COLUMN IF NOT EXISTS nome_contato TEXT,
  ADD COLUMN IF NOT EXISTS criado_em    TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE wa_config
  ADD COLUMN IF NOT EXISTS bot_ativo  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bot_prompt TEXT;

ALTER TABLE wa_logs
  ADD COLUMN IF NOT EXISTS filial_id  UUID,
  ADD COLUMN IF NOT EXISTS cliente_id UUID,
  ADD COLUMN IF NOT EXISTS tipo       TEXT,
  ADD COLUMN IF NOT EXISTS telefone   TEXT,
  ADD COLUMN IF NOT EXISTS mensagem   TEXT,
  ADD COLUMN IF NOT EXISTS status     TEXT,
  ADD COLUMN IF NOT EXISTS criado_em  TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ DEFAULT NOW();

-- A migração antiga usava enviado_em / meta_message_id em wa_mensagens: aproveita os valores
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'wa_mensagens' AND column_name = 'enviado_em') THEN
    EXECUTE 'UPDATE wa_mensagens SET criado_em = enviado_em WHERE enviado_em IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'wa_mensagens' AND column_name = 'meta_message_id') THEN
    EXECUTE 'UPDATE wa_mensagens SET wa_message_id = meta_message_id
             WHERE wa_message_id IS NULL AND meta_message_id IS NOT NULL';
  END IF;
END $$;

-- ── 3. Índices ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS wa_conversas_filial_telefone ON wa_conversas(filial_id, telefone);
CREATE INDEX IF NOT EXISTS wa_conversas_status ON wa_conversas(status);
CREATE INDEX IF NOT EXISTS wa_mensagens_conversa_criado ON wa_mensagens(conversa_id, criado_em);

-- A Meta reentrega eventos; este índice impede gravar a mesma mensagem duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS wa_mensagens_wa_message_id
  ON wa_mensagens(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- ── 4. RLS (isolamento por filial) ──────────────────────────
ALTER TABLE wa_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_conversas;
CREATE POLICY "rls_filial" ON wa_conversas
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

ALTER TABLE wa_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_mensagens;
CREATE POLICY "rls_filial" ON wa_mensagens
  USING (conversa_id IN (SELECT id FROM wa_conversas WHERE filial_id = public.get_filial_id()))
  WITH CHECK (conversa_id IN (SELECT id FROM wa_conversas WHERE filial_id = public.get_filial_id()));

ALTER TABLE wa_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_config;
CREATE POLICY "rls_filial" ON wa_config
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

-- wa_logs pode já existir com políticas próprias: só cria uma se não houver nenhuma
ALTER TABLE wa_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wa_logs') THEN
    CREATE POLICY "rls_filial" ON wa_logs
      USING (filial_id IS NULL OR filial_id = public.get_filial_id())
      WITH CHECK (filial_id IS NULL OR filial_id = public.get_filial_id());
  END IF;
END $$;

-- Linha de configuração para cada filial (gera o Verify Token)
INSERT INTO wa_config (filial_id)
SELECT id FROM filiais
ON CONFLICT (filial_id) DO NOTHING;

-- ── 5. Bucket privado para áudios, fotos e documentos ───────
INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-media', 'wa-media', false)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Realtime (caixa de entrada atualiza sozinha) ─────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE wa_mensagens;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE wa_conversas;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
