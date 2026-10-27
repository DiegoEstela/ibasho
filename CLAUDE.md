# Ibasho (居場所)

App web progresiva (PWA) para que **una pareja gestione su hogar**: compras, recetas, gastos, viajes, deseos, notas, tareas y notitas. La usan 2 personas desde el móvil (y a veces en escritorio), en España: **español, EUR, fechas dd/mm/aaaa**. Todo el texto visible va en español, con tono cercano ("tú", "tu pareja").

El prompt original del proyecto está en `documents/mainPromt.md` (visión y fases). El código ya va bastante más allá de la fase 1: **el estado real es el código y `git log`**, no el prompt.

> `AGENTS.md` avisa de que este Next.js (16) tiene cambios respecto a lo que conoces. Antes de usar una API de Next que no hayas visto en el repo, lee la guía en `node_modules/next/dist/docs/`.

## Stack

- Next.js 16 (App Router, `src/proxy.ts` hace de middleware) · React 19 · TypeScript · Tailwind CSS 4
- Supabase: Auth, Postgres con RLS, Storage, Realtime
- TanStack Query para los datos de cada pantalla · `lucide-react` para iconos · `web-push` para avisos
- Hosting: Vercel. Variables en `.env.example`.

## Comandos

```bash
npm run dev      # desarrollo (puerto 3000)
npx tsc --noEmit # tipos
npm run lint     # eslint
npm run build    # compilación completa
```

No hay tests automáticos: **antes de dar algo por terminado, pasa `tsc`, `lint` y, si tocaste rutas o servidor, `build`**. Para ver cambios visuales, abre la pantalla en el navegador (móvil y escritorio).

## Estructura

```
src/app/(app)/<modulo>/   Pantallas privadas (requieren sesión y hogar)
  page.tsx                Servidor: carga los datos con Supabase
  <Modulo>View.tsx        Cliente: la pantalla interactiva
  *Sheet.tsx              Formularios en hoja inferior (BottomSheet)
  actions.ts              Server actions ("use server")
src/app/{login,hogar,bienvenida,...}   Pantallas públicas / de entrada
src/components/           ui/ (PageHeader, BottomSheet…), nav/, brand/, query/, profile/…
src/lib/<modulo>/         Lógica pura y consultas de cada módulo (sin JSX)
src/lib/supabase/         client.ts (navegador) y server.ts
supabase/migrations/      0001…00NN, una por cambio de base de datos
```

Módulos: inicio, compras, cocina (recetas), gastos (**compartidos · tarjetas · fijos**), notitas, viajes, wishlist, notas, tareas, baúl, mis-cuentas (finanzas personales, solo visibles para cada persona). La navegación está en `src/components/nav/items.ts`.

## Cómo se hace una pantalla (el patrón del proyecto)

1. **`page.tsx`** (servidor): `requireHousehold()` (`src/lib/household.ts`) + consultas con `createClient()` de servidor dentro de `<Suspense fallback={<PageSkeleton />}>`. Si algo falla, muestra un `Unavailable` con el paso y el error (ver `gastos/fijos/page.tsx`).
2. **`View`** (cliente): recibe `initial*` por props y los pasa a un hook de React Query (`useTarjetas`, `useFijos`…) en `src/lib/<modulo>/queries.ts`. El hook devuelve `{ data, patch, isError, isFetching }`.
3. **Escrituras**: `useMutation` + `patch(...)` para actualizar la pantalla al instante; si falla, se vuelve a pedir (`refetch`). `meta: { errorMessage }` muestra el aviso de error; `meta: { silent: true }` si el formulario ya lo muestra.
4. **Tiempo real**: canal de Supabase por tabla con `filter: household_id=eq.…` que invalida la query (con un pequeño retraso).
5. **Acciones entre módulos** ("pasar a gastos"): server action que crea el gasto con la función SQL `save_expense` y enlaza el origen (ver `gastos/tarjetas/actions.ts` y `gastos/fijos/actions.ts`). Si el enlace falla, se deshace el gasto para no duplicar.

## Reglas de código

- **Dinero en céntimos** (enteros) para calcular; `formatEUR`, `parseAmount`, `toCents` en `src/lib/gastos/money.ts`. Nunca sumar decimales.
- **Fechas como texto** `"aaaa-mm-dd"` y meses `"aaaa-mm"`; evita `new Date()` para lógica (zonas horarias). Hoy en España: zona `Europe/Madrid`.
- Lógica de cálculo en `src/lib/<modulo>/*.ts`, sin React, fácil de leer. Comentarios en español, breves, explicando el *porqué*.
- Imita el código de al lado: nombres, densidad de comentarios, clases de Tailwind.
- No inventes componentes si ya existe uno (`PageHeader`, `BottomSheet`, `CatIcon`, `QueryErrorBanner`, `GastosTabs`).
- Archivos (facturas, billetes…) van a Supabase Storage (bucket privado `trip-files`, carpeta = id del hogar); en la tabla solo se guarda la ruta. Las fotos se reducen antes de subir (`src/lib/fijos/files.ts`).

## Base de datos

- Cada cambio = **una migración nueva** `supabase/migrations/00NN_nombre.sql`, numerada siguiendo la última. **Idempotente** (`if not exists`, `drop policy if exists`…) y termina con `notify pgrst, 'reload schema';`.
- Toda tabla lleva `household_id`, RLS con `public.is_household_member(household_id)` y, si hace falta tiempo real, se añade a la publicación `supabase_realtime`.
- Las migraciones **no se ejecutan solas**: la persona las pega en Supabase. Al terminar una tarea con migración, **dile cuál ejecutar** (y que las pantallas fallan con aviso hasta entonces).
- Lo personal (`personal_*`, Mis cuentas) usa `user_id = auth.uid()`: ni la pareja lo ve.

## Diseño

- **Mobile-first** (375–430 px); en escritorio (`lg:` ≥ 1024) hay barra lateral y más espacio. Revisa **siempre las dos vistas**.
- Estética cálida tipo papel washi + toques japoneses; modo oscuro automático (`prefers-color-scheme`). Usa los tokens de `globals.css` (`bg-surface`, `text-ink`, `text-ink-soft`, `border-line`, `forest`, `moss`, `sky`, `terracotta`, `sakura`, `hanko`), no colores sueltos.
- Táctil: elementos pulsables de **al menos ~40–44 px**; en móvil, las pantallas deben ser compactas (la persona se queja si algo ocupa mucho).
- Filas de etiquetas con scroll horizontal: clase `chip-row` (sin barra de scroll, con difuminado). Carruseles: `no-scrollbar`.
- Fuente de títulos: `font-display`. Iconos lineales de `lucide-react`.
- Autoría: el logo de Delo IA Studio (`src/components/brand/DeloLogo.tsx`) enlaza a `https://diego-estela-lopez.vercel.app/`.

## Cómo trabajamos

- La persona describe cambios en lenguaje natural, a menudo ajustes de diseño pequeños. **Haz lo pedido, sin ampliar el alcance**; si algo es ambiguo y barato de decidir, elige y dilo.
- Si un cambio es visual, verifícalo con una captura (Chrome headless contra `localhost:3000`) cuando puedas, en vez de suponer. Borra cualquier página de prueba que crees.
- **Commits y `git push` solo cuando la persona lo pida.** Mensaje en español, resumiendo lo hecho. Rama: `main`.
- Al terminar: explica en pocas líneas **qué cambió, cómo probarlo y qué debe hacer ella** (migraciones, variables de entorno). Di con claridad lo que no pudiste probar.
- No subas secretos: `.env*` está ignorado; `SUPABASE_SERVICE_ROLE_KEY` y `VAPID_PRIVATE_KEY` solo en servidor.

## Pendiente / ideas

- "Pasar a gastos" desde más módulos (Wishlist al marcar comprado, tickets de compras).
- Lectura de tickets con IA y estadísticas de compras; bot de Telegram (ver `documents/mainPromt.md`).
- Modo offline y pulido de PWA.
