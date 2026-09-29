-- ============================================================
-- HISTÓRICO DE ENTRADAS DE PRODUTOS (produto_entradas)
-- Esta tabela era usada pelo código (Estoque → + Entrada, Compras →
-- Confirmar) mas nunca existiu no banco — os registros falhavam em
-- silêncio. Rode no Supabase → SQL Editor → New query → Run.
-- ============================================================

CREATE TABLE IF NOT EXISTS produto_entradas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id   UUID REFERENCES produtos(id),
  quantidade   INTEGER NOT NULL DEFAULT 1,
  custo_unit   NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_compra  DATE DEFAULT CURRENT_DATE,
  nota_fiscal  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produto_entradas_produto ON produto_entradas(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_entradas_nf ON produto_entradas(nota_fiscal);

ALTER TABLE produto_entradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produto_entradas_autenticado ON produto_entradas;
CREATE POLICY produto_entradas_autenticado ON produto_entradas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
