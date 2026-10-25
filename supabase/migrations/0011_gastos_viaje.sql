-- Ibasho · 0011 · Gastos de viaje: grupo por viaje, invitados sin cuenta y varias monedas
-- Se puede ejecutar más de una vez sin errores.

-- Moneda del destino del viaje (por defecto, euros).
alter table public.trips add column if not exists currency text not null default 'EUR';

-- Cada viaje tiene su propio grupo de gastos.
alter table public.expense_groups add column if not exists trip_id uuid references public.trips (id) on delete cascade;

create unique index if not exists expense_groups_one_per_trip_idx
  on public.expense_groups (trip_id) where kind = 'trip';

-- Gastos en otra moneda: `amount` sigue siendo en euros (ya convertido), así que los saldos no cambian.
alter table public.expenses add column if not exists currency text not null default 'EUR';
alter table public.expenses add column if not exists original_amount numeric(14, 2);
-- Unidades de la moneda por cada 1 euro (por ejemplo, 175,51 para yenes).
alter table public.expenses add column if not exists exchange_rate numeric(18, 6);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trips_currency_check') then
    alter table public.trips add constraint trips_currency_check check (currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_currency_check') then
    alter table public.expenses add constraint expenses_currency_check check (currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_original_amount_check') then
    alter table public.expenses add constraint expenses_original_amount_check check (original_amount is null or original_amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_exchange_rate_check') then
    alter table public.expenses add constraint expenses_exchange_rate_check check (exchange_rate is null or exchange_rate > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expense_groups_trip_needs_trip') then
    alter table public.expense_groups add constraint expense_groups_trip_needs_trip check (kind <> 'trip' or trip_id is not null);
  end if;
end;
$$;

-- ============ save_expense: ahora también guarda la moneda original ============

-- La firma cambia (nuevos parámetros): se eliminan las anteriores para que no queden varias versiones.
drop function if exists public.save_expense(uuid, uuid, text, numeric, date, text, uuid, jsonb);
drop function if exists public.save_expense(uuid, uuid, text, numeric, date, text, uuid, jsonb, uuid);

create or replace function public.save_expense(
  p_id uuid,
  p_group uuid,
  p_description text,
  p_amount numeric,
  p_date date,
  p_category text,
  p_paid_by uuid,
  p_splits jsonb,
  p_card uuid default null,
  p_currency text default 'EUR',
  p_original_amount numeric default null,
  p_rate numeric default null
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

  if p_currency <> 'EUR' and (p_original_amount is null or p_rate is null) then
    raise exception 'Falta el importe original o la cotización';
  end if;

  select coalesce(sum((s ->> 'amount')::numeric), 0) into total
  from jsonb_array_elements(p_splits) s;
  if round(total, 2) <> round(p_amount, 2) then
    raise exception 'Las partes no suman el importe del gasto';
  end if;

  if eid is null then
    insert into public.expenses
      (household_id, group_id, description, amount, expense_date, category, paid_by, card_id, currency, original_amount, exchange_rate)
    values
      (hid, p_group, trim(p_description), p_amount, p_date, p_category, p_paid_by, p_card,
       p_currency, case when p_currency = 'EUR' then null else p_original_amount end,
       case when p_currency = 'EUR' then null else p_rate end)
    returning id into eid;
  else
    update public.expenses
    set description = trim(p_description), amount = p_amount, expense_date = p_date,
        category = p_category, paid_by = p_paid_by, card_id = p_card, currency = p_currency,
        original_amount = case when p_currency = 'EUR' then null else p_original_amount end,
        exchange_rate = case when p_currency = 'EUR' then null else p_rate end
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

grant execute on function public.save_expense(uuid, uuid, text, numeric, date, text, uuid, jsonb, uuid, text, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
