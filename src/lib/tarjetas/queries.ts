import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, Installment, Purchase, Share } from "@/app/(app)/gastos/tarjetas/types";
import type { CardExpenseRow, CardExpenseSplit, DepositRow } from "./debit";

export type TarjetasData = {
  cards: Card[];
  purchases: Purchase[];
  shares: Share[];
  installments: Installment[];
  deposits: DepositRow[];
  cardExpenses: CardExpenseRow[];
  splits: CardExpenseSplit[];
};

export const tarjetasKey = (householdId: string) => ["tarjetas", householdId] as const;

/** Pide todo lo que usa la pantalla de Tarjetas. Si algo falla, lanza el error para que React Query lo gestione. */
export async function fetchTarjetas(supabase: SupabaseClient): Promise<TarjetasData> {
  const [c, p, s, i, d, x, sp] = await Promise.all([
    supabase.from("cards").select("*").eq("archived", false).order("created_at"),
    supabase.from("card_purchases").select("*").order("purchase_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("card_purchase_shares").select("purchase_id, user_id, percent").limit(5000),
    supabase.from("card_installments").select("id, purchase_id, number, due_date, amount, manual_paid, expense_id").limit(20000),
    supabase.from("card_deposits").select("*").order("deposit_date", { ascending: false }).limit(2000),
    supabase.from("expenses").select("id, card_id, description, amount, expense_date, paid_by, created_at").not("card_id", "is", null).limit(5000),
    supabase.from("expense_splits").select("expense_id, participant_id, amount").limit(20000),
  ]);
  const failed = [c, p, s, i, d, x, sp].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    cards: (c.data ?? []) as Card[],
    purchases: (p.data ?? []) as Purchase[],
    shares: (s.data ?? []) as Share[],
    installments: (i.data ?? []) as Installment[],
    deposits: (d.data ?? []) as DepositRow[],
    cardExpenses: (x.data ?? []) as CardExpenseRow[],
    splits: (sp.data ?? []) as CardExpenseSplit[],
  };
}

/** Datos de Tarjetas: arrancan con lo que trajo el servidor y se actualizan al abrir la pantalla y tras cada cambio. */
export function useTarjetas(supabase: SupabaseClient, householdId: string, initialData: TarjetasData) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: tarjetasKey(householdId),
    queryFn: () => fetchTarjetas(supabase),
    initialData,
  });

  /** Cambia los datos en pantalla al instante, antes de que responda el servidor. */
  const patch = (change: (data: TarjetasData) => Partial<TarjetasData>) =>
    client.setQueryData<TarjetasData>(tarjetasKey(householdId), (old) => (old ? { ...old, ...change(old) } : old));

  return { ...query, patch };
}
