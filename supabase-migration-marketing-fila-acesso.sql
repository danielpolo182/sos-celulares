-- Fila de aprovação: fecha o acesso de escrita. Correção da revisão de 27/11/2026.
-- Antes, a política valia para ler E escrever: qualquer empresa do OctaOS podia criar a própria
-- linha de configuração e itens na fila, que o relógio processaria com o token do Instagram da loja.
-- Agora o usuário logado só LÊ a fila da própria loja. Quem escreve é o servidor (rotas do OctaOS
-- e o programa da loja), com a chave de serviço.
-- Rodar DEPOIS que a versão nova do OctaOS estiver no ar. Pode ser rodado de novo sem estragar nada.

drop policy if exists rls_filial on marketing_config;
drop policy if exists leitura_da_loja on marketing_config;
create policy leitura_da_loja on marketing_config for select
  using (filial_id = public.get_filial_id());

drop policy if exists rls_filial on marketing_fila;
drop policy if exists leitura_da_loja on marketing_fila;
create policy leitura_da_loja on marketing_fila for select
  using (filial_id = public.get_filial_id());

-- Cinto e suspensório: além de não haver política de escrita, o privilégio também sai
revoke insert, update, delete on marketing_config from authenticated, anon;
revoke insert, update, delete on marketing_fila from authenticated, anon;

-- Conferência: deve aparecer só a linha da SOS Celulares (78832e32-...)
select filial_id, horarios from marketing_config;
