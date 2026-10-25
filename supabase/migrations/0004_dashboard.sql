-- Ibasho · 0004 · Widgets del resumen de Inicio (por persona)

alter table public.profiles
  add column dashboard_widgets text[] not null
  default array['compras', 'cocina', 'gastos', 'viajes'];
