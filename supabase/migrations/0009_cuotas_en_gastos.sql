-- Ibasho · 0009 · Cada cuota de una compra con tarjeta puede registrarse como un gasto compartido
-- Se puede ejecutar más de una vez sin errores.

-- Gasto compartido que se creó a partir de esta cuota (nulo = aún no se envió).
-- Si el gasto se elimina desde Gastos, la cuota vuelve a quedar disponible.
alter table public.card_installments
  add column if not exists expense_id uuid references public.expenses (id) on delete set null;

create index if not exists card_installments_expense_idx on public.card_installments (expense_id);

notify pgrst, 'reload schema';
