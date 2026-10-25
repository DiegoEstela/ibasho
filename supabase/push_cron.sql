-- Programador de avisos (NO es una migración: lleva datos propios de tu proyecto).
-- Llama cada minuto a la app para avisar de las notitas programadas y de los recordatorios de tareas.
--
-- Cambia TU-APP.vercel.app por la dirección de tu app y TU-CLAVE por el mismo valor que CRON_SECRET en Vercel.
-- Ejecútalo una sola vez.

-- Activa las extensiones que hacen falta (si ya están activadas, no pasa nada).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('ibasho-avisos') where exists (select 1 from cron.job where jobname = 'ibasho-avisos');

select cron.schedule(
  'ibasho-avisos',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://TU-APP.vercel.app/api/push/cron',
    headers := jsonb_build_object('Authorization', 'Bearer TU-CLAVE')
  );
  $$
);
