-- ============================================================
-- OctaOS — Isolamento de dados por filial (RLS + Trigger)
-- Execute no SQL Editor do Supabase (Project → SQL Editor)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. FUNÇÃO AUXILIAR: retorna filial_id do usuário logado
--    (em public, pois auth schema é restrito no Supabase)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_filial_id()
RETURNS UUID AS $$
  SELECT filial_id FROM perfis WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────
-- 2. TRIGGER: cria filial + perfil admin ao cadastrar usuário
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  nova_filial_id UUID;
BEGIN
  INSERT INTO filiais (nome)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)) || ' — Loja')
  RETURNING id INTO nova_filial_id;

  INSERT INTO perfis (id, filial_id, nome, papel)
  VALUES (
    NEW.id,
    nova_filial_id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    'admin'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ──────────────────────────────────────────────────────────────
-- 3. RLS — FILIAIS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE filiais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "filial_select" ON filiais;
CREATE POLICY "filial_select" ON filiais FOR SELECT
  USING (id = public.get_filial_id());

DROP POLICY IF EXISTS "filial_update" ON filiais;
CREATE POLICY "filial_update" ON filiais FOR UPDATE
  USING (id = public.get_filial_id());


-- ──────────────────────────────────────────────────────────────
-- 4. RLS — PERFIS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfis_select" ON perfis;
CREATE POLICY "perfis_select" ON perfis FOR SELECT
  USING (filial_id = public.get_filial_id());

DROP POLICY IF EXISTS "perfis_insert" ON perfis;
CREATE POLICY "perfis_insert" ON perfis FOR INSERT
  WITH CHECK (filial_id = public.get_filial_id());

DROP POLICY IF EXISTS "perfis_update" ON perfis;
CREATE POLICY "perfis_update" ON perfis FOR UPDATE
  USING (filial_id = public.get_filial_id());

DROP POLICY IF EXISTS "perfis_delete" ON perfis;
CREATE POLICY "perfis_delete" ON perfis FOR DELETE
  USING (filial_id = public.get_filial_id());


-- ──────────────────────────────────────────────────────────────
-- 5. RLS — CLIENTES
-- ──────────────────────────────────────────────────────────────
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_all" ON clientes;
CREATE POLICY "clientes_all" ON clientes
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());


-- ──────────────────────────────────────────────────────────────
-- 6. RLS — ORDENS DE SERVIÇO
-- ──────────────────────────────────────────────────────────────
ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "os_all" ON ordens_servico;
CREATE POLICY "os_all" ON ordens_servico
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());


-- ──────────────────────────────────────────────────────────────
-- 7. RLS — OS_ITENS (sem filial_id — filtra via OS pai)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE os_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "os_itens_all" ON os_itens;
CREATE POLICY "os_itens_all" ON os_itens
  USING (os_id IN (SELECT id FROM ordens_servico WHERE filial_id = public.get_filial_id()))
  WITH CHECK (os_id IN (SELECT id FROM ordens_servico WHERE filial_id = public.get_filial_id()));


-- ──────────────────────────────────────────────────────────────
-- 8. RLS — PRODUTOS / ESTOQUE
-- ──────────────────────────────────────────────────────────────
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produtos_all" ON produtos;
CREATE POLICY "produtos_all" ON produtos
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());


-- ──────────────────────────────────────────────────────────────
-- 9. RLS — MOVIMENTAÇÕES DE ESTOQUE
-- ──────────────────────────────────────────────────────────────
ALTER TABLE movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movest_all" ON movimentacoes_estoque;
CREATE POLICY "movest_all" ON movimentacoes_estoque
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());


-- ──────────────────────────────────────────────────────────────
-- 10. RLS — VENDAS (PDV)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_all" ON vendas;
CREATE POLICY "vendas_all" ON vendas
  USING (filial_id = public.get_filial_id())
  WITH CHECK (filial_id = public.get_filial_id());


-- ──────────────────────────────────────────────────────────────
-- 11. RLS — VENDA_ITENS (sem filial_id — filtra via venda pai)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE venda_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venda_itens_all" ON venda_itens;
CREATE POLICY "venda_itens_all" ON venda_itens
  USING (venda_id IN (SELECT id FROM vendas WHERE filial_id = public.get_filial_id()))
  WITH CHECK (venda_id IN (SELECT id FROM vendas WHERE filial_id = public.get_filial_id()));


-- ──────────────────────────────────────────────────────────────
-- 12. RLS — TAC_BASE (tabela global, leitura pública autenticada)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE tac_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tac_read" ON tac_base;
CREATE POLICY "tac_read" ON tac_base FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ──────────────────────────────────────────────────────────────
-- 13. RLS — FEATURE FLAGS (global, leitura pública autenticada)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flags_read" ON feature_flags;
CREATE POLICY "flags_read" ON feature_flags FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ──────────────────────────────────────────────────────────────
-- 14. CORRIGIR USUÁRIO EXISTENTE SEM PERFIL
--     Substitua o UUID pelo ID real do usuário em
--     Authentication → Users → copie o UUID.
--     Execute um bloco por usuário sem perfil.
-- ──────────────────────────────────────────────────────────────
-- DO $$
-- DECLARE
--   uid UUID := 'COLE-AQUI-O-UUID-DO-USUARIO';
--   nova_filial_id UUID;
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = uid) THEN
--     INSERT INTO filiais (nome) VALUES ('Loja do Usuario')
--     RETURNING id INTO nova_filial_id;
--
--     INSERT INTO perfis (id, filial_id, nome, papel)
--     VALUES (uid, nova_filial_id, 'Admin', 'admin');
--   END IF;
-- END $$;
