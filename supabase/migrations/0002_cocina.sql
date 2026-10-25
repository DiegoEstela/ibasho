-- Ibasho · 0002 · Cocina: productos canónicos, lista de compras mínima, recetas y menú semanal

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ Productos canónicos y lista de compras mínima ============

create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  category text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (household_id, name_key)
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  quantity text,
  note text,
  done boolean not null default false,
  done_by uuid references auth.users (id),
  done_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_items_household_idx on public.shopping_items (household_id, done);

-- ============ Recetas ============

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  photo_url text,
  servings int not null default 2 check (servings > 0),
  prep_minutes int check (prep_minutes >= 0),
  difficulty text not null default 'media' check (difficulty in ('facil', 'media', 'dificil')),
  tags text[] not null default '{}',
  notes text,
  source_url text,
  is_favorite boolean not null default false,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_household_idx on public.recipes (household_id, created_at desc);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  quantity numeric,
  unit text,
  position int not null default 0
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position int not null default 0,
  body text not null
);

create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);

create table public.recipe_ratings (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  household_id uuid not null references public.households (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create table public.recipe_cooked (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  cooked_on date not null default current_date,
  cooked_by uuid references auth.users (id) default auth.uid()
);

-- ============ Menú semanal ============

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  plan_date date not null,
  meal text not null check (meal in ('comida', 'cena')),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (household_id, plan_date, meal)
);

-- ============ Triggers de updated_at ============

create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger shopping_items_updated_at before update on public.shopping_items
  for each row execute function public.set_updated_at();

-- ============ RLS: todo pertenece a un hogar y solo lo ven sus miembros ============

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'shopping_items', 'recipes', 'recipe_ingredients', 'recipe_steps',
    'recipe_ratings', 'recipe_cooked', 'meal_plan_entries'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "hogar: acceso a %1$s" on public.%1$I for all to authenticated
         using (public.is_household_member(household_id))
         with check (public.is_household_member(household_id))',
      t
    );
  end loop;
end;
$$;

-- Cada persona solo puede escribir su propia valoración
drop policy "hogar: acceso a recipe_ratings" on public.recipe_ratings;

create policy "valoraciones: ver las del hogar"
  on public.recipe_ratings for select to authenticated
  using (public.is_household_member(household_id));

create policy "valoraciones: escribir la propia"
  on public.recipe_ratings for all to authenticated
  using (user_id = auth.uid() and public.is_household_member(household_id))
  with check (user_id = auth.uid() and public.is_household_member(household_id));

-- ============ Tiempo real para la lista de compras ============

alter publication supabase_realtime add table public.shopping_items;
