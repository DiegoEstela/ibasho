-- Ibasho · 0027 · «Voy a comprar»: apartar productos de la lista para la salida al súper
-- Se puede ejecutar más de una vez sin errores.

-- true = el producto va en la lista corta del próximo súper. Solo se usa con productos pendientes.
alter table public.shopping_items
  add column if not exists en_salida boolean not null default false;

create index if not exists shopping_items_salida_idx
  on public.shopping_items (household_id)
  where en_salida and not done;

notify pgrst, 'reload schema';
