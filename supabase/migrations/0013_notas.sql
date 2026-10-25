-- Ibasho · 0013 · Notas del hogar: medidas, datos útiles y claves, con foto opcional
-- Se puede ejecutar más de una vez sin errores.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 5000),
  tag text not null default 'casa',
  pinned boolean not null default false,
  -- Las notas «secretas» (claves, códigos) se muestran ocultas hasta que se tocan.
  is_secret boolean not null default false,
  -- Foto opcional, en el almacenamiento privado: {hogar}/notas/{archivo}
  photo_path text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_household_idx on public.notes (household_id, pinned desc, updated_at desc);

drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;
drop policy if exists "hogar: acceso a notes" on public.notes;
create policy "hogar: acceso a notes"
  on public.notes for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end;
$$;

notify pgrst, 'reload schema';
