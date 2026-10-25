"use server";

import { revalidatePath } from "next/cache";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { ensureGroupId, syncParticipants } from "@/lib/gastos/setup";
import { formatEUR, splitByPercent, toCents } from "@/lib/gastos/money";
import { financedCents } from "@/lib/tarjetas/installments";
import { cardLabel } from "@/lib/tarjetas/labels";
import { requireHousehold } from "@/lib/household";

type Result = { ok: true } | { ok: false; message: string };

type PurchaseCard = { name: string; last4: string | null; owner_user_id: string | null };

/**
 * Crea en Gastos compartidos el gasto de una compra con tarjeta, con todos sus datos:
 * concepto (y comercio), importe total con interés, fecha, tarjeta, quién pagó y el reparto de la compra.
 */
export async function sendPurchaseToExpenses(purchaseId: string, category: string): Promise<Result> {
  const { supabase, user, household } = await requireHousehold();
  const chosenCategory = EXPENSE_CATEGORIES.some((c) => c.name === category) ? category : "Otros";

  const { data: purchase } = await supabase
    .from("card_purchases")
    .select("id, card_id, description, merchant, purchase_date, total_amount, interest_percent, installments_count, expense_id, cards(name, last4, owner_user_id)")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase) return { ok: false, message: "No encontramos esa compra." };
  if (purchase.expense_id) return { ok: false, message: "Esta compra ya está en Gastos compartidos." };

  const [{ data: shares }, { data: members }, { data: profiles }, { data: group }, { data: firstInstallment }] = await Promise.all([
    supabase.from("card_purchase_shares").select("user_id, percent").eq("purchase_id", purchaseId),
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
    supabase.from("expense_groups").select("id").eq("kind", "household").maybeSingle(),
    supabase.from("card_installments").select("amount").eq("purchase_id", purchaseId).eq("number", 1).maybeSingle(),
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

  // Quien pagó es el titular de la tarjeta. Si la tarjeta es compartida no hay un pagador: sale del dinero de los dos.
  const card = purchase.cards as unknown as PurchaseCard | null;
  const ownerId = card?.owner_user_id ?? null;
  const payer = ownerId ? (participantOf(ownerId) ?? participantOf(user.id)) : null;
  if (ownerId && !payer) return { ok: false, message: "No se encontró a quien pagó la compra." };

  const percents: Record<string, number> = {};
  for (const s of shares ?? []) {
    const participant = participantOf(s.user_id);
    if (participant && Number(s.percent) > 0) percents[participant.id] = Number(s.percent);
  }
  if (Object.keys(percents).length === 0) return { ok: false, message: "La compra no tiene reparto." };

  const totalCents = financedCents(toCents(Number(purchase.total_amount)), Number(purchase.interest_percent));
  const parts = splitByPercent(totalCents, percents);

  // El comercio va en el concepto; las cuotas, el interés y la tarjeta quedan en las notas.
  const count = Number(purchase.installments_count);
  const interest = Number(purchase.interest_percent);
  const notes = [
    `Compra con tarjeta${card ? ` ${cardLabel(card)}` : ""}.`,
    count === 1
      ? "Pago único."
      : `${count} cuotas${firstInstallment ? ` de ${formatEUR(toCents(Number(firstInstallment.amount)))}` : ""}.`,
    interest > 0 ? `Total con ${String(interest).replace(".", ",")} % de interés: ${formatEUR(totalCents)}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const { data: expenseId, error } = await supabase.rpc("save_expense", {
    p_id: null,
    p_group: ensured.groupId,
    p_description: purchase.merchant ? `${purchase.description} · ${purchase.merchant}` : purchase.description,
    p_amount: totalCents / 100,
    p_date: purchase.purchase_date,
    p_category: chosenCategory,
    p_paid_by: payer?.id ?? null,
    p_card: purchase.card_id,
    p_splits: Object.entries(parts).map(([participant_id, cents]) => ({ participant_id, amount: cents / 100 })),
  });
  if (error || !expenseId) return { ok: false, message: "No se pudo crear el gasto. Inténtalo de nuevo." };

  await supabase.from("expenses").update({ notes }).eq("id", expenseId);

  const { error: linkError } = await supabase.from("card_purchases").update({ expense_id: expenseId }).eq("id", purchaseId);
  if (linkError) {
    // Sin el enlace, un reintento duplicaría el gasto: se deshace para dejarlo como estaba.
    await supabase.from("expenses").delete().eq("id", expenseId);
    return { ok: false, message: "No se pudo completar el envío. Inténtalo de nuevo." };
  }

  revalidatePath("/gastos");
  return { ok: true };
}
