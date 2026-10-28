-- Ibasho · 0028 · Gastos de tarjeta de crédito: nacen "sin pagar" y solo pasan a Gastos cuando tú lo decides
-- Se puede ejecutar más de una vez sin errores.

-- La compra recuerda el viaje del que viene (si lo hay) y la categoría con la que se anotó,
-- para que al pasarla a Gastos caiga en el grupo del viaje o del hogar con esa categoría.
alter table public.card_purchases
  add column if not exists trip_id uuid references public.trips (id) on delete set null,
  add column if not exists category text;

create index if not exists card_purchases_trip_idx on public.card_purchases (trip_id) where trip_id is not null;

-- Antes una cuota se daba por pagada sola al llegar su fecha. Ahora solo cuenta lo que marcas a mano:
-- lo que ya existía se fija como estaba para no cambiar tus totales.
update public.card_installments
set manual_paid = (due_date <= current_date)
where manual_paid is null;

-- Misma función, con viaje y categoría opcionales.
drop function if exists public.save_card_purchase(uuid, text, text, date, numeric, numeric, int, text, jsonb, jsonb);

create or replace function public.save_card_purchase(
  p_card uuid,
  p_description text,
  p_merchant text,
  p_date date,
  p_total numeric,
  p_interest numeric,
  p_count int,
  p_notes text,
  p_shares jsonb,
  p_installments jsonb,
  p_trip uuid default null,
  p_category text default null
)
returns uuid
language plpgsql
as $$
declare
  hid uuid;
  pid uuid;
  share_sum numeric;
  inst_sum numeric;
  inst_count int;
begin
  select household_id into hid from public.cards where id = p_card;
  if hid is null then
    raise exception 'Tarjeta no encontrada';
  end if;

  if p_trip is not null and not exists (select 1 from public.trips where id = p_trip and household_id = hid) then
    raise exception 'Viaje no encontrado';
  end if;

  select coalesce(sum((s ->> 'percent')::numeric), 0) into share_sum from jsonb_array_elements(p_shares) s;
  if round(share_sum, 2) <> 100 then
    raise exception 'Los porcentajes deben sumar 100';
  end if;

  select coalesce(sum((i ->> 'amount')::numeric), 0), count(*) into inst_sum, inst_count
  from jsonb_array_elements(p_installments) i;
  if inst_count <> p_count then
    raise exception 'El número de cuotas no coincide';
  end if;
  if round(inst_sum, 2) <> round(p_total * (1 + p_interest / 100), 2) then
    raise exception 'Las cuotas no suman el total a pagar';
  end if;

  insert into public.card_purchases
    (household_id, card_id, description, merchant, purchase_date, total_amount, interest_percent, installments_count, notes, trip_id, category)
  values
    (hid, p_card, trim(p_description), nullif(trim(coalesce(p_merchant, '')), ''), p_date, p_total, p_interest, p_count,
     nullif(trim(coalesce(p_notes, '')), ''), p_trip, nullif(trim(coalesce(p_category, '')), ''))
  returning id into pid;

  insert into public.card_purchase_shares (purchase_id, user_id, household_id, percent)
  select pid, (s ->> 'user_id')::uuid, hid, (s ->> 'percent')::numeric from jsonb_array_elements(p_shares) s;

  -- Todas las cuotas nacen sin pagar (manual_paid = false): las marcas tú cuando se cobran.
  insert into public.card_installments (household_id, purchase_id, number, due_date, amount, manual_paid)
  select hid, pid, (i ->> 'number')::int, (i ->> 'due_date')::date, (i ->> 'amount')::numeric, false
  from jsonb_array_elements(p_installments) i;

  return pid;
end;
$$;

grant execute on function public.save_card_purchase(uuid, text, text, date, numeric, numeric, int, text, jsonb, jsonb, uuid, text) to authenticated;

notify pgrst, 'reload schema';
