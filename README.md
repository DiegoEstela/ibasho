# Ibasho · 居場所

App web progresiva para gestionar la vida en pareja en el hogar: compras, recetas, gastos (compartidos, tarjetas y fijos), viajes, wishlist, notas, tareas y notitas. Next.js + Supabase, pensada para el móvil.

## Puesta en marcha

1. `npm install`
2. Copia `.env.example` a `.env.local` y rellénalo (Supabase y claves de avisos push).
3. En Supabase, ejecuta en orden los archivos de `supabase/migrations/` (cada uno se puede repetir sin problema).
4. `npm run dev` y abre <http://localhost:3000>.

## Despliegue

Vercel, con las mismas variables de entorno. Los avisos programados usan `supabase/push_cron.sql` y `CRON_SECRET`.

## Para quien desarrolle (o para un agente)

Lee [`CLAUDE.md`](./CLAUDE.md): estructura, patrón de cada pantalla, reglas de código, diseño y forma de trabajar.
