-- Ibasho · 0019 · Notitas: quitar de tu diario las que te enviaron
-- Se puede ejecutar más de una vez sin errores.

-- Quienes la ocultaron. La notita sigue existiendo para quien la escribió.
alter table public.daily_messages add column if not exists hidden_for uuid[] not null default '{}';

-- Quien la escribe siempre la ve; quien la recibe, solo cuando llegan su día y su hora y si no la quitó.
drop policy if exists "notitas: ver las propias y las recibidas ya entregadas" on public.daily_messages;
create policy "notitas: ver las propias y las recibidas ya entregadas"
  on public.daily_messages for select to authenticated
  using (
    public.is_household_member(household_id)
    and (
      from_user = auth.uid()
      or (
        (to_user is null or to_user = auth.uid())
        and not (auth.uid() = any (hidden_for))
        and (
          deliver_on < public.today_local()
          or (deliver_on = public.today_local() and (deliver_time is null or deliver_time <= public.now_local_time()))
        )
      )
    )
  );

-- Quita una notita recibida de tu diario (no la borra para quien la escribió).
create or replace function public.hide_note(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.daily_messages
  set hidden_for = array_append(hidden_for, auth.uid())
  where id = p_id
    and from_user <> auth.uid()
    and public.is_household_member(household_id)
    and (to_user is null or to_user = auth.uid())
    and not (auth.uid() = any (hidden_for));
$$;

revoke all on function public.hide_note(uuid) from public, anon;
grant execute on function public.hide_note(uuid) to authenticated;

notify pgrst, 'reload schema';
