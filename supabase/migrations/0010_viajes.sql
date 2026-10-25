-- Ibasho · 0010 · Viajes: viajes, listas de Google Maps, lugares y documentos con archivos
-- Se puede ejecutar más de una vez sin errores.

-- ============ Tablas ============

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  destination text check (destination is null or char_length(destination) <= 80),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  color text not null default 'sky',
  start_date date,
  end_date date,
  -- Ruta de la foto de portada en el almacenamiento (bucket trip-files).
  cover_path text,
  notes text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists trips_household_idx on public.trips (household_id, start_date);

-- Listas de Google Maps guardadas en el viaje («Mis lugares de Japón»).
create table if not exists public.trip_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  url text not null check (url ~* '^https?://'),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists trip_lists_trip_idx on public.trip_lists (trip_id, position);

create table if not exists public.trip_places (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  category text not null default 'otro',
  maps_url text check (maps_url is null or maps_url ~* '^https?://'),
  note text,
  -- Día del viaje en que se planea ir (opcional).
  planned_day date,
  done boolean not null default false,
  favorite boolean not null default false,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists trip_places_trip_idx on public.trip_places (trip_id, created_at);

create table if not exists public.trip_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  doc_type text not null default 'otro',
  doc_date date,
  doc_time time,
  -- Ruta del archivo en el almacenamiento: {hogar}/{viaje}/{id}-{nombre}
  file_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  notes text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists trip_documents_trip_idx on public.trip_documents (trip_id, doc_date, doc_time);

drop trigger if exists trips_updated_at on public.trips;
create trigger trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

-- ============ RLS: todo pertenece a un hogar ============

do $$
declare
  t text;
begin
  foreach t in array array['trips', 'trip_lists', 'trip_places', 'trip_documents']
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

-- ============ Archivos: almacenamiento privado, una carpeta por hogar ============

-- Identificador del hogar a partir de la ruta de un archivo ({hogar}/{viaje}/...); nulo si no es válida.
create or replace function public.storage_household_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end;
$$;

-- Privado, hasta 15 MB por archivo y solo imágenes o PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-files', 'trip-files', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "viajes: ver archivos del hogar" on storage.objects;
create policy "viajes: ver archivos del hogar"
  on storage.objects for select to authenticated
  using (bucket_id = 'trip-files' and public.is_household_member(public.storage_household_id(name)));

drop policy if exists "viajes: subir archivos al hogar" on storage.objects;
create policy "viajes: subir archivos al hogar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-files' and public.is_household_member(public.storage_household_id(name)));

drop policy if exists "viajes: cambiar archivos del hogar" on storage.objects;
create policy "viajes: cambiar archivos del hogar"
  on storage.objects for update to authenticated
  using (bucket_id = 'trip-files' and public.is_household_member(public.storage_household_id(name)));

drop policy if exists "viajes: borrar archivos del hogar" on storage.objects;
create policy "viajes: borrar archivos del hogar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'trip-files' and public.is_household_member(public.storage_household_id(name)));

-- Tiempo real: lo que añade una persona lo ve la otra al instante.
do $$
declare
  t text;
begin
  foreach t in array array['trips', 'trip_lists', 'trip_places', 'trip_documents']
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
