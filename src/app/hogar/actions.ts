"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/hogar?error=${encodeURIComponent(message)}`);
}

export async function createHousehold(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) fail("Ponle un nombre a tu hogar.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { p_name: name });
  if (error) fail("No pudimos crear el hogar. Inténtalo de nuevo.");

  redirect("/hogar/listo");
}

export async function joinHousehold(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) fail("Escribe el código de invitación.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_household", { p_code: code });
  if (error) fail("Ese código no es válido. Revisa que esté bien escrito.");

  redirect("/bienvenida");
}
