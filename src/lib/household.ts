import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Household = { id: string; name: string; invite_code: string };

/**
 * Devuelve el usuario y su hogar; redirige a /login o /hogar si falta alguno.
 * Va envuelto en cache(): el layout y la página lo llaman en la misma petición y solo se ejecuta una vez.
 */
export const requireHousehold = cache(async () => {
  const supabase = await createClient();

  // Validación local de la sesión (sin red); ver comentario en src/proxy.ts.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("household_members")
      .select("households(id, name, invite_code)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);

  const household = membership?.households as Household | null | undefined;
  if (!household) redirect("/hogar");

  return { supabase, user: { id: userId }, household, displayName: profile?.display_name ?? "" };
});
