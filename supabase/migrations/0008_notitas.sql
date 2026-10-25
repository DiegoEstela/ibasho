-- Ibasho · 0008 · Notitas: mensajes de pareja, programados, con lectura y reacciones
-- Se puede ejecutar más de una vez sin errores.

-- Fecha de hoy en la zona horaria del hogar (por ahora, España).
create or replace function public.today_local()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Madrid')::date;
$$;

create table if not exists public.daily_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- Nulo = para todas las demás personas del hogar.
  to_user uuid references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 600),
  paper text not null default 'crema',
  sticker text check (sticker is null or char_length(sticker) <= 8),
  -- Día en que la ve quien la recibe; si es futuro, queda programada.
  deliver_on date not null default public.today_local(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_messages_household_idx on public.daily_messages (household_id, deliver_on desc);

-- Quién ya abrió cada notita.
create table if not exists public.daily_message_reads (
  message_id uuid not null references public.daily_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  household_id uuid not null references public.households (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- Una reacción con emoji por persona y notita.
create table if not exists public.daily_message_reactions (
  message_id uuid not null references public.daily_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  household_id uuid not null references public.households (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

drop trigger if exists daily_messages_updated_at on public.daily_messages;
create trigger daily_messages_updated_at before update on public.daily_messages
  for each row execute function public.set_updated_at();

-- ============ RLS ============

alter table public.daily_messages enable row level security;
alter table public.daily_message_reads enable row level security;
alter table public.daily_message_reactions enable row level security;

drop policy if exists "notitas: ver las propias y las recibidas ya entregadas" on public.daily_messages;
create policy "notitas: ver las propias y las recibidas ya entregadas"
  on public.daily_messages for select to authenticated
  using (
    public.is_household_member(household_id)
    and (
      from_user = auth.uid()
      or ((to_user is null or to_user = auth.uid()) and deliver_on <= public.today_local())
    )
  );

drop policy if exists "notitas: escribir como uno mismo" on public.daily_messages;
create policy "notitas: escribir como uno mismo"
  on public.daily_messages for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and from_user = auth.uid()
    and (
      to_user is null
      or exists (
        select 1 from public.household_members m
        where m.household_id = daily_messages.household_id and m.user_id = daily_messages.to_user
      )
    )
  );

drop policy if exists "notitas: editar las propias" on public.daily_messages;
create policy "notitas: editar las propias"
  on public.daily_messages for update to authenticated
  using (from_user = auth.uid() and public.is_household_member(household_id))
  with check (from_user = auth.uid() and public.is_household_member(household_id));

drop policy if exists "notitas: borrar las propias" on public.daily_messages;
create policy "notitas: borrar las propias"
  on public.daily_messages for delete to authenticated
  using (from_user = auth.uid() and public.is_household_member(household_id));

-- Lecturas: las ve todo el hogar (así quien escribe sabe si la abrieron); cada quien registra la suya.
drop policy if exists "lecturas: ver las del hogar" on public.daily_message_reads;
create policy "lecturas: ver las del hogar"
  on public.daily_message_reads for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "lecturas: registrar la propia" on public.daily_message_reads;
create policy "lecturas: registrar la propia"
  on public.daily_message_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_household_member(household_id)
    and exists (select 1 from public.daily_messages m where m.id = message_id)
  );

-- Reacciones: las ve el hogar; cada quien gestiona la suya sobre notitas que puede ver.
drop policy if exists "reacciones: ver las del hogar" on public.daily_message_reactions;
create policy "reacciones: ver las del hogar"
  on public.daily_message_reactions for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "reacciones: crear la propia" on public.daily_message_reactions;
create policy "reacciones: crear la propia"
  on public.daily_message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_household_member(household_id)
    and exists (select 1 from public.daily_messages m where m.id = message_id)
  );

drop policy if exists "reacciones: cambiar la propia" on public.daily_message_reactions;
create policy "reacciones: cambiar la propia"
  on public.daily_message_reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reacciones: quitar la propia" on public.daily_message_reactions;
create policy "reacciones: quitar la propia"
  on public.daily_message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Tiempo real
do $$
declare
  t text;
begin
  foreach t in array array['daily_messages', 'daily_message_reads', 'daily_message_reactions']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
