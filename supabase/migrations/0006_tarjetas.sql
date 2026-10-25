-- Ibasho · 0006 · Tarjetas de crédito, compras en cuotas y su reparto
-- Se puede ejecutar más de una vez sin errores.

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  color text not null default 'forest',
  -- Titular de la tarjeta: quien la paga cuando llega el vencimiento.
  owner_user_id uuid references auth.users (id) on delete set null default auth.uid(),
  closing_day int check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  archived boolean not null default false,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.card_purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  description text not null,
  merchant text,
  purchase_date date not null default current_date,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  interest_percent numeric(6, 2) not null default 0 check (interest_percent >= 0),
  installments_count int not null default 1 check (installments_count between 1 and 60),
  -- Si se envió a Gastos compartidos, el gasto que se creó.
  expense_id uuid references public.expenses (id) on delete set null,
  notes text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists card_purchases_card_idx on public.card_purchases (card_id, purchase_date desc);

-- A quién corresponde cada compra y en qué porcentaje (suma 100).
create table if not exists public.card_purchase_shares (
  purchase_id uuid not null references public.card_purchases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  percent numeric(5, 2) not null check (percent between 0 and 100),
  primary key (purchase_id, user_id)
);

-- manual_paid: nulo = automático según la fecha; verdadero/falso = ajuste manual.
create table if not exists public.card_installments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  purchase_id uuid not null references public.card_purchases (id) on delete cascade,
  number int not null check (number >= 1),
  due_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  manual_paid boolean,
  unique (purchase_id, number)
);

create index if not exists card_installments_due_idx on public.card_installments (household_id, due_date);

-- ============ RLS ============

do $$
declare
  t text;
begin
  foreach t in array array['cards', 'card_purchases', 'card_purchase_shares', 'card_installments']
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
end;
$$;

-- ============ Guardar una compra con su reparto y sus cuotas de una vez ============

-- Se ejecuta con los permisos de quien llama, así que aplica la seguridad por hogar.
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
  p_installments jsonb
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
    (household_id, card_id, description, merchant, purchase_date, total_amount, interest_percent, installments_count, notes)
  values
    (hid, p_card, trim(p_description), nullif(trim(coalesce(p_merchant, '')), ''), p_date, p_total, p_interest, p_count, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into pid;

  insert into public.card_purchase_shares (purchase_id, user_id, household_id, percent)
  select pid, (s ->> 'user_id')::uuid, hid, (s ->> 'percent')::numeric from jsonb_array_elements(p_shares) s;

  insert into public.card_installments (household_id, purchase_id, number, due_date, amount)
  select hid, pid, (i ->> 'number')::int, (i ->> 'due_date')::date, (i ->> 'amount')::numeric
  from jsonb_array_elements(p_installments) i;

  return pid;
end;
$$;

grant execute on function public.save_card_purchase(uuid, text, text, date, numeric, numeric, int, text, jsonb, jsonb) to authenticated;

-- Tiempo real (solo añade las tablas que aún no estén en la publicación)
do $$
declare
  t text;
begin
  foreach t in array array['cards', 'card_purchases', 'card_installments']
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
