-- Ibasho · 0034 · Productos dentro de una compra con tarjeta (opcional)
-- Se puede ejecutar más de una vez sin errores.

-- Cada producto tiene su importe y a quién corresponde: user_id nulo = compartido a partes iguales.
-- El reparto de la compra (card_purchase_shares) se calcula a partir de estos productos.
create table if not exists public.card_purchase_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  purchase_id uuid not null references public.card_purchases (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  user_id uuid references auth.users (id) on delete set null,
  position int not null default 0
);

create index if not exists card_purchase_items_purchase_idx on public.card_purchase_items (purchase_id);

alter table public.card_purchase_items enable row level security;
drop policy if exists "hogar: acceso a card_purchase_items" on public.card_purchase_items;
create policy "hogar: acceso a card_purchase_items" on public.card_purchase_items for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop function if exists public.save_card_purchase(uuid, text, text, date, numeric, numeric, int, text, jsonb, jsonb, uuid, text, jsonb);

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
  p_category text default null,
  p_split jsonb default null,
  p_items jsonb default null
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

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    if round((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(p_items) x), 2) <> round(p_total, 2) then
      raise exception 'Los productos no suman el importe de la compra';
    end if;
  end if;

  insert into public.card_purchases
    (household_id, card_id, description, merchant, purchase_date, total_amount, interest_percent, installments_count, notes, trip_id, category, split_plan)
  values
    (hid, p_card, trim(p_description), nullif(trim(coalesce(p_merchant, '')), ''), p_date, p_total, p_interest, p_count,
     nullif(trim(coalesce(p_notes, '')), ''), p_trip, nullif(trim(coalesce(p_category, '')), ''), p_split)
  returning id into pid;

  insert into public.card_purchase_shares (purchase_id, user_id, household_id, percent)
  select pid, (s ->> 'user_id')::uuid, hid, (s ->> 'percent')::numeric from jsonb_array_elements(p_shares) s;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into public.card_purchase_items (household_id, purchase_id, name, amount, user_id, position)
    select hid, pid, trim(x.item ->> 'name'), (x.item ->> 'amount')::numeric, nullif(x.item ->> 'user_id', '')::uuid, (x.n - 1)::int
    from jsonb_array_elements(p_items) with ordinality as x(item, n);
  end if;

  -- Todas las cuotas nacen sin pagar (manual_paid = false): las marcas tú cuando se cobran.
  insert into public.card_installments (household_id, purchase_id, number, due_date, amount, manual_paid)
  select hid, pid, (i ->> 'number')::int, (i ->> 'due_date')::date, (i ->> 'amount')::numeric, false
  from jsonb_array_elements(p_installments) i;

  return pid;
end;
$$;

grant execute on function public.save_card_purchase(uuid, text, text, date, numeric, numeric, int, text, jsonb, jsonb, uuid, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
