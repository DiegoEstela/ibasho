-- Baúl: documentos del día a día (entradas, billetes, reservas…) guardados como en una cartera.
-- Los archivos van al mismo almacenamiento privado que Viajes (bucket trip-files, carpeta del hogar).
-- Se puede ejecutar más de una vez.

create table if not exists public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  category text not null default 'otro',
  doc_date date,
  doc_time time,
  -- Ruta del archivo en el almacenamiento: {hogar}/baul/{id}-{nombre}
  file_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  notes text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists vault_documents_household_idx on public.vault_documents (household_id, doc_date, doc_time);

alter table public.vault_documents enable row level security;

drop policy if exists "hogar: acceso a vault_documents" on public.vault_documents;
create policy "hogar: acceso a vault_documents" on public.vault_documents for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vault_documents'
  ) then
    alter publication supabase_realtime add table public.vault_documents;
  end if;
end;
$$;
