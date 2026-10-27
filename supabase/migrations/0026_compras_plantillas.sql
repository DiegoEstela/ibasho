-- Ibasho · 0026 · Plantillas de compra («Desayuno», «Compra semanal»…)
-- Se puede ejecutar más de una vez sin errores.

-- La plantilla: un nombre y el orden en que se muestra.
create table if not exists public.shopping_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position int not null default 0,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists shopping_templates_household_idx on public.shopping_templates (household_id, position);

-- Sus productos, con la cantidad habitual como texto libre («2 L», «500 g»), igual que en la lista.
-- Si se borra el producto del maestro, sale también de la plantilla.
create table if not exists public.shopping_template_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  template_id uuid not null references public.shopping_templates (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity text,
  created_at timestamptz not null default now(),
  unique (template_id, product_id)
);

create index if not exists shopping_template_items_template_idx on public.shopping_template_items (template_id);

do $$
declare
  t text;
begin
  foreach t in array array['shopping_templates', 'shopping_template_items']
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

  -- Se sincronizan en tiempo real entre ustedes.
  foreach t in array array['shopping_templates', 'shopping_template_items']
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
