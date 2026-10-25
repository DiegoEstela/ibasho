-- Ibasho · 0007 · Tarjetas de débito con saldo, ingresos y gastos pagados con tarjeta
-- Se puede ejecutar más de una vez sin errores.

-- ============ Tarjetas: tipo y saldo inicial ============

alter table public.cards add column if not exists kind text not null default 'credit';
alter table public.cards add column if not exists initial_balance numeric(12, 2) not null default 0;

-- Las de débito no tienen día de pago.
alter table public.cards alter column due_day drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_kind_check') then
    alter table public.cards add constraint cards_kind_check check (kind in ('credit', 'debit'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cards_credit_needs_due_day') then
    alter table public.cards add constraint cards_credit_needs_due_day check (kind <> 'credit' or due_day is not null);
  end if;
end;
$$;

-- ============ Gastos: con qué tarjeta se pagaron ============

alter table public.expenses add column if not exists card_id uuid references public.cards (id) on delete set null;
-- paid_by nulo = pagado desde una tarjeta compartida (no genera deudas entre las personas).
alter table public.expenses alter column paid_by drop not null;

create index if not exists expenses_card_idx on public.expenses (card_id, expense_date desc);

-- ============ Ingresos a una tarjeta ============

create table if not exists public.card_deposits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  deposit_date date not null default current_date,
  -- Quién puso el dinero (puede registrarlo otra persona).
  deposited_by uuid references auth.users (id) on delete set null default auth.uid(),
  note text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists card_deposits_card_idx on public.card_deposits (card_id, deposit_date desc);

alter table public.card_deposits enable row level security;
drop policy if exists "hogar: acceso a card_deposits" on public.card_deposits;
create policy "hogar: acceso a card_deposits"
  on public.card_deposits for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- La función save_expense (guardar un gasto con su reparto, su tarjeta y su moneda) se define en 0011_gastos_viaje.sql.

-- Tiempo real
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_deposits'
  ) then
    alter publication supabase_realtime add table public.card_deposits;
  end if;
end;
$$;

notify pgrst, 'reload schema';
