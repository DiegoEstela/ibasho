-- Ibasho · 0014 · Tareas del hogar: recurrentes, asignables y con registro de quién las hizo
-- Se puede ejecutar más de una vez sin errores.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 500),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'every_n_days', 'weekly', 'monthly')),
  interval_days int check (interval_days is null or interval_days between 1 and 365),
  -- Días de la semana en que toca (0 = domingo … 6 = sábado), para las semanales.
  weekdays smallint[] not null default '{}',
  month_day smallint check (month_day is null or month_day between 1 and 31),
  -- Próxima vez que toca hacerla.
  due_date date not null default public.today_local(),
  -- Hora para el recordatorio (se usará cuando estén activados los avisos al teléfono).
  remind_time time,
  -- Quién la hace; nulo = cualquiera de las personas del hogar.
  assigned_to uuid references auth.users (id) on delete set null,
  -- Falso cuando una tarea que no se repite ya se hizo.
  active boolean not null default true,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (recurrence <> 'every_n_days' or interval_days is not null),
  check (recurrence <> 'weekly' or cardinality(weekdays) > 0),
  check (recurrence <> 'monthly' or month_day is not null)
);

create index if not exists tasks_due_idx on public.tasks (household_id, active, due_date);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  done_by uuid references auth.users (id) on delete set null default auth.uid(),
  done_on date not null default public.today_local(),
  completed_at timestamptz not null default now(),
  -- Cómo estaba la tarea antes, para poder deshacer.
  prev_due date not null,
  prev_active boolean not null
);

create index if not exists task_completions_idx on public.task_completions (household_id, done_on desc);

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'task_completions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "hogar: acceso a %1$s" on public.%1$I', t);
    execute format(
      'create policy "hogar: acceso a %1$s" on public.%1$I for all to authenticated
         using (public.is_household_member(household_id))
         with check (public.is_household_member(household_id))',
      t
    );
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Marca una tarea como hecha y programa la siguiente, todo de una vez.
-- La fecha siguiente la calcula la aplicación; se ejecuta con los permisos de quien llama.
create or replace function public.complete_task(p_task uuid, p_done_on date, p_next_due date, p_next_active boolean)
returns uuid
language plpgsql
as $$
declare
  t public.tasks%rowtype;
  cid uuid;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Tarea no encontrada';
  end if;
  if not t.active then
    raise exception 'La tarea ya está hecha';
  end if;

  insert into public.task_completions (household_id, task_id, done_on, prev_due, prev_active)
  values (t.household_id, t.id, p_done_on, t.due_date, t.active)
  returning id into cid;

  update public.tasks set due_date = p_next_due, active = p_next_active where id = t.id;
  return cid;
end;
$$;

-- Deshace el último «hecho»: la tarea vuelve a como estaba.
create or replace function public.undo_task_completion(p_completion uuid)
returns void
language plpgsql
as $$
declare
  c public.task_completions%rowtype;
begin
  select * into c from public.task_completions where id = p_completion;
  if not found then
    raise exception 'Registro no encontrado';
  end if;

  update public.tasks set due_date = c.prev_due, active = c.prev_active where id = c.task_id;
  delete from public.task_completions where id = c.id;
end;
$$;

grant execute on function public.complete_task(uuid, date, date, boolean) to authenticated;
grant execute on function public.undo_task_completion(uuid) to authenticated;

notify pgrst, 'reload schema';
