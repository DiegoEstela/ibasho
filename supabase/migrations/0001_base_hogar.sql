-- Ibasho · 0001 · Perfiles, hogares y miembros (con RLS)

-- ============ Tablas ============

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  color text not null default '#6f8f5e',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

-- ============ Funciones auxiliares (evitan recursión en RLS) ============

create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create function public.shares_household_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members a
    join public.household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ============ Perfil automático al registrarse ============

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RLS ============

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "perfil: ver el propio o el de mi hogar"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_household_with(id));

create policy "perfil: editar el propio"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "hogar: ver si soy miembro"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "hogar: editar si soy miembro"
  on public.households for update to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "miembros: ver los de mi hogar"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

create policy "miembros: salir del hogar"
  on public.household_members for delete to authenticated
  using (user_id = auth.uid());

-- ============ Crear hogar / unirse con código ============

create function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.households (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  return hid;
end;
$$;

create function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select id into hid from public.households
  where invite_code = upper(trim(p_code));

  if hid is null then
    raise exception 'Código de invitación no válido';
  end if;

  insert into public.household_members (household_id, user_id)
  values (hid, auth.uid())
  on conflict do nothing;

  return hid;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
