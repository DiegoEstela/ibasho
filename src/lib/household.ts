import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Devuelve el usuario y su hogar; redirige a /login o /hogar si falta alguno. */
export async function requireHousehold() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("household_members")
    .select("households(id, name, invite_code)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const household = membership?.households as
    | { id: string; name: string; invite_code: string }
    | null
    | undefined;
  if (!household) redirect("/hogar");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return { supabase, user, household, displayName: profile?.display_name ?? "" };
}
