"use server";

import { revalidatePath } from "next/cache";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { ensureGroupId, syncParticipants } from "@/lib/gastos/setup";
import { splitEqual, toCents } from "@/lib/gastos/money";
import { requireHousehold } from "@/lib/household";

type Result = { ok: true } | { ok: false; message: string };

/**
 * Pasa a Gastos compartidos lo que costó un gasto fijo en un mes: lo registra con quién pagó,
 * lo divide a partes iguales y deja guardado el importe de ese mes como referencia para el siguiente.
 */
export async function sendFixedToExpenses(fixedId: string, month: string, amount: number, date: string): Promise<Result> {
  const { supabase, user, household } = await requireHousehold();
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "La fecha no es válida." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Escribe un importe mayor que cero." };

  const { data: fixed } = await supabase
    .from("fixed_expenses")
    .select("id, name, category, paid_by, card_id, cards(owner_user_id)")
    .eq("id", fixedId)
    .maybeSingle();
  if (!fixed) return { ok: false, message: "No encontramos ese gasto fijo." };

  const monthDate = `${month}-01`;
  const { data: entry } = await supabase.from("fixed_expense_entries").select("id, expense_id").eq("fixed_id", fixedId).eq("month", monthDate).maybeSingle();
  if (entry?.expense_id) return { ok: false, message: "Este mes ya está en Gastos compartidos." };

  const [{ data: members }, { data: profiles }, { data: group }] = await Promise.all([
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
    supabase.from("expense_groups").select("id").eq("kind", "household").maybeSingle(),
  ]);
  if ((members?.length ?? 0) < 2) return { ok: false, message: "Los gastos compartidos necesitan a tu pareja dentro del hogar." };

  const ensured = await ensureGroupId(supabase, household.id, group?.id as string | undefined);
  if ("error" in ensured) return { ok: false, message: `No se pudo preparar Gastos (${ensured.error.step}).` };
  const synced = await syncParticipants(supabase, {
    householdId: household.id,
    groupId: ensured.groupId,
    userId: user.id,
    email: user.email,
    members: members ?? [],
    profiles: profiles ?? [],
  });
  if ("error" in synced) return { ok: false, message: `No se pudo preparar Gastos (${synced.error.step}).` };

  // Paga quien se indicó; con una tarjeta, su titular; con una tarjeta compartida, nadie en particular.
  const card = fixed.cards as unknown as { owner_user_id: string | null } | null;
  const sharedCard = !!fixed.card_id && !!card && card.owner_user_id === null;
  const payerUser = sharedCard ? null : (card?.owner_user_id ?? fixed.paid_by ?? user.id);
  const payer = payerUser ? synced.participants.find((p) => p.user_id === payerUser) : undefined;
  if (payerUser && !payer) return { ok: false, message: "No se encontró a quien paga este gasto." };

  const cents = toCents(amount);
  const parts = splitEqual(cents, synced.participants.map((p) => p.id));
  const category = EXPENSE_CATEGORIES.some((c) => c.name === fixed.category) ? fixed.category : "Facturas";

  const { data: expenseId, error } = await supabase.rpc("save_expense", {
    p_id: null,
    p_group: ensured.groupId,
    p_description: fixed.name,
    p_amount: cents / 100,
    p_date: date,
    p_category: category,
    p_paid_by: payer?.id ?? null,
    p_card: fixed.card_id,
    p_splits: Object.entries(parts).map(([participant_id, c]) => ({ participant_id, amount: c / 100 })),
  });
  if (error || !expenseId) return { ok: false, message: "No se pudo crear el gasto. Inténtalo de nuevo." };

  const { error: linkError } = await supabase
    .from("fixed_expense_entries")
    .upsert({ household_id: household.id, fixed_id: fixedId, month: monthDate, amount: cents / 100, expense_id: expenseId }, { onConflict: "fixed_id,month" });
  if (linkError) {
    // Sin el enlace, un reintento duplicaría el gasto: se deshace para dejarlo como estaba.
    await supabase.from("expenses").delete().eq("id", expenseId);
    return { ok: false, message: "No se pudo completar el envío. Inténtalo de nuevo." };
  }

  revalidatePath("/gastos");
  return { ok: true };
}
