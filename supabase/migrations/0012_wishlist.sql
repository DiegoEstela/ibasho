-- Ibasho · 0012 · Wishlist: listas de deseos con enlaces, foto, precio y prioridad
-- Se puede ejecutar más de una vez sin errores.

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  position int not null default 0,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  url text check (url is null or url ~* '^https?://'),
  -- Foto del producto (enlace de la tienda).
  image_url text check (image_url is null or image_url ~* '^https?://'),
  price numeric(12, 2) check (price is null or price >= 0),
  -- 1 = me encantaría, 2 = me gustaría, 3 = algún día.
  priority smallint not null default 2 check (priority between 1 and 3),
  -- De quién es el deseo; nulo = de los dos.
  owner_user_id uuid references auth.users (id) on delete set null,
  note text,
  status text not null default 'deseado' check (status in ('deseado', 'comprado')),
  purchased_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists wishlist_items_list_idx on public.wishlist_items (wishlist_id, status, priority);

-- ============ RLS ============

do $$
declare
  t text;
begin
  foreach t in array array['wishlists', 'wishlist_items']
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

  foreach t in array array['wishlists', 'wishlist_items']
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
