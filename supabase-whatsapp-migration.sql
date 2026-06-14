-- supabase-whatsapp-migration.sql
-- Execute no SQL Editor do Supabase

-- Conversas WhatsApp (uma por cliente/telefone ativa)
CREATE TABLE IF NOT EXISTS wa_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id UUID NOT NULL REFERENCES filiais(id),
  telefone TEXT NOT NULL,
  cliente_id UUID REFERENCES clientes(id),
  status TEXT NOT NULL DEFAULT 'bot' CHECK (status IN ('bot', 'humano', 'resolvida')),
  atribuido_a UUID REFERENCES perfis(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Mensagens de cada conversa
CREATE TABLE IF NOT EXISTS wa_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES wa_conversas(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  conteudo TEXT NOT NULL,
  meta_message_id TEXT,
  enviado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Configuração WhatsApp por filial
CREATE TABLE IF NOT EXISTS wa_config (
  filial_id UUID PRIMARY KEY REFERENCES filiais(id),
  phone_number_id TEXT,
  access_token TEXT,
  verify_token TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  bot_ativo BOOLEAN DEFAULT FALSE,
  bot_prompt TEXT DEFAULT 'Você é o assistente da loja, uma assistência técnica de celulares. Seja simpático e objetivo. Quando o cliente perguntar sobre uma OS, busque pelo telefone dele. Se não conseguir ajudar, transfira para um atendente.',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: wa_conversas
ALTER TABLE wa_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_conversas;
CREATE POLICY "rls_filial" ON wa_conversas
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

-- RLS: wa_mensagens (via conversa pai)
ALTER TABLE wa_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_mensagens;
CREATE POLICY "rls_filial" ON wa_mensagens
  USING (conversa_id IN (SELECT id FROM wa_conversas WHERE filial_id = public.get_filial_id()))
  WITH CHECK (conversa_id IN (SELECT id FROM wa_conversas WHERE filial_id = public.get_filial_id()));

-- RLS: wa_config
ALTER TABLE wa_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_config;
CREATE POLICY "rls_filial" ON wa_config
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

-- Índices de performance
CREATE INDEX IF NOT EXISTS wa_conversas_filial_telefone ON wa_conversas(filial_id, telefone);
CREATE INDEX IF NOT EXISTS wa_conversas_status ON wa_conversas(status);
CREATE INDEX IF NOT EXISTS wa_mensagens_conversa ON wa_mensagens(conversa_id, enviado_em);

-- Inserir linha de config para filiais existentes
INSERT INTO wa_config (filial_id)
SELECT id FROM filiais
ON CONFLICT (filial_id) DO NOTHING;
