-- Ibasho · 0021 · Compras: «Casa» reemplaza a «De siempre»
-- Se puede ejecutar más de una vez sin errores.

-- Ya no hay productos «de siempre».
alter table public.products drop column if exists is_staple;

-- Un producto nuevo solo se conoce: no está en casa hasta que se compra o se marca.
alter table public.products alter column in_stock set default false;

-- Punto de partida: en casa está lo comprado en los últimos 14 días y que no vuelve a estar pendiente.
update public.products p set in_stock = (
  exists (
    select 1 from public.shopping_items i
    where i.product_id = p.id and i.done and i.done_at > now() - interval '14 days'
  )
  and not exists (
    select 1 from public.shopping_items i where i.product_id = p.id and not i.done
  )
);

notify pgrst, 'reload schema';
