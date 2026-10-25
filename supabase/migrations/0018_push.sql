-- Avisos al teléfono (notificaciones push). Se puede ejecutar más de una vez.

-- Un registro por dispositivo con los avisos activados.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_household_idx on public.push_subscriptions (household_id);

alter table public.push_subscriptions enable row level security;

-- Cada persona solo ve y quita sus propios dispositivos; se registran con push_subscribe.
drop policy if exists "avisos: ver mis dispositivos" on public.push_subscriptions;
create policy "avisos: ver mis dispositivos" on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "avisos: quitar mis dispositivos" on public.push_subscriptions;
create policy "avisos: quitar mis dispositivos" on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Qué tipos de aviso NO quiere recibir cada persona (compras, gastos, notitas, tareas).
alter table public.profiles add column if not exists push_off text[] not null default '{}';

-- Para no avisar dos veces de lo mismo.
alter table public.daily_messages add column if not exists pushed_at timestamptz;
alter table public.tasks add column if not exists reminded_for date;

-- Las notitas que ya existían no se avisan: solo las nuevas.
update public.daily_messages set pushed_at = now() where pushed_at is null;

create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid() limit 1;
$$;

-- Registra este dispositivo. Si ese dispositivo estaba a nombre de otra cuenta, pasa a esta.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid := public.my_household_id();
begin
  if auth.uid() is null or hid is null then
    raise exception 'sin hogar';
  end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'dispositivo no válido';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, household_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), hid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Dispositivos de las otras personas del hogar a los que se puede avisar de este tipo de cosa.
create or replace function public.push_targets(p_kind text, p_to uuid default null, p_include_self boolean default false)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where s.household_id = public.my_household_id()
    and (p_include_self or s.user_id <> auth.uid())
    and (p_to is null or s.user_id = p_to)
    and not (p_kind = any (p.push_off));
$$;

-- Quita un dispositivo que dejó de existir (el teléfono rechaza el aviso).
create or replace function public.push_forget(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and household_id = public.my_household_id();
$$;

revoke all on function public.my_household_id() from public, anon;
revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
revoke all on function public.push_targets(text, uuid, boolean) from public, anon;
revoke all on function public.push_forget(text) from public, anon;
grant execute on function public.my_household_id() to authenticated;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
grant execute on function public.push_targets(text, uuid, boolean) to authenticated;
grant execute on function public.push_forget(text) to authenticated;
