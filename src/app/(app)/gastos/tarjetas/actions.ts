"use server";

import { revalidatePath } from "next/cache";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { ensureGroupId, ensureTripGroup, syncParticipants } from "@/lib/gastos/setup";
import { formatEUR, splitByPercent, toCents } from "@/lib/gastos/money";
import { cardLabel } from "@/lib/tarjetas/labels";
import { requireHousehold } from "@/lib/household";

type Result = { ok: true } | { ok: false; message: string };

type PurchaseInfo = {
  card_id: string;
  trip_id: string | null;
  description: string;
  merchant: string | null;
  installments_count: number;
  total_amount: number;
  interest_percent: number;
  cards: { name: string; last4: string | null; owner_user_id: string | null } | null;
};

/**
 * Registra en Gastos compartidos UNA cuota de una compra con tarjeta, con todos sus datos:
 * el importe de esa cuota, el concepto («Televisor · cuota 3/12»), la tarjeta, quién pagó y el reparto de la compra.
 * La fecha del gasto es la de hoy (el momento en que se pasa a Gastos). Si la compra viene de un viaje, cae en los gastos de ese viaje.
 */
export async function sendInstallmentToExpenses(installmentId: string, category: string): Promise<Result> {
  const { supabase, user, household } = await requireHousehold();
  const chosenCategory = EXPENSE_CATEGORIES.some((c) => c.name === category) ? category : "Otros";
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

  const { data: installment } = await supabase
    .from("card_installments")
    .select(
      "id, purchase_id, number, amount, expense_id, manual_paid, card_purchases(card_id, trip_id, description, merchant, installments_count, total_amount, interest_percent, cards(name, last4, owner_user_id))",
    )
    .eq("id", installmentId)
    .maybeSingle();
  if (!installment) return { ok: false, message: "No encontramos esa cuota." };
  if (installment.expense_id) return { ok: false, message: "Esta cuota ya está en Gastos compartidos." };
  if (installment.manual_paid !== true) return { ok: false, message: "Marca primero la cuota como pagada." };

  const purchase = installment.card_purchases as unknown as PurchaseInfo | null;
  if (!purchase) return { ok: false, message: "No encontramos la compra de esta cuota." };

  const [{ data: shares }, { data: members }, { data: profiles }, { data: group }] = await Promise.all([
    supabase.from("card_purchase_shares").select("user_id, percent").eq("purchase_id", installment.purchase_id),
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
    supabase.from("expense_groups").select("id").eq("kind", "household").maybeSingle(),
  ]);

  let groupId: string;
  if (purchase.trip_id) {
    // Compra de un viaje: va al grupo de gastos de ese viaje (con sus invitados y su balance).
    const { data: trip } = await supabase.from("trips").select("name").eq("id", purchase.trip_id).maybeSingle();
    if (!trip) return { ok: false, message: "No encontramos el viaje de esta compra." };
    const ensuredTrip = await ensureTripGroup(supabase, { householdId: household.id, tripId: purchase.trip_id, name: trip.name as string });
    if ("error" in ensuredTrip) return { ok: false, message: `No se pudo preparar los gastos del viaje (${ensuredTrip.error.step}).` };
    groupId = ensuredTrip.groupId;
  } else {
    if ((members?.length ?? 0) < 2) return { ok: false, message: "Los gastos compartidos necesitan a tu pareja dentro del hogar." };
    const ensured = await ensureGroupId(supabase, household.id, group?.id as string | undefined);
    if ("error" in ensured) return { ok: false, message: `No se pudo preparar Gastos (${ensured.error.step}).` };
    groupId = ensured.groupId;
  }

  const synced = await syncParticipants(supabase, {
    householdId: household.id,
    groupId,
    userId: user.id,
    email: user.email,
    members: members ?? [],
    profiles: profiles ?? [],
  });
  if ("error" in synced) return { ok: false, message: `No se pudo preparar Gastos (${synced.error.step}).` };

  const participantOf = (userId: string) => synced.participants.find((p) => p.user_id === userId);

  // Quien pagó es el titular de la tarjeta. Si la tarjeta es compartida no hay un pagador: sale del dinero de los dos.
  const ownerId = purchase.cards?.owner_user_id ?? null;
  const payer = ownerId ? (participantOf(ownerId) ?? participantOf(user.id)) : null;
  if (ownerId && !payer) return { ok: false, message: "No se encontró a quien pagó la compra." };

  const percents: Record<string, number> = {};
  for (const s of shares ?? []) {
    const participant = participantOf(s.user_id);
    if (participant && Number(s.percent) > 0) percents[participant.id] = Number(s.percent);
  }
  if (Object.keys(percents).length === 0) return { ok: false, message: "La compra no tiene reparto." };

  const cents = toCents(Number(installment.amount));
  const parts = splitByPercent(cents, percents);

  const count = Number(purchase.installments_count);
  const label = count === 1 ? "pago único" : `cuota ${installment.number}/${count}`;
  const base = purchase.merchant ? `${purchase.description} · ${purchase.merchant}` : purchase.description;
  const notes = [
    `${count === 1 ? "Pago" : `Cuota ${installment.number} de ${count}`} de «${purchase.description}»`,
    purchase.cards ? ` con la tarjeta ${cardLabel(purchase.cards)}.` : ".",
    ` Total de la compra: ${formatEUR(toCents(Number(purchase.total_amount) * (1 + Number(purchase.interest_percent) / 100)))}.`,
  ].join("");

  const { data: expenseId, error } = await supabase.rpc("save_expense", {
    p_id: null,
    p_group: groupId,
    p_description: `${base} · ${label}`,
    p_amount: cents / 100,
    p_date: date,
    p_category: chosenCategory,
    p_paid_by: payer?.id ?? null,
    p_card: purchase.card_id,
    p_splits: Object.entries(parts).map(([participant_id, c]) => ({ participant_id, amount: c / 100 })),
  });
  if (error || !expenseId) return { ok: false, message: "No se pudo crear el gasto. Inténtalo de nuevo." };

  await supabase.from("expenses").update({ notes }).eq("id", expenseId);

  const { error: linkError } = await supabase.from("card_installments").update({ expense_id: expenseId }).eq("id", installmentId);
  if (linkError) {
    // Sin el enlace, un reintento duplicaría el gasto: se deshace para dejarlo como estaba.
    await supabase.from("expenses").delete().eq("id", expenseId);
    return { ok: false, message: "No se pudo completar el envío. Inténtalo de nuevo." };
  }

  revalidatePath("/gastos");
  if (purchase.trip_id) revalidatePath(`/viajes/${purchase.trip_id}`);
  return { ok: true };
}
