import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense, Settlement, Split } from "@/app/(app)/gastos/types";
import type { Card } from "@/app/(app)/gastos/tarjetas/types";
import type { DepositRow } from "@/lib/tarjetas/debit";

export type GastosData = {
  expenses: Expense[];
  splits: Split[];
  settlements: Settlement[];
  cards: Card[];
  deposits: DepositRow[];
};

export const gastosKey = (groupId: string) => ["gastos", groupId] as const;

/** Pide todo lo que usa la pantalla de Gastos. Si algo falla, lanza el error para que React Query lo gestione. */
export async function fetchGastos(supabase: SupabaseClient, groupId: string): Promise<GastosData> {
  const [e, s, st, c, d] = await Promise.all([
    supabase.from("expenses").select("*").eq("group_id", groupId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("expense_splits").select("expense_id, participant_id, amount, expenses!inner(group_id)").eq("expenses.group_id", groupId).limit(10000),
    supabase.from("settlements").select("*").eq("group_id", groupId).order("settled_on", { ascending: false }).limit(500),
    supabase.from("cards").select("*").eq("archived", false).order("created_at"),
    supabase.from("card_deposits").select("*").order("deposit_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
  ]);
  const failed = [e, s, st, c, d].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    expenses: (e.data ?? []) as Expense[],
    splits: ((s.data ?? []) as unknown as Split[]).map(({ expense_id, participant_id, amount }) => ({ expense_id, participant_id, amount })),
    settlements: (st.data ?? []) as Settlement[],
    cards: (c.data ?? []) as Card[],
    deposits: (d.data ?? []) as DepositRow[],
  };
}

/** Datos de Gastos: arrancan con lo que trajo el servidor y se actualizan al abrir la pantalla y tras cada cambio. */
export function useGastos(supabase: SupabaseClient, groupId: string, initialData: GastosData) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: gastosKey(groupId),
    queryFn: () => fetchGastos(supabase, groupId),
    initialData,
  });

  /** Cambia los datos en pantalla al instante, antes de que responda el servidor. */
  const patch = (change: (data: GastosData) => Partial<GastosData>) =>
    client.setQueryData<GastosData>(gastosKey(groupId), (old) => (old ? { ...old, ...change(old) } : old));

  return { ...query, data: query.data, patch };
}
