-- ============================================================
-- OctaOS — Isolamento de dados por filial (RLS + Trigger)
-- Execute no SQL Editor do Supabase (Project → SQL Editor)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. FUNÇÃO AUXILIAR: retorna filial_id do usuário logado
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

  INSERT INTO perfis (id, filial_id, nome, papel, email)
  VALUES (
    NEW.id,
    nova_filial_id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    'admin',
    NEW.email
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ──────────────────────────────────────────────────────────────
-- 3. RLS DINÂMICO: aplica em todas as tabelas com filial_id
--    Detecta automaticamente — não precisa listar cada tabela.
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN (
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON c.table_name = tb.table_name
      AND c.table_schema = tb.table_schema
    WHERE c.table_schema = 'public'
      AND c.column_name = 'filial_id'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  ) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "rls_filial" ON %I', t);
    EXECUTE format('
      CREATE POLICY "rls_filial" ON %I
        USING (filial_id = public.get_filial_id())
        WITH CHECK (filial_id = public.get_filial_id())
    ', t);
    RAISE NOTICE 'RLS habilitado: %', t;
  END LOOP;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4. RLS — TAC_BASE (global, sem filial_id)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE tac_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tac_read" ON tac_base;
CREATE POLICY "tac_read" ON tac_base FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ──────────────────────────────────────────────────────────────
-- 5. RLS — FEATURE FLAGS (global, sem filial_id)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flags_read" ON feature_flags;
CREATE POLICY "flags_read" ON feature_flags FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ──────────────────────────────────────────────────────────────
-- 6. RLS — OS_ITENS (sem filial_id — filtra via OS pai)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE os_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "os_itens_all" ON os_itens;
CREATE POLICY "os_itens_all" ON os_itens
  USING (os_id IN (SELECT id FROM ordens_servico WHERE filial_id = public.get_filial_id()))
  WITH CHECK (os_id IN (SELECT id FROM ordens_servico WHERE filial_id = public.get_filial_id()));


-- ──────────────────────────────────────────────────────────────
-- 7. RLS — VENDA_ITENS (sem filial_id — filtra via venda pai)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE venda_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "venda_itens_all" ON venda_itens;
CREATE POLICY "venda_itens_all" ON venda_itens
  USING (venda_id IN (SELECT id FROM vendas WHERE filial_id = public.get_filial_id()))
  WITH CHECK (venda_id IN (SELECT id FROM vendas WHERE filial_id = public.get_filial_id()));


-- ──────────────────────────────────────────────────────────────
-- 8. CORRIGIR USUÁRIO EXISTENTE SEM PERFIL PRÓPRIO
--    Vá em Authentication → Users, copie o UUID do usuário
--    e substitua abaixo. Execute um bloco por usuário.
-- ──────────────────────────────────────────────────────────────
-- DO $$
-- DECLARE
--   uid UUID := 'COLE-AQUI-O-UUID-DO-USUARIO';
--   nova_filial_id UUID;
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = uid) THEN
--     INSERT INTO filiais (nome) VALUES ('Minha Loja')
--     RETURNING id INTO nova_filial_id;
--     INSERT INTO perfis (id, filial_id, nome, papel)
--     VALUES (uid, nova_filial_id, 'Admin', 'admin');
--   END IF;
-- END $$;
