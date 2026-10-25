import type { SupabaseClient } from "@supabase/supabase-js";

export type ParticipantRow = { id: string; user_id: string | null; name: string; color: string };
export type SetupFailure = { error: { step: string; detail: string } };

const PALETTE = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f"];
const fmt = (e: { code?: string; message: string }) => `${e.code ?? "error"}: ${e.message}`;

/** Devuelve el grupo de gastos del hogar, creándolo la primera vez. */
export async function ensureGroupId(
  supabase: SupabaseClient,
  householdId: string,
  existing?: string | null,
): Promise<{ groupId: string } | SetupFailure> {
  if (existing) return { groupId: existing };

  const { data, error } = await supabase
    .from("expense_groups")
    .insert({ household_id: householdId, kind: "household", name: "Hogar" })
    .select("id")
    .single();
  if (!error && data) return { groupId: data.id as string };

  // Si dos personas entran a la vez, la otra ya lo habrá creado: se vuelve a buscar.
  const { data: again } = await supabase.from("expense_groups").select("id").eq("kind", "household").maybeSingle();
  if (again) return { groupId: again.id as string };
  return { error: { step: "crear el grupo de gastos", detail: fmt(error ?? { message: "sin datos" }) } };
}

/** Garantiza que cada miembro del hogar sea participante del grupo (por ejemplo, quien acaba de unirse). */
export async function syncParticipants(
  supabase: SupabaseClient,
  args: {
    householdId: string;
    groupId: string;
    userId: string;
    email: string;
    members: { user_id: string }[];
    profiles: { id: string; display_name: string | null; color: string | null }[];
  },
): Promise<{ participants: ParticipantRow[] } | SetupFailure> {
  const { householdId, groupId, userId, email, members, profiles } = args;
  const load = () =>
    supabase.from("expense_participants").select("id, user_id, name, color").eq("group_id", groupId).order("created_at");

  let result = await load();
  if (result.error) return { error: { step: "leer los participantes", detail: fmt(result.error) } };

  const known = new Set((result.data ?? []).map((p) => p.user_id));
  const missing = members.filter((m) => !known.has(m.user_id));
  if (missing.length > 0) {
    const rows = missing.map((m, i) => {
      const profile = profiles.find((p) => p.id === m.user_id);
      const fallback = m.user_id === userId ? email.split("@")[0] : "";
      return {
        household_id: householdId,
        group_id: groupId,
        user_id: m.user_id,
        name: profile?.display_name || fallback || "Alguien",
        color: profile?.color || PALETTE[(known.size + i) % PALETTE.length],
      };
    });
    const { error } = await supabase
      .from("expense_participants")
      .upsert(rows, { onConflict: "group_id,user_id", ignoreDuplicates: true });
    if (error) return { error: { step: "añadir a los participantes", detail: fmt(error) } };

    result = await load();
    if (result.error) return { error: { step: "leer los participantes", detail: fmt(result.error) } };
  }

  return { participants: (result.data ?? []) as ParticipantRow[] };
}
