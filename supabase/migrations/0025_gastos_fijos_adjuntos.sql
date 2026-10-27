-- Ibasho · 0025 · Factura (PDF o foto) adjunta a cada mes de un gasto fijo
-- Se puede ejecutar más de una vez sin errores.

-- El archivo vive en el bucket privado «trip-files» (carpeta del hogar); aquí solo se guarda su ruta.
alter table public.fixed_expense_entries add column if not exists file_path text;
alter table public.fixed_expense_entries add column if not exists file_name text;

notify pgrst, 'reload schema';
