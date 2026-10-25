import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

/** Una instancia por petición: así el proxy, el layout y la página comparten la misma sesión. */
export const createClient = cache(async () => {
  // La sesión depende de cada petición: se marca la ruta como dinámica antes de leerla.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
          }
        },
      },
    },
  );
});
