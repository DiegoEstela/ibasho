-- Ibasho · 0003 · Compras: categoría y supermercado en la lista, y categorías propias del hogar

alter table public.shopping_items
  add column category text not null default 'Otros',
  add column store text;

create index shopping_items_done_at_idx on public.shopping_items (household_id, done_at desc);

-- Categorías inventadas por el hogar (las predeterminadas viven en el código)
create table public.shopping_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  icon text not null default 'Package',
  color text not null default 'forest',
  position int not null default 0,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (household_id, name_key)
);

alter table public.shopping_categories enable row level security;

create policy "hogar: acceso a shopping_categories"
  on public.shopping_categories for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

alter publication supabase_realtime add table public.shopping_categories;
