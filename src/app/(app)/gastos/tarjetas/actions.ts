"use server";

import { revalidatePath } from "next/cache";
import { ensureGroupId, syncParticipants } from "@/lib/gastos/setup";
import { splitByPercent, toCents } from "@/lib/gastos/money";
import { financedCents } from "@/lib/tarjetas/installments";
import { requireHousehold } from "@/lib/household";

type Result = { ok: true } | { ok: false; message: string };

/** Crea en Gastos compartidos el gasto de una compra con tarjeta, repartido según sus porcentajes. */
export async function sendPurchaseToExpenses(purchaseId: string): Promise<Result> {
  const { supabase, user, household } = await requireHousehold();

  const { data: purchase } = await supabase
    .from("card_purchases")
    .select("id, description, purchase_date, total_amount, interest_percent, expense_id, cards(owner_user_id)")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase) return { ok: false, message: "No encontramos esa compra." };
  if (purchase.expense_id) return { ok: false, message: "Esta compra ya está en Gastos compartidos." };

  const [{ data: shares }, { data: members }, { data: profiles }, { data: group }] = await Promise.all([
    supabase.from("card_purchase_shares").select("user_id, percent").eq("purchase_id", purchaseId),
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

  const participantOf = (userId: string) => synced.participants.find((p) => p.user_id === userId);

  // Quien pagó es el titular de la tarjeta; si no hay titular, quien está registrando la compra.
  const ownerId = (purchase.cards as unknown as { owner_user_id: string | null } | null)?.owner_user_id ?? user.id;
  const payer = participantOf(ownerId) ?? participantOf(user.id);
  if (!payer) return { ok: false, message: "No se encontró a quien pagó la compra." };

  const percents: Record<string, number> = {};
  for (const s of shares ?? []) {
    const participant = participantOf(s.user_id);
    if (participant && Number(s.percent) > 0) percents[participant.id] = Number(s.percent);
  }
  if (Object.keys(percents).length === 0) return { ok: false, message: "La compra no tiene reparto." };

  const totalCents = financedCents(toCents(Number(purchase.total_amount)), Number(purchase.interest_percent));
  const parts = splitByPercent(totalCents, percents);

  const { data: expenseId, error } = await supabase.rpc("save_expense", {
    p_id: null,
    p_group: ensured.groupId,
    p_description: `${purchase.description} (tarjeta)`,
    p_amount: totalCents / 100,
    p_date: purchase.purchase_date,
    p_category: "Otros",
    p_paid_by: payer.id,
    p_splits: Object.entries(parts).map(([participant_id, cents]) => ({ participant_id, amount: cents / 100 })),
  });
  if (error || !expenseId) return { ok: false, message: "No se pudo crear el gasto. Inténtalo de nuevo." };

  const { error: linkError } = await supabase.from("card_purchases").update({ expense_id: expenseId }).eq("id", purchaseId);
  if (linkError) return { ok: false, message: "El gasto se creó, pero no se pudo enlazar con la compra." };

  revalidatePath("/gastos");
  return { ok: true };
}
