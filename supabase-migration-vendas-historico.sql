-- ============================================================
-- HISTÓRICO DE ALTERAÇÕES DE VENDAS (auditoria)
-- Rode no Supabase → SQL Editor → New query → colar → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS venda_alteracoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id      UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  filial_id     UUID,
  usuario_id    UUID,
  usuario_nome  TEXT,
  acao          TEXT NOT NULL,          -- status | item_add | item_remove | item_edit
  detalhes      JSONB,                  -- ex: {"de":"finalizada","para":"cancelada"}
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_alteracoes_venda ON venda_alteracoes(venda_id);
CREATE INDEX IF NOT EXISTS idx_vendas_created ON vendas(created_at DESC);

-- Acesso para usuários autenticados (mesmo padrão do recondicionamento)
ALTER TABLE venda_alteracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS venda_alteracoes_autenticado ON venda_alteracoes;
CREATE POLICY venda_alteracoes_autenticado ON venda_alteracoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
