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

-- ============ save_expense con tarjeta ============

-- La firma cambia (nuevo parámetro p_card): se elimina la anterior para que no queden dos versiones.
drop function if exists public.save_expense(uuid, uuid, text, numeric, date, text, uuid, jsonb);

create or replace function public.save_expense(
  p_id uuid,
  p_group uuid,
  p_description text,
  p_amount numeric,
  p_date date,
  p_category text,
  p_paid_by uuid,
  p_splits jsonb,
  p_card uuid default null
)
returns uuid
language plpgsql
as $$
declare
  hid uuid;
  eid uuid := p_id;
  total numeric;
begin
  select household_id into hid from public.expense_groups where id = p_group;
  if hid is null then
    raise exception 'Grupo no encontrado';
  end if;

  if p_card is not null and not exists (
    select 1 from public.cards where id = p_card and household_id = hid
  ) then
    raise exception 'Tarjeta no encontrada';
  end if;

  select coalesce(sum((s ->> 'amount')::numeric), 0) into total
  from jsonb_array_elements(p_splits) s;
  if round(total, 2) <> round(p_amount, 2) then
    raise exception 'Las partes no suman el importe del gasto';
  end if;

  if eid is null then
    insert into public.expenses (household_id, group_id, description, amount, expense_date, category, paid_by, card_id)
    values (hid, p_group, trim(p_description), p_amount, p_date, p_category, p_paid_by, p_card)
    returning id into eid;
  else
    update public.expenses
    set description = trim(p_description), amount = p_amount, expense_date = p_date,
        category = p_category, paid_by = p_paid_by, card_id = p_card
    where id = eid and group_id = p_group;
    if not found then
      raise exception 'Gasto no encontrado';
    end if;
    delete from public.expense_splits where expense_id = eid;
  end if;

  insert into public.expense_splits (expense_id, participant_id, household_id, amount)
  select eid, (s ->> 'participant_id')::uuid, hid, (s ->> 'amount')::numeric
  from jsonb_array_elements(p_splits) s;

  return eid;
end;
$$;

grant execute on function public.save_expense(uuid, uuid, text, numeric, date, text, uuid, jsonb, uuid) to authenticated;

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
