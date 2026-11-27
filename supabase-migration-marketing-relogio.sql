-- Relógio da fila de aprovação: o banco chama o OctaOS a cada 5 minutos, e o OctaOS publica
-- no Instagram o que foi aprovado e já está na hora.
-- Assinaturas conferidas na documentação do Supabase em 27/11/2026 (pg_cron e pg_net).
--
-- ANTES DE RODAR: troque COLE_AQUI_O_CRON_SECRET pelo valor da variável CRON_SECRET da Vercel.
-- O valor fica guardado só no banco. Não commitar este arquivo com o valor preenchido.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Rodar de novo troca a tarefa, sem duplicar
select cron.unschedule('marketing-fila-relogio')
  where exists (select 1 from cron.job where jobname = 'marketing-fila-relogio');

select cron.schedule('marketing-fila-relogio', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://www.octaos.com.br/api/marketing/fila/relogio',
    headers := jsonb_build_object('Authorization', 'Bearer COLE_AQUI_O_CRON_SECRET'),
    timeout_milliseconds := 60000
  );
$$);

-- Para conferir depois de uns 10 minutos:
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Para desligar o relógio:
--   select cron.unschedule('marketing-fila-relogio');
