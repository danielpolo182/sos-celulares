-- ============================================================
-- WHATSAPP — provedor YCloud (coexistência com o aplicativo)
-- Rode no Supabase → SQL Editor → New query → colar → Run.
-- Guarda, por filial, qual provedor envia e recebe as mensagens:
-- a Meta direto (padrão) ou a YCloud, que mantém o número também
-- no aplicativo WhatsApp Business do celular.
-- ============================================================

ALTER TABLE wa_config
  ADD COLUMN IF NOT EXISTS provedor              TEXT NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS ycloud_api_key        TEXT,
  ADD COLUMN IF NOT EXISTS ycloud_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS ycloud_numero         TEXT;   -- número da loja, ex.: +5541992550123

ALTER TABLE wa_config DROP CONSTRAINT IF EXISTS wa_config_provedor_check;
ALTER TABLE wa_config ADD CONSTRAINT wa_config_provedor_check CHECK (provedor IN ('meta', 'ycloud'));
