-- Ibasho · 0020 · Compras: lo que hay en casa y los productos de siempre
-- Se puede ejecutar más de una vez sin errores.

-- Si el producto está en casa (true) o falta (false).
alter table public.products add column if not exists in_stock boolean not null default true;
-- Si es de los que siempre se compran.
alter table public.products add column if not exists is_staple boolean not null default false;

-- Lo que hoy está pendiente en la lista es lo que falta en casa.
update public.products set in_stock = false
where id in (select product_id from public.shopping_items where done = false and product_id is not null);

-- Los productos se sincronizan en tiempo real entre ustedes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end;
$$;

notify pgrst, 'reload schema';
