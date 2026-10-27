import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Fixed, FixedEntry } from "./schedule";

export type FijosData = { fixeds: Fixed[]; entries: FixedEntry[] };

export const fijosKey = (householdId: string) => ["fijos", householdId] as const;

/** Pide los gastos fijos y lo que costó cada mes. Si algo falla, lanza el error para que React Query lo gestione. */
export async function fetchFijos(supabase: SupabaseClient): Promise<FijosData> {
  const [f, e] = await Promise.all([
    supabase.from("fixed_expenses").select("*").eq("archived", false).order("created_at").limit(500),
    supabase.from("fixed_expense_entries").select("id, fixed_id, month, amount, expense_id, file_path, file_name").order("month", { ascending: false }).limit(5000),
  ]);
  const failed = [f, e].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return { fixeds: (f.data ?? []) as Fixed[], entries: (e.data ?? []) as FixedEntry[] };
}

/** Datos de Fijos: arrancan con lo que trajo el servidor y se actualizan tras cada cambio. */
export function useFijos(supabase: SupabaseClient, householdId: string, initialData: FijosData) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: fijosKey(householdId), queryFn: () => fetchFijos(supabase), initialData });

  /** Cambia los datos en pantalla al instante, antes de que responda el servidor. */
  const patch = (change: (data: FijosData) => Partial<FijosData>) =>
    client.setQueryData<FijosData>(fijosKey(householdId), (old) => (old ? { ...old, ...change(old) } : old));

  return { ...query, patch };
}
