import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { personCents } from "@/lib/tarjetas/summary";
import type { CardRef, InstallmentRow, MisCuentasData, PersonalEntry, Plan, SharedRow } from "./types";

export const misCuentasKey = (userId: string) => ["mis-cuentas", userId] as const;

type SplitJoin = {
  amount: number;
  expenses: { id: string; description: string; amount: number; expense_date: string; category: string; card_id: string | null; paid_by: string | null };
};

/**
 * Todo lo tuyo: tu plan, tus movimientos propios, tu parte de los gastos compartidos y tus cuotas.
 * Con `from` ("aaaa-mm-dd") solo trae lo posterior a esa fecha (para el resumen de Inicio).
 */
export async function fetchMisCuentas(supabase: SupabaseClient, userId: string, from?: string): Promise<MisCuentasData> {
  const gte = <T extends { gte: (column: string, value: string) => T }>(query: T, column: string) => (from ? query.gte(column, from) : query);

  const [plan, entries, people, cards, shareRows, purchases, installments] = await Promise.all([
    supabase.from("personal_plans").select("monthly_income, pay_day, savings_amount, savings_updated_at, account_amount, account_updated_at, monthly_saving_goal, saving_target").eq("user_id", userId).maybeSingle(),
    gte(supabase.from("personal_entries").select("id, kind, description, amount, entry_date, category, card_id, created_at").order("entry_date", { ascending: false }).limit(5000), "entry_date"),
    supabase.from("expense_participants").select("id, user_id, name").limit(500),
    supabase.from("cards").select("id, name, last4, kind, color").limit(200),
    supabase.from("card_purchase_shares").select("purchase_id, user_id, percent").limit(5000),
    supabase.from("card_purchases").select("id, description, card_id, installments_count").limit(2000),
    gte(supabase.from("card_installments").select("id, purchase_id, number, due_date, amount, expense_id").is("expense_id", null).limit(20000), "due_date"),
  ]);

  const failed = [plan, entries, people, cards, shareRows, purchases, installments].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const participants = (people.data ?? []) as { id: string; user_id: string | null; name: string }[];
  const myIds = participants.filter((p) => p.user_id === userId).map((p) => p.id);
  const nameOf = new Map(participants.map((p) => [p.id, p.name]));

  // Tu parte de cada gasto compartido (los que pagaste y los que pagó otra persona).
  let shared: SharedRow[] = [];
  if (myIds.length > 0) {
    let query = supabase
      .from("expense_splits")
      .select("amount, expenses!inner(id, description, amount, expense_date, category, card_id, paid_by)")
      .in("participant_id", myIds)
      .limit(10000);
    if (from) query = query.gte("expenses.expense_date", from);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    shared = ((data ?? []) as unknown as SplitJoin[])
      .filter((r) => Number(r.amount) > 0)
      .map((r) => ({
        id: r.expenses.id,
        description: r.expenses.description,
        amount: Number(r.amount),
        total: Number(r.expenses.amount),
        date: r.expenses.expense_date,
        category: r.expenses.category,
        card_id: r.expenses.card_id,
        paid_by_name: r.expenses.paid_by ? (nameOf.get(r.expenses.paid_by) ?? null) : null,
        paid_by_me: !!r.expenses.paid_by && myIds.includes(r.expenses.paid_by),
      }));
  }

  // Tus cuotas: la parte que te toca de cada compra con tarjeta.
  // Reparto completo de cada compra: así tu parte se calcula igual que en Tarjetas.
  const percentsOf = new Map<string, Record<string, number>>();
  for (const s of shareRows.data ?? []) {
    const id = s.purchase_id as string;
    percentsOf.set(id, { ...(percentsOf.get(id) ?? {}), [s.user_id as string]: Number(s.percent) });
  }
  const purchaseOf = new Map((purchases.data ?? []).map((p) => [p.id as string, p as { id: string; description: string; card_id: string; installments_count: number }]));
  const mine: InstallmentRow[] = [];
  for (const i of installments.data ?? []) {
    const purchase = purchaseOf.get(i.purchase_id as string);
    const percents = percentsOf.get(i.purchase_id as string);
    if (!purchase || !percents || !percents[userId]) continue;
    const cents = personCents(Math.round(Number(i.amount) * 100), percents, userId);
    if (cents <= 0) continue;
    mine.push({
      id: i.id as string,
      description: purchase.description,
      card_id: purchase.card_id,
      number: i.number as number,
      count: purchase.installments_count,
      due_date: i.due_date as string,
      amount: cents / 100,
    });
  }

  return {
    plan: plan.data ? ({ ...plan.data, monthly_income: Number(plan.data.monthly_income), savings_amount: Number(plan.data.savings_amount), account_amount: plan.data.account_amount == null ? null : Number(plan.data.account_amount), monthly_saving_goal: Number(plan.data.monthly_saving_goal), saving_target: Number(plan.data.saving_target) } as Plan) : null,
    entries: ((entries.data ?? []) as PersonalEntry[]).map((e) => ({ ...e, amount: Number(e.amount) })),
    shared,
    installments: mine,
    cards: (cards.data ?? []) as CardRef[],
  };
}

/** Tus cuentas: arrancan con lo que trajo el servidor y se actualizan al abrir la pantalla y tras cada cambio. */
export function useMisCuentas(supabase: SupabaseClient, userId: string, initialData: MisCuentasData) {
  return useQuery({
    queryKey: misCuentasKey(userId),
    queryFn: () => fetchMisCuentas(supabase, userId),
    initialData,
  });
}
