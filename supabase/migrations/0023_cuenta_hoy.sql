-- Ibasho · 0023 · Mis cuentas: cuánto hay hoy en la cuenta
-- Se puede ejecutar más de una vez sin errores.

-- Lo que había en la cuenta en el momento de account_updated_at; tus gastos, ingresos y ahorros posteriores se restan o suman solos.
-- Nulo = todavía no lo indicaste.
alter table public.personal_plans add column if not exists account_amount numeric(12, 2);
alter table public.personal_plans add column if not exists account_updated_at timestamptz;

notify pgrst, 'reload schema';
