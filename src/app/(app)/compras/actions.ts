"use server";

import { revalidatePath } from "next/cache";
import { ensureGroupId, syncParticipants } from "@/lib/gastos/setup";
import { splitEqual, toCents } from "@/lib/gastos/money";
import { requireHousehold } from "@/lib/household";

type Result = { ok: true } | { ok: false; message: string };

/**
 * Pasa una compra terminada a Gastos compartidos: un solo gasto «Supermercado» con el total,
 * repartido a partes iguales. `cardId` es con qué se pagó (nulo = efectivo u otro) y `paidByUserId` quién puso el dinero.
 */
export async function sendShoppingPurchaseToExpenses(purchaseId: string, cardId: string | null, paidByUserId: string): Promise<Result> {
  const { supabase, user, household } = await requireHousehold();

  const { data: purchase } = await supabase
    .from("shopping_purchases")
    .select("id, purchased_on, store, total_amount, expense_id")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase) return { ok: false, message: "No encontramos esa compra." };
  if (purchase.expense_id) return { ok: false, message: "Esta compra ya está en Gastos compartidos." };

  const [{ data: members }, { data: profiles }, { data: group }, { data: card }] = await Promise.all([
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
    supabase.from("expense_groups").select("id").eq("kind", "household").maybeSingle(),
    cardId ? supabase.from("cards").select("id").eq("id", cardId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (cardId && !card) return { ok: false, message: "No encontramos esa tarjeta." };
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

  const payer = synced.participants.find((p) => p.user_id === paidByUserId);
  if (!payer) return { ok: false, message: "No se encontró a quien pagó la compra." };

  const cents = toCents(Number(purchase.total_amount));
  const parts = splitEqual(
    cents,
    synced.participants.map((p) => p.id),
  );

  const { data: expenseId, error } = await supabase.rpc("save_expense", {
    p_id: null,
    p_group: ensured.groupId,
    p_description: purchase.store ? `Compra · ${purchase.store}` : "Compra del súper",
    p_amount: cents / 100,
    p_date: purchase.purchased_on,
    p_category: "Supermercado",
    p_paid_by: payer.id,
    p_card: cardId,
    p_splits: Object.entries(parts).map(([participant_id, c]) => ({ participant_id, amount: c / 100 })),
  });
  if (error || !expenseId) return { ok: false, message: "No se pudo crear el gasto. Inténtalo de nuevo." };

  const { error: linkError } = await supabase.from("shopping_purchases").update({ expense_id: expenseId }).eq("id", purchaseId);
  if (linkError) {
    // Sin el enlace, un reintento duplicaría el gasto: se deshace.
    await supabase.from("expenses").delete().eq("id", expenseId);
    return { ok: false, message: "No se pudo completar el envío. Inténtalo de nuevo." };
  }

  revalidatePath("/gastos");
  return { ok: true };
}
