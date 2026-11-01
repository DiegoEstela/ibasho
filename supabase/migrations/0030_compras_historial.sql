-- Ibasho · 0030 · Compras: carrito, terminar compra e historial
-- Se puede ejecutar más de una vez sin errores.

-- true = tachado en el súper y aún sin registrar en una compra terminada.
alter table public.shopping_items
  add column if not exists en_carrito boolean not null default false;

create index if not exists shopping_items_carrito_idx
  on public.shopping_items (household_id)
  where en_carrito;

-- Una compra terminada: cuándo, dónde, cuánto y quién pagó. expense_id se rellena al pasarla a Gastos.
create table if not exists public.shopping_purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  purchased_on date not null default current_date,
  store text,
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  expense_id uuid references public.expenses (id) on delete set null,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists shopping_purchases_household_idx
  on public.shopping_purchases (household_id, purchased_on desc, created_at desc);

-- Copia de lo que se compró (no depende de la lista: sobrevive aunque se borre el producto).
create table if not exists public.shopping_purchase_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  purchase_id uuid not null references public.shopping_purchases (id) on delete cascade,
  name text not null,
  quantity text,
  category text
);

create index if not exists shopping_purchase_items_purchase_idx on public.shopping_purchase_items (purchase_id);

do $$
declare
  t text;
begin
  foreach t in array array['shopping_purchases', 'shopping_purchase_items']
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

  foreach t in array array['shopping_purchases', 'shopping_purchase_items']
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
