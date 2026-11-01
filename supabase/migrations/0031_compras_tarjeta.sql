-- Ibasho · 0031 · Compras: con qué tarjeta se pagó al terminar la compra
-- Se puede ejecutar más de una vez sin errores.

-- Nulo = efectivo u otro. Si se borra la tarjeta, la compra se queda sin ella.
alter table public.shopping_purchases
  add column if not exists card_id uuid references public.cards (id) on delete set null;

notify pgrst, 'reload schema';
