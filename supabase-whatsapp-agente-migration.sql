-- ============================================================
-- AGENTE DE IA DO WHATSAPP
-- Regras de convivência com o atendente, consultas ao responsável,
-- memória das respostas e cache das peças dos fornecedores.
-- Rode no Supabase → SQL Editor → New query → colar → Run.
-- Pode ser rodado mais de uma vez. Inclui o supabase-whatsapp-bot-migration.sql.
-- ============================================================

-- Até quando o agente fica calado na conversa (alguém da loja respondeu)
ALTER TABLE wa_conversas ADD COLUMN IF NOT EXISTS bot_pausado_ate TIMESTAMPTZ;

-- Pausa, números de teste, telefone do responsável, prazos
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS bot_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Perguntas que o agente mandou ao responsável sobre um atendimento
CREATE TABLE IF NOT EXISTS wa_consultas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id     UUID NOT NULL,
  conversa_id   UUID NOT NULL REFERENCES wa_conversas(id) ON DELETE CASCADE,
  assunto       TEXT NOT NULL,
  pergunta      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'respondida', 'expirada')),
  resposta      TEXT,
  -- Identificadores da mensagem enviada ao responsável, para casar com a resposta citada
  ids_mensagem  TEXT[] NOT NULL DEFAULT '{}',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em     TIMESTAMPTZ NOT NULL,
  respondido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_consultas_abertas ON wa_consultas (filial_id, status, criado_em DESC);

ALTER TABLE wa_consultas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_consultas;
CREATE POLICY "rls_filial" ON wa_consultas
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

-- O que o responsável já respondeu: o agente reaproveita enquanto estiver válido
CREATE TABLE IF NOT EXISTS wa_conhecimento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id   UUID NOT NULL,
  assunto     TEXT NOT NULL,
  resposta    TEXT NOT NULL,
  consulta_id UUID REFERENCES wa_consultas(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valido_ate  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_conhecimento_filial ON wa_conhecimento (filial_id, criado_em DESC);

ALTER TABLE wa_conhecimento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_conhecimento;
CREATE POLICY "rls_filial" ON wa_conhecimento
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

-- Peças vistas nas buscas aos fornecedores: custo mais recente de cada uma
CREATE TABLE IF NOT EXISTS fornecedor_pecas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor    TEXT NOT NULL,
  nome          TEXT NOT NULL,
  codigo        TEXT,
  preco         NUMERIC(10,2) NOT NULL,
  url           TEXT,
  consulta      TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fornecedor, nome)
);

-- Catálogo de fornecedor não é dado de uma filial: quem está logado pode ler;
-- a gravação é feita pelo servidor.
ALTER TABLE fornecedor_pecas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leitura_autenticados" ON fornecedor_pecas;
CREATE POLICY "leitura_autenticados" ON fornecedor_pecas FOR SELECT TO authenticated USING (true);

-- Vídeos, imagens e documentos que o agente pode enviar (ex.: explicação das qualidades de tela)
CREATE TABLE IF NOT EXISTS wa_materiais (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id     UUID NOT NULL,
  titulo        TEXT NOT NULL,
  -- Em que situação o agente deve enviar; é lido por ele
  quando_enviar TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('video', 'imagem', 'documento')),
  media_path    TEXT NOT NULL,
  media_mime    TEXT NOT NULL,
  legenda       TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wa_materiais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_materiais;
CREATE POLICY "rls_filial" ON wa_materiais
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());
