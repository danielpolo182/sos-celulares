-- ============================================================
-- NOTA FISCAL (NFC-e via Focus NFe)
-- Rodar no Supabase: SQL Editor → New query → colar → Run
-- ============================================================

-- Coluna de estoque que faltava no banco (corrige o erro da importação de produtos)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_atual INTEGER DEFAULT 0;

-- Configuração da emissão por filial
CREATE TABLE IF NOT EXISTS nfe_config (
  filial_id          UUID PRIMARY KEY REFERENCES filiais(id),
  ativo              BOOLEAN DEFAULT FALSE,
  token              TEXT,
  ambiente           TEXT NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  emitir_automatico  BOOLEAN DEFAULT FALSE,
  csosn_padrao       TEXT DEFAULT '102',
  cfop_padrao        TEXT DEFAULT '5102',
  origem_padrao      TEXT DEFAULT '0',
  ncm_padrao         TEXT,
  natureza_operacao  TEXT DEFAULT 'VENDA AO CONSUMIDOR',
  criado_em          TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE nfe_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON nfe_config;
CREATE POLICY "rls_filial" ON nfe_config
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

INSERT INTO nfe_config (filial_id)
SELECT id FROM filiais
ON CONFLICT (filial_id) DO NOTHING;

-- Notas emitidas
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id      UUID REFERENCES filiais(id),
  referencia     TEXT UNIQUE NOT NULL,          -- ref enviada à Focus NFe
  tipo           TEXT NOT NULL DEFAULT 'nfce',
  venda_id       UUID REFERENCES vendas(id),
  os_id          UUID REFERENCES ordens_servico(id),
  status         TEXT NOT NULL DEFAULT 'processando', -- processando | autorizada | erro | cancelada
  numero         TEXT,
  serie          TEXT,
  chave          TEXT,
  valor_total    NUMERIC(10,2),
  url_danfe      TEXT,
  url_xml        TEXT,
  mensagem_erro  TEXT,
  criado_por     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_filial" ON notas_fiscais;
CREATE POLICY "rls_filial" ON notas_fiscais
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());

CREATE INDEX IF NOT EXISTS idx_nf_venda  ON notas_fiscais(venda_id);
CREATE INDEX IF NOT EXISTS idx_nf_os     ON notas_fiscais(os_id);
CREATE INDEX IF NOT EXISTS idx_nf_filial ON notas_fiscais(filial_id, created_at);

-- Preenche filial_id automaticamente (mesmo padrão das outras tabelas)
CREATE OR REPLACE FUNCTION auto_filial_notas_fiscais()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.filial_id IS NULL THEN
    NEW.filial_id := public.get_filial_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_filial_notas_fiscais ON notas_fiscais;
CREATE TRIGGER trg_auto_filial_notas_fiscais
  BEFORE INSERT ON notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION auto_filial_notas_fiscais();
