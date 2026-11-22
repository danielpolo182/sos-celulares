-- supabase-config-duplicadas-fix.sql
-- A tabela sistema_config ficou com duas linhas para 16 chaves da mesma loja
-- (a semente rodou duas vezes, em 08/06 e 09/06). Cada tela lia uma delas ao
-- acaso: o agente do WhatsApp informava "9h–18h, sábado até 13h" enquanto a
-- tela de Configurações mostrava "9h–17h40, sábado até 12h".
-- Este arquivo deixa uma linha por chave. O que fica e o que sai:
--   cliente_inativo_dias: fica "90"; sai "90"
--   garantia_dias: fica "90"; sai "90"
--   loja_cnpj: fica "28.196.573/0001-51"; sai "28.196.573/0001-51"
--   loja_email: fica "contato@soscelulares.com.br"; sai "contato@soscelulares.com.br"
--   loja_endereco: fica "Xv de Novembro 77, Centro, Colombo - PR 83414-000"; sai "Xv de Novembro 77, Centro, Colombo - PR"
--   loja_horario: fica "Seg–Sex 9h–17h40h · Sáb 9h–12h"; sai "Seg–Sex 9h–18h · Sáb 9h–13h"
--   loja_nome: fica "SOS Celulares"; sai "SOS Celulares"
--   loja_telefone: fica "(41) 9 9255 0123"; sai "123"
--   os_pronta_alerta_dias: fica "3"; sai "3"
--   pix_chave: fica ""; sai ""
--   pix_favorecido: fica ""; sai ""
--   recibo_garantia_formato: fica "80mm"; sai "80mm"
--   recibo_os_formato: fica "80mm"; sai "a4"
--   recibo_pdv_formato: fica "80mm"; sai "80mm"
--   retirada_prazo_dias: fica "90"; sai "90"
--   retirada_taxa_mensal: fica "10"; sai "10"

begin;

-- O histórico de alterações das linhas que saem passa para a linha que fica
update config_historico h
   set config_id = m.fica
  from (values
    ('8694220f-b7bd-4a2b-bdfc-975218cf6655'::uuid, '4c52ca6a-e43d-47b8-8e4c-ca4b7f44eaae'::uuid),
    ('a30c167b-8987-4c58-8b18-07eb7922457a'::uuid, 'fca8327c-9571-4eb0-8830-54ab8a2be039'::uuid),
    ('f3c07f97-e2dd-4746-9f53-3763ce05de10'::uuid, 'c86f7bfc-68c6-4626-8467-7542ed329b9e'::uuid),
    ('65a44689-f75b-46e1-a0ac-45ba32986a3f'::uuid, '594c00f2-f1ae-4598-a1c7-655954be1da0'::uuid),
    ('8c4e6031-89e2-4c70-9569-d1a4e0806403'::uuid, '6577a674-072f-48c1-ac53-39ad151b9f37'::uuid),
    ('9fbc6122-8ac8-4a97-8b2a-704d9d4e86d1'::uuid, 'cade4f62-43cd-430c-a276-a6a482d26c24'::uuid),
    ('31dec8af-ba10-4e17-95a7-8b8dc17795bb'::uuid, 'abeafb74-1d32-4e62-a28c-0ce9e858ea2b'::uuid),
    ('a8d8711c-543c-4072-a6e2-7e3e4913da15'::uuid, '03633529-b96b-4795-ba32-09fb98fad8ca'::uuid),
    ('fa3888cc-80fd-4dc4-b441-f3a0ec9a901c'::uuid, 'a026ce54-ca29-4030-bc9f-1807657b8640'::uuid),
    ('0209caa9-a24a-4421-9f1d-976869e8575e'::uuid, '5ff74e40-46df-49c5-8315-6162d9945eb6'::uuid),
    ('91bd52d4-9e55-4aaa-b244-8eb5a3e188c5'::uuid, '5a13ebf9-40c4-49f7-b860-f52309e2eb99'::uuid),
    ('a54aa6c9-ea46-42d7-b00b-2a7dacdffc95'::uuid, '96879d1e-19b4-4b64-bcf1-1a7d904fa60a'::uuid),
    ('24eca407-d96a-48ad-8670-4ff0d9e8b531'::uuid, '54159477-9b72-46ee-adc1-d383b294a890'::uuid),
    ('9fc149f2-0570-4a19-a0d8-feb50afbe298'::uuid, '12c26ff5-d9f3-4ed2-a22e-bff9a1ccdc4d'::uuid),
    ('f74ff68e-d32b-4bec-a6d6-cc3569d6e077'::uuid, '24065532-1a38-4c45-8ac3-dbce05f0a0c6'::uuid),
    ('a3145ea4-414c-4cd7-aa98-79a27b8edd82'::uuid, '42ea0130-cf2c-4787-a818-de5d9bed221d'::uuid)
  ) as m(sai, fica)
 where h.config_id = m.sai;

delete from sistema_config where id in (
  '8694220f-b7bd-4a2b-bdfc-975218cf6655',
  'a30c167b-8987-4c58-8b18-07eb7922457a',
  'f3c07f97-e2dd-4746-9f53-3763ce05de10',
  '65a44689-f75b-46e1-a0ac-45ba32986a3f',
  '8c4e6031-89e2-4c70-9569-d1a4e0806403',
  '9fbc6122-8ac8-4a97-8b2a-704d9d4e86d1',
  '31dec8af-ba10-4e17-95a7-8b8dc17795bb',
  'a8d8711c-543c-4072-a6e2-7e3e4913da15',
  'fa3888cc-80fd-4dc4-b441-f3a0ec9a901c',
  '0209caa9-a24a-4421-9f1d-976869e8575e',
  '91bd52d4-9e55-4aaa-b244-8eb5a3e188c5',
  'a54aa6c9-ea46-42d7-b00b-2a7dacdffc95',
  '24eca407-d96a-48ad-8670-4ff0d9e8b531',
  '9fc149f2-0570-4a19-a0d8-feb50afbe298',
  'f74ff68e-d32b-4bec-a6d6-cc3569d6e077',
  'a3145ea4-414c-4cd7-aa98-79a27b8edd82'
);

-- Impede que a mesma chave volte a existir duas vezes na mesma loja
create unique index if not exists sistema_config_filial_chave_unica
  on sistema_config (filial_id, chave) where escopo = 'global';

commit;

-- Conferência: deve voltar zero linhas
select filial_id, chave, count(*) from sistema_config group by 1, 2 having count(*) > 1;
