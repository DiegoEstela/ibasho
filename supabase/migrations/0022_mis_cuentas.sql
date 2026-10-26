-- Ibasho · 0022 · Mis cuentas: finanzas personales (solo las ve cada persona)
-- Se puede ejecutar más de una vez sin errores.

-- Tu plan: cuánto cobras, cuánto tienes ahorrado y cuánto quieres ahorrar.
create table if not exists public.personal_plans (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  monthly_income numeric(12, 2) not null default 0 check (monthly_income >= 0),
  -- Día del mes en que cobras (opcional).
  pay_day int check (pay_day is null or pay_day between 1 and 31),
  -- Lo ahorrado en el momento de savings_updated_at; lo que apartes después se suma solo.
  savings_amount numeric(12, 2) not null default 0 check (savings_amount >= 0),
  savings_updated_at timestamptz not null default now(),
  monthly_saving_goal numeric(12, 2) not null default 0 check (monthly_saving_goal >= 0),
  -- Meta total de ahorro (opcional; 0 = sin meta).
  saving_target numeric(12, 2) not null default 0 check (saving_target >= 0),
  updated_at timestamptz not null default now()
);

-- Tus movimientos propios: gastos que no son compartidos, ingresos extra y lo que apartas para ahorrar.
create table if not exists public.personal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('expense', 'income', 'saving')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  entry_date date not null default current_date,
  category text not null default 'Otros',
  -- Con qué tarjeta se pagó; nulo = efectivo.
  card_id uuid references public.cards (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists personal_entries_user_idx on public.personal_entries (user_id, entry_date desc);

alter table public.personal_plans enable row level security;
alter table public.personal_entries enable row level security;

-- Nadie más que tú puede ver ni tocar esto, ni siquiera tu pareja.
drop policy if exists "personal: solo yo, plan" on public.personal_plans;
create policy "personal: solo yo, plan" on public.personal_plans for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "personal: solo yo, movimientos" on public.personal_entries;
create policy "personal: solo yo, movimientos" on public.personal_entries for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
