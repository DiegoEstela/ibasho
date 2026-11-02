-- Ibasho · 0032 · Tarjetas de débito: elegir si los gastos entran en las cuentas entre ustedes
-- Se puede ejecutar más de una vez sin errores.

-- true = los gastos pagados con la tarjeta cuentan en el reparto (quién debe a quién).
-- false = aparecen en la lista de gastos y en la tarjeta, pero no suman ni restan deudas.
alter table public.cards
  add column if not exists in_balance boolean not null default true;

notify pgrst, 'reload schema';
