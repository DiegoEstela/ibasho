-- Ibasho · 0005 · Gastos compartidos (motor reutilizable para el hogar y los viajes)
-- Se puede ejecutar más de una vez sin errores: lo que ya existe se conserva o se reemplaza.

-- Un "grupo" agrupa gastos: el del hogar o, más adelante, el de cada viaje.
create table if not exists public.expense_groups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null default 'household' check (kind in ('household', 'trip')),
  name text not null,
  currency text not null default 'EUR',
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Cada hogar tiene un único grupo de tipo "household".
create unique index if not exists expense_groups_one_household_idx
  on public.expense_groups (household_id) where kind = 'household';

-- Participantes: personas con cuenta (user_id) o invitadas sin cuenta (user_id nulo).
create table if not exists public.expense_participants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  color text not null default '#6f8f5e',
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  category text not null default 'Otros',
  paid_by uuid not null references public.expense_participants (id),
  notes text,
  receipt_path text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_group_date_idx on public.expenses (group_id, expense_date desc);

-- Cuánto le corresponde pagar a cada participante de cada gasto.
create table if not exists public.expense_splits (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  participant_id uuid not null references public.expense_participants (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  primary key (expense_id, participant_id)
);

-- Pagos para saldar deudas.
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  group_id uuid not null references public.expense_groups (id) on delete cascade,
  from_participant uuid not null references public.expense_participants (id),
  to_participant uuid not null references public.expense_participants (id),
  amount numeric(12, 2) not null check (amount > 0),
  settled_on date not null default current_date,
  note text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_participant <> to_participant)
);

drop trigger if exists expenses_updated_at on public.expenses;
create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- ============ RLS ============

do $$
declare
  t text;
begin
  foreach t in array array[
    'expense_groups', 'expense_participants', 'expenses', 'expense_splits', 'settlements'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "hogar: acceso a %1$s" on public.%1$I', t);
    execute format(
      'create policy "hogar: acceso a %1$s" on public.%1$I for all to authenticated
         using (public.is_household_member(household_id))
         with check (public.is_household_member(household_id))',
      t
    );
  end loop;
end;
$$;

-- ============ Funciones ============

-- Crea (si falta) el grupo de gastos del hogar y sincroniza a los miembros como participantes.
create or replace function public.ensure_household_expense_group(p_household uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if not public.is_household_member(p_household) then
    raise exception 'No autorizado';
  end if;

  select id into gid from public.expense_groups
  where household_id = p_household and kind = 'household';

  if gid is null then
    insert into public.expense_groups (household_id, kind, name, created_by)
    values (p_household, 'household', 'Hogar', auth.uid())
    returning id into gid;
  end if;

  -- Crea el perfil de quien no lo tenga (cuentas anteriores al disparador de perfiles).
  insert into public.profiles (id, display_name)
  select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(u.email, '@', 1))
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = p_household
  on conflict (id) do nothing;

  insert into public.expense_participants (household_id, group_id, user_id, name, color)
  select p_household, gid, m.user_id,
         coalesce(nullif(pr.display_name, ''), 'Alguien'), coalesce(pr.color, '#6f8f5e')
  from public.household_members m
  left join public.profiles pr on pr.id = m.user_id
  where m.household_id = p_household
  on conflict (group_id, user_id) do nothing;

  return gid;
end;
$$;

revoke all on function public.ensure_household_expense_group(uuid) from public, anon;
grant execute on function public.ensure_household_expense_group(uuid) to authenticated;

-- Guarda un gasto y su reparto de forma atómica (crear si p_id es nulo, editar si no).
-- Se ejecuta con los permisos de quien llama, así que aplica la seguridad por hogar.
create or replace function public.save_expense(
  p_id uuid,
  p_group uuid,
  p_description text,
  p_amount numeric,
  p_date date,
  p_category text,
  p_paid_by uuid,
  p_splits jsonb
)
returns uuid
language plpgsql
as $$
declare
  hid uuid;
  eid uuid := p_id;
  total numeric;
begin
  select household_id into hid from public.expense_groups where id = p_group;
  if hid is null then
    raise exception 'Grupo no encontrado';
  end if;

  select coalesce(sum((s ->> 'amount')::numeric), 0) into total
  from jsonb_array_elements(p_splits) s;
  if round(total, 2) <> round(p_amount, 2) then
    raise exception 'Las partes no suman el importe del gasto';
  end if;

  if eid is null then
    insert into public.expenses (household_id, group_id, description, amount, expense_date, category, paid_by)
    values (hid, p_group, trim(p_description), p_amount, p_date, p_category, p_paid_by)
    returning id into eid;
  else
    update public.expenses
    set description = trim(p_description), amount = p_amount, expense_date = p_date,
        category = p_category, paid_by = p_paid_by
    where id = eid and group_id = p_group;
    if not found then
      raise exception 'Gasto no encontrado';
    end if;
    delete from public.expense_splits where expense_id = eid;
  end if;

  insert into public.expense_splits (expense_id, participant_id, household_id, amount)
  select eid, (s ->> 'participant_id')::uuid, hid, (s ->> 'amount')::numeric
  from jsonb_array_elements(p_splits) s;

  return eid;
end;
$$;

grant execute on function public.save_expense(uuid, uuid, text, numeric, date, text, uuid, jsonb) to authenticated;

-- Tiempo real (solo añade las tablas que aún no estén en la publicación)
do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'expense_splits', 'settlements']
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

-- Refresca la caché de la API para que vea las funciones nuevas al instante.
notify pgrst, 'reload schema';
