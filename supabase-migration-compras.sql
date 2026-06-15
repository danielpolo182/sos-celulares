-- supabase-migration-compras.sql

-- ── Tabela blacklist ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras_blacklist (
  produto_id  UUID REFERENCES produtos(id) ON DELETE CASCADE,
  filial_id   UUID REFERENCES filiais(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (produto_id, filial_id)
);

-- ── Tabela pedidos_compra ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos_compra (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id        UUID REFERENCES filiais(id),
  fornecedor_id    UUID REFERENCES fornecedores(id),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','enviado','parcial','concluido','cancelado')),
  periodo_dias     INTEGER NOT NULL,
  pedido_origem_id UUID REFERENCES pedidos_compra(id),
  observacoes      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabela pedido_itens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_itens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id       UUID REFERENCES pedidos_compra(id) ON DELETE CASCADE,
  produto_id      UUID REFERENCES produtos(id),
  qtd_sugerida    INTEGER NOT NULL,
  qtd_pedida      INTEGER NOT NULL,
  preco_custo_ref NUMERIC(10,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabela pedido_recebimentos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_recebimentos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id      UUID REFERENCES pedidos_compra(id),
  pedido_item_id UUID REFERENCES pedido_itens(id),
  qtd_recebida   INTEGER NOT NULL,
  preco_pago     NUMERIC(10,2) NOT NULL,
  operador_id    UUID REFERENCES perfis(id),
  recebido_em    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Configuração de período padrão ────────────────────────────────────────────
INSERT INTO configuracoes (chave, valor, categoria, descricao)
VALUES ('compras_periodo_dias', '60', 'compras', 'Período em dias para cálculo de demanda da lista de compras')
ON CONFLICT (chave) DO NOTHING;

-- ── Trigger: recebimento → estoque + custo + blacklist ────────────────────────
CREATE OR REPLACE FUNCTION fn_recebimento_after_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_produto_id UUID;
  v_filial_id  UUID;
BEGIN
  SELECT pi.produto_id, pc.filial_id
  INTO v_produto_id, v_filial_id
  FROM pedido_itens pi
  JOIN pedidos_compra pc ON pc.id = pi.pedido_id
  WHERE pi.id = NEW.pedido_item_id;

  INSERT INTO movimentacoes_estoque (filial_id, produto_id, tipo, quantidade, motivo)
  VALUES (
    v_filial_id,
    v_produto_id,
    'entrada',
    NEW.qtd_recebida,
    'Recebimento pedido #' || NEW.pedido_id
  );

  UPDATE produtos SET preco_custo = NEW.preco_pago WHERE id = v_produto_id;

  DELETE FROM compras_blacklist
  WHERE produto_id = v_produto_id AND filial_id = v_filial_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recebimento_after_insert ON pedido_recebimentos;
CREATE TRIGGER trg_recebimento_after_insert
  AFTER INSERT ON pedido_recebimentos
  FOR EACH ROW EXECUTE FUNCTION fn_recebimento_after_insert();

-- ── Trigger: entrada manual no estoque → remove blacklist ─────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_entrada_blacklist()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    DELETE FROM compras_blacklist
    WHERE produto_id = NEW.produto_id AND filial_id = NEW.filial_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estoque_entrada_blacklist ON movimentacoes_estoque;
CREATE TRIGGER trg_estoque_entrada_blacklist
  AFTER INSERT ON movimentacoes_estoque
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_entrada_blacklist();

-- ── RPC calcular_lista_compras ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calcular_lista_compras(
  p_filial_id    UUID,
  p_periodo_dias INTEGER
)
RETURNS TABLE (
  produto_id    UUID,
  nome          TEXT,
  categoria     TEXT,
  estoque_atual INTEGER,
  qtd_total     NUMERIC,
  qtd_media     NUMERIC,
  slope         NUMERIC,
  tendencia     TEXT,
  qtd_sugerida  INTEGER,
  preco_custo   NUMERIC,
  na_blacklist  BOOLEAN
) AS $$
DECLARE
  v_inicio DATE := CURRENT_DATE - p_periodo_dias;
BEGIN
  RETURN QUERY
  WITH saidas_semanais AS (
    SELECT
      me.produto_id,
      EXTRACT(EPOCH FROM DATE_TRUNC('week', me.criado_em)) / 604800 AS semana_num,
      SUM(me.quantidade)::NUMERIC AS qtd_semana
    FROM movimentacoes_estoque me
    WHERE me.filial_id = p_filial_id
      AND me.tipo = 'saida'
      AND me.criado_em >= v_inicio
      AND me.deleted_at IS NULL
    GROUP BY me.produto_id, DATE_TRUNC('week', me.criado_em)
  ),
  regressao AS (
    SELECT
      produto_id,
      COUNT(*)           AS n_semanas,
      SUM(qtd_semana)    AS qtd_total,
      AVG(qtd_semana)    AS qtd_media,
      (COUNT(*) * SUM(semana_num * qtd_semana)
        - SUM(semana_num) * SUM(qtd_semana))
      / NULLIF(
          COUNT(*) * SUM(semana_num * semana_num)
          - SUM(semana_num) * SUM(semana_num),
        0) AS slope
    FROM saidas_semanais
    GROUP BY produto_id
  )
  SELECT
    p.id,
    p.nome,
    p.categoria,
    p.estoque_atual,
    COALESCE(r.qtd_total, 0),
    COALESCE(r.qtd_media, 0),
    COALESCE(r.slope, 0),
    CASE
      WHEN r.produto_id IS NULL                             THEN 'estavel'
      WHEN r.n_semanas <= 8 AND r.slope > 0
           AND r.qtd_media > 0                             THEN 'lancamento'
      WHEN r.slope > 0
           AND ABS(r.slope) / NULLIF(r.qtd_media,0) > 0.15 THEN 'alta'
      WHEN r.slope < 0
           AND ABS(r.slope) / NULLIF(r.qtd_media,0) > 0.15 THEN 'baixa'
      ELSE 'estavel'
    END,
    GREATEST(1, ROUND(COALESCE(r.qtd_media, 0) * (p_periodo_dias / 7.0)))::INTEGER,
    p.preco_custo,
    EXISTS (
      SELECT 1 FROM compras_blacklist bl
      WHERE bl.produto_id = p.id AND bl.filial_id = p_filial_id
    )
  FROM produtos p
  LEFT JOIN regressao r ON r.produto_id = p.id
  WHERE p.filial_id = p_filial_id
    AND p.deleted_at IS NULL
    AND p.ativo = true
    AND (r.produto_id IS NOT NULL OR p.estoque_atual = 0)
  ORDER BY
    CASE WHEN r.produto_id IS NULL THEN 1 ELSE 0 END,
    r.qtd_total DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;
