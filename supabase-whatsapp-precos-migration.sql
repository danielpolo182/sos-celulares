-- Tabela de preços que o agente do WhatsApp consulta antes de perguntar ao responsável.
-- Rode no Supabase → SQL Editor. Pode ser rodado mais de uma vez.

CREATE TABLE IF NOT EXISTS wa_precos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id     UUID NOT NULL,
  -- Ex.: "Troca de tela", "Troca de bateria"
  servico       TEXT NOT NULL,
  -- Ex.: "iPhone 11", "Samsung A54 5G"
  modelo        TEXT NOT NULL,
  -- Ex.: "Incell", "Soft OLED", "OLED com aro"; vazio quando o serviço tem um preço só
  opcao         TEXT,
  preco         NUMERIC(10,2) NOT NULL,
  -- Ex.: "pronto no mesmo dia"; o agente repassa ao cliente
  observacao    TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_precos_filial ON wa_precos (filial_id);

ALTER TABLE wa_precos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON wa_precos;
CREATE POLICY "rls_filial" ON wa_precos
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());
