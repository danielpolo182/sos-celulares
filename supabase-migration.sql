-- ============================================================
-- SOS Celulares — Migration inicial
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- FILIAIS
-- ============================================================
CREATE TABLE IF NOT EXISTS filiais (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  cnpj        TEXT,
  telefone    TEXT,
  endereco    JSONB,
  ativa       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================================
-- PERFIS DE USUÁRIO
-- ============================================================
CREATE TABLE IF NOT EXISTS perfis (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  filial_id   UUID REFERENCES filiais(id),
  nome        TEXT NOT NULL,
  papel       TEXT NOT NULL CHECK (papel IN ('admin','gerente','tecnico','atendente')),
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id   UUID REFERENCES filiais(id),
  nome        TEXT NOT NULL,
  cpf         TEXT,
  telefone    TEXT,
  email       TEXT,
  endereco    JSONB,
  observacoes TEXT,
  score       INTEGER DEFAULT 0,
  status_crm  TEXT DEFAULT 'ativo' CHECK (status_crm IN ('ativo','em_risco','perdido','promotor')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone);
CREATE INDEX IF NOT EXISTS idx_clientes_filial ON clientes(filial_id);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes USING gin(nome gin_trgm_ops);

-- ============================================================
-- BASE DE TAC / IMEI
-- ============================================================
CREATE TABLE IF NOT EXISTS tac_base (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tac         TEXT NOT NULL UNIQUE,
  marca       TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  categoria   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tac_base_tac ON tac_base(tac);

-- ============================================================
-- ORDENS DE SERVIÇO
-- ============================================================
CREATE TABLE IF NOT EXISTS ordens_servico (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id       UUID REFERENCES filiais(id),
  numero          SERIAL,
  cliente_id      UUID REFERENCES clientes(id),
  tecnico_id      UUID REFERENCES perfis(id),
  status          TEXT DEFAULT 'aberta' CHECK (status IN (
    'aberta','em_andamento','aguardando','pronta','entregue','cancelada'
  )),
  -- Aparelho
  imei            TEXT,
  tac             TEXT,
  marca           TEXT,
  modelo          TEXT,
  cor             TEXT,
  acessorios      TEXT[],
  senha_aparelho  TEXT,
  -- Problema
  defeito_relatado TEXT NOT NULL,
  defeito_tecnico  TEXT,
  solucao          TEXT,
  -- Financeiro
  valor_orcamento  NUMERIC(10,2),
  valor_final      NUMERIC(10,2),
  desconto         NUMERIC(10,2) DEFAULT 0,
  forma_pagamento  TEXT,
  pago             BOOLEAN DEFAULT false,
  -- Datas
  previsao_entrega DATE,
  entregue_em      TIMESTAMPTZ,
  -- Extras
  observacoes      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_os_numero    ON ordens_servico(numero);
CREATE INDEX IF NOT EXISTS idx_os_status    ON ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_imei      ON ordens_servico(imei);
CREATE INDEX IF NOT EXISTS idx_os_cliente   ON ordens_servico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_os_filial    ON ordens_servico(filial_id);
CREATE INDEX IF NOT EXISTS idx_os_data      ON ordens_servico(created_at);

-- ============================================================
-- PRODUTOS / PEÇAS
-- ============================================================
CREATE TABLE IF NOT EXISTS produtos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id       UUID REFERENCES filiais(id),
  codigo          TEXT,
  nome            TEXT NOT NULL,
  categoria       TEXT,
  marca_compat    TEXT[],
  preco_custo     NUMERIC(10,2),
  preco_venda     NUMERIC(10,2) NOT NULL,
  estoque_atual   INTEGER DEFAULT 0,
  estoque_minimo  INTEGER DEFAULT 0,
  ativo           BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_produtos_codigo  ON produtos(codigo);
CREATE INDEX IF NOT EXISTS idx_produtos_filial  ON produtos(filial_id);
CREATE INDEX IF NOT EXISTS idx_produtos_nome    ON produtos USING gin(nome gin_trgm_ops);

-- ============================================================
-- ITENS DA OS (peças utilizadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS os_itens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  os_id       UUID REFERENCES ordens_servico(id) ON DELETE CASCADE,
  produto_id  UUID REFERENCES produtos(id),
  descricao   TEXT NOT NULL,
  quantidade  INTEGER NOT NULL DEFAULT 1,
  preco_unit  NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VENDAS (PDV)
-- ============================================================
CREATE TABLE IF NOT EXISTS vendas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id       UUID REFERENCES filiais(id),
  cliente_id      UUID REFERENCES clientes(id),
  operador_id     UUID REFERENCES perfis(id),
  status          TEXT DEFAULT 'aberta' CHECK (status IN ('aberta','finalizada','cancelada')),
  subtotal        NUMERIC(10,2) DEFAULT 0,
  desconto        NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) DEFAULT 0,
  forma_pagamento TEXT,
  pago            BOOLEAN DEFAULT false,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- ITENS DA VENDA
-- ============================================================
CREATE TABLE IF NOT EXISTS venda_itens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venda_id    UUID REFERENCES vendas(id) ON DELETE CASCADE,
  produto_id  UUID REFERENCES produtos(id),
  descricao   TEXT NOT NULL,
  quantidade  INTEGER NOT NULL DEFAULT 1,
  preco_unit  NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MOVIMENTAÇÕES DE ESTOQUE
-- ============================================================
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filial_id   UUID REFERENCES filiais(id),
  produto_id  UUID REFERENCES produtos(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
  quantidade  INTEGER NOT NULL,
  motivo      TEXT,
  referencia_tipo  TEXT,
  referencia_id    UUID,
  usuario_id  UUID REFERENCES perfis(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENTOS (Event Bus persistido)
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   UUID,
  payload     JSONB,
  processado  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_type      ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_entity    ON events(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_events_processado ON events(processado) WHERE NOT processado;

-- ============================================================
-- AUDIT LOG (imutável)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID,
  acao        TEXT NOT NULL,
  tabela      TEXT NOT NULL,
  registro_id UUID,
  dados_antes JSONB,
  dados_depois JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FEATURE FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chave       TEXT NOT NULL UNIQUE,
  ativo       BOOLEAN DEFAULT false,
  descricao   TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (chave, ativo, descricao) VALUES
  ('WHATSAPP_ENABLED',       false, 'Integração com WhatsApp Business'),
  ('PIX_ENABLED',            false, 'Geração de cobrança PIX'),
  ('IA_DIAGNOSTICO_ENABLED', false, 'IA para sugestão de defeitos'),
  ('NFC_E_ENABLED',          false, 'Emissão de NFC-e'),
  ('ASSINATURA_DIGITAL',     false, 'Assinatura digital de OS')
ON CONFLICT (chave) DO NOTHING;

-- ============================================================
-- FILIAL PADRÃO
-- ============================================================
INSERT INTO filiais (nome) VALUES ('Filial Principal')
ON CONFLICT DO NOTHING;

-- ============================================================
-- FUNÇÃO: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'filiais','clientes','ordens_servico','produtos','vendas','perfis'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_updated_at ON %I;
      CREATE TRIGGER trg_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t);
  END LOOP;
END $$;
