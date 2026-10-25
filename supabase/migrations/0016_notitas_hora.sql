-- Ibasho · 0016 · Notitas programadas con día y hora
-- Se puede ejecutar más de una vez sin errores.

-- Hora de entrega (opcional): sin hora, la notita aparece desde el comienzo de su día.
alter table public.daily_messages add column if not exists deliver_time time;

-- Hora actual en la zona horaria del hogar (por ahora, España).
create or replace function public.now_local_time()
returns time
language sql
stable
as $$
  select (now() at time zone 'Europe/Madrid')::time(0);
$$;

-- Quien recibe la notita solo la ve cuando llegan su día y su hora; quien la escribe siempre la ve.
drop policy if exists "notitas: ver las propias y las recibidas ya entregadas" on public.daily_messages;
create policy "notitas: ver las propias y las recibidas ya entregadas"
  on public.daily_messages for select to authenticated
  using (
    public.is_household_member(household_id)
    and (
      from_user = auth.uid()
      or (
        (to_user is null or to_user = auth.uid())
        and (
          deliver_on < public.today_local()
          or (deliver_on = public.today_local() and (deliver_time is null or deliver_time <= public.now_local_time()))
        )
      )
    )
  );

notify pgrst, 'reload schema';
