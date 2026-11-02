-- Ibasho · 0033 · Mis cuentas: tarjetas privadas, fijos propios, mitad de fijos del hogar y presupuesto
-- Todo es privado: solo lo ve cada persona (user_id = auth.uid()). Se puede ejecutar más de una vez sin errores.

-- Tus tarjetas privadas: ni tu pareja ni nadie del hogar las ve.
create table if not exists public.personal_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  color text not null default 'forest',
  kind text not null check (kind in ('credit', 'debit')),
  -- Solo crédito: día de cierre del resumen y día de pago.
  closing_day int check (closing_day is null or closing_day between 1 and 31),
  due_day int check (due_day is null or due_day between 1 and 31),
  -- Solo débito: dinero que había al crearla; después cada movimiento suma o resta.
  initial_balance numeric(12, 2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists personal_cards_user_idx on public.personal_cards (user_id, archived);

-- Un movimiento propio puede pagarse con una tarjeta privada (card_id sigue siendo para las del hogar).
alter table public.personal_entries
  add column if not exists personal_card_id uuid references public.personal_cards (id) on delete set null;

-- Tus gastos fijos individuales (gimnasio, móvil, seguro…).
create table if not exists public.personal_fixed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text not null default 'Facturas',
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  -- 1 = cada mes, 3 = cada 3 meses, 12 = una vez al año…
  every_months int not null default 1 check (every_months between 1 and 24),
  -- Primer mes en que llega (siempre el día 1).
  start_month date not null default date_trunc('month', current_date)::date,
  due_day int check (due_day is null or due_day between 1 and 31),
  card_id uuid references public.cards (id) on delete set null,
  personal_card_id uuid references public.personal_cards (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists personal_fixed_user_idx on public.personal_fixed (user_id, archived);

-- Qué parte de cada gasto fijo del hogar cuenta en tu presupuesto (por defecto, la mitad).
create table if not exists public.personal_fixed_shares (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  fixed_id uuid not null references public.fixed_expenses (id) on delete cascade,
  percent numeric(5, 2) not null default 50 check (percent >= 0 and percent <= 100),
  primary key (user_id, fixed_id)
);

-- Tope mensual por categoría.
create table if not exists public.personal_budgets (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  category text not null,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  primary key (user_id, category)
);

do $$
declare
  t text;
begin
  foreach t in array array['personal_cards', 'personal_fixed', 'personal_fixed_shares', 'personal_budgets']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "personal: solo yo, %1$s" on public.%1$I', t);
    execute format(
      'create policy "personal: solo yo, %1$s" on public.%1$I for all to authenticated
         using (user_id = auth.uid())
         with check (user_id = auth.uid())',
      t
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
