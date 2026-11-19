-- ============================================================
-- WHATSAPP — estado de entrega das mensagens enviadas
-- Rode no Supabase → SQL Editor → New query → colar → Run.
-- A Meta aceita a mensagem na hora e avisa depois se foi entregue,
-- lida ou se falhou; estas colunas guardam esse aviso.
-- ============================================================

ALTER TABLE wa_mensagens
  ADD COLUMN IF NOT EXISTS status_entrega TEXT,   -- sent | delivered | read | failed
  ADD COLUMN IF NOT EXISTS erro_entrega   TEXT;   -- código e motivo quando failed
