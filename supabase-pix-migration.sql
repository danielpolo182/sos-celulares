-- supabase-pix-migration.sql

-- Tabela de configuração PIX por filial
CREATE TABLE IF NOT EXISTS pix_config (
  filial_id         UUID PRIMARY KEY REFERENCES filiais(id) ON DELETE CASCADE,
  mp_access_token   TEXT,
  mp_webhook_secret TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT false,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pix_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_filial ON pix_config
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

-- Seed: cria linha para todas as filiais existentes
INSERT INTO pix_config (filial_id)
SELECT id FROM filiais
ON CONFLICT DO NOTHING;

-- Tabela de cobranças PIX
CREATE TABLE IF NOT EXISTS pix_cobrancas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id       UUID NOT NULL REFERENCES filiais(id) ON DELETE CASCADE,
  referencia_id   UUID NOT NULL,
  tipo_referencia TEXT NOT NULL CHECK (tipo_referencia IN ('os', 'pdv')),
  mp_payment_id   BIGINT,
  valor           NUMERIC(10,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','aprovado','expirado','cancelado')),
  modalidade      TEXT NOT NULL CHECK (modalidade IN ('presencial','remoto')),
  qr_code_base64  TEXT,
  pix_copia_cola  TEXT,
  expira_em       TIMESTAMPTZ NOT NULL,
  pago_em         TIMESTAMPTZ,
  wa_enviado      BOOLEAN NOT NULL DEFAULT false,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pix_cobrancas ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_filial ON pix_cobrancas
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_referencia ON pix_cobrancas (referencia_id, tipo_referencia);
CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_mp_payment ON pix_cobrancas (mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_filial_status ON pix_cobrancas (filial_id, status);
