-- Ibasho · 0024 · Gastos fijos y suscripciones (luz, agua, internet, gimnasio, Netflix…)
-- Se puede ejecutar más de una vez sin errores.

-- El gasto fijo: cada cuántos meses llega y el último importe guardado, que sirve de referencia para el mes siguiente.
create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text not null default 'Facturas',
  -- Último importe guardado (referencia para el próximo mes).
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  -- 1 = cada mes, 3 = cada 3 meses (el agua), 12 = una vez al año…
  every_months int not null default 1 check (every_months between 1 and 24),
  -- Primer mes en que llega (siempre el día 1); de ahí salen los meses que toca pagarlo.
  start_month date not null default date_trunc('month', current_date)::date,
  due_day int check (due_day is null or due_day between 1 and 31),
  -- Quién lo paga; nulo = sale de una tarjeta compartida.
  paid_by uuid references auth.users (id) on delete set null,
  -- Si se carga a una tarjeta (suscripciones): suma al total que se paga en el cierre.
  card_id uuid references public.cards (id) on delete set null,
  is_subscription boolean not null default false,
  archived boolean not null default false,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists fixed_expenses_household_idx on public.fixed_expenses (household_id, archived);

-- Lo que costó cada mes y, si ya se pasó a Gastos, el gasto que se creó.
create table if not exists public.fixed_expense_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  fixed_id uuid not null references public.fixed_expenses (id) on delete cascade,
  month date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  expense_id uuid references public.expenses (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (fixed_id, month)
);

do $$
declare
  t text;
begin
  foreach t in array array['fixed_expenses', 'fixed_expense_entries']
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
  foreach t in array array['fixed_expenses', 'fixed_expense_entries']
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
