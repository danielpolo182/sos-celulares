-- ============================================================
-- GARANTIA DE PRODUTOS (troca ou crédito, vinculada à venda)
-- Rode no Supabase → SQL Editor → New query → colar → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS garantias_produtos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id       UUID,
  produto_id      UUID REFERENCES produtos(id),
  produto_nome    TEXT NOT NULL,
  venda_id        UUID REFERENCES vendas(id),
  cliente_id      UUID REFERENCES clientes(id),
  cliente_nome    TEXT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('troca','credito')),
  quantidade      INTEGER NOT NULL DEFAULT 1,
  valor_credito   NUMERIC(10,2),
  credito_status  TEXT DEFAULT 'pendente'
                  CHECK (credito_status IN ('pendente','utilizado','cancelado')),
  motivo          TEXT,
  usuario_id      UUID,
  usuario_nome    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garantias_produtos_venda ON garantias_produtos(venda_id);
CREATE INDEX IF NOT EXISTS idx_garantias_produtos_cliente ON garantias_produtos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_garantias_produtos_created ON garantias_produtos(created_at DESC);

-- Acesso para usuários autenticados (mesmo padrão das demais tabelas novas)
ALTER TABLE garantias_produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantias_produtos_autenticado ON garantias_produtos;
CREATE POLICY garantias_produtos_autenticado ON garantias_produtos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
