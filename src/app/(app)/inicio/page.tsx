import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { netBalances, simplifyDebts, type Participant } from "@/lib/gastos/balance";
import { toCents } from "@/lib/gastos/money";
import { isInstallmentPaid } from "@/lib/tarjetas/installments";
import { personCents } from "@/lib/tarjetas/summary";
import { addDays } from "@/lib/viajes/dates";
import type { ReminderTask } from "./Reminders";
import { Dashboard, type RecentItem, type Stats } from "./Dashboard";
import { DEFAULT_WIDGETS, isWidgetId } from "./catalog";

async function Resumen() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? "";
  const todayMadrid = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

  // La semana termina el domingo.
  const weekEnd = addDays(todayMadrid, (7 - new Date(`${todayMadrid}T00:00:00Z`).getUTCDay()) % 7);

  const [{ user, household }, { data: pending }, { data: recipes }, { data: profiles }, { data: me }, { data: recent }, gParts, gExpenses, gSplits, gSettlements, cInstallments, cShares, nNotes, nReads, vTrips, wItems, hNotes, tTasks] =
    await Promise.all([
      requireHousehold(),
      supabase.from("shopping_items").select("name").eq("done", false).order("created_at", { ascending: false }).limit(200),
      supabase.from("recipes").select("name, is_favorite").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id, display_name, color"),
      supabase.from("profiles").select("dashboard_widgets").eq("id", userId).maybeSingle(),
      supabase
        .from("shopping_items")
        .select("id, name, created_by, created_at, done, done_by, done_at")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("expense_participants").select("id, user_id, name, color, expense_groups!inner(kind)").eq("expense_groups.kind", "household"),
      supabase.from("expenses").select("id, paid_by, amount, expense_groups!inner(kind)").eq("expense_groups.kind", "household").limit(2000),
      supabase
        .from("expense_splits")
        .select("expense_id, participant_id, amount, expenses!inner(group_id, expense_groups!inner(kind))")
        .eq("expenses.expense_groups.kind", "household")
        .limit(20000),
      supabase.from("settlements").select("from_participant, to_participant, amount, expense_groups!inner(kind)").eq("expense_groups.kind", "household").limit(1000),
      supabase.from("card_installments").select("purchase_id, due_date, amount, manual_paid").limit(20000),
      supabase.from("card_purchase_shares").select("purchase_id, user_id, percent").limit(5000),
      supabase.from("daily_messages").select("id, from_user, body, deliver_on, created_at").neq("from_user", userId).order("deliver_on", { ascending: false }).order("created_at", { ascending: false }).limit(30),
      supabase.from("daily_message_reads").select("message_id").eq("user_id", userId),
      supabase.from("trips").select("id, name, emoji, start_date, end_date").order("start_date", { ascending: true, nullsFirst: false }).limit(50),
      supabase.from("wishlist_items").select("title, priority, created_at").eq("status", "deseado").order("priority").order("created_at", { ascending: false }).limit(100),
      supabase.from("notes").select("title, pinned, updated_at").order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(100),
      supabase
        .from("tasks")
        .select("id, title, recurrence, interval_days, weekdays, month_day, due_date, assigned_to, remind_time")
        .eq("active", true)
        .lte("due_date", weekEnd)
        .order("due_date")
        .order("remind_time", { nullsFirst: false })
        .limit(200),
    ]);

  // Si la migración 0004 aún no se ejecutó, la columna no existe y se usan los widgets por defecto.
  const saved = ((me as { dashboard_widgets?: string[] } | null)?.dashboard_widgets ?? []).filter(isWidgetId);

  // Balance del hogar para el widget de Gastos (si la migración 0005 no está, queda en "sin gastos").
  const parts = (gParts.data ?? []) as unknown as Participant[];
  const meParticipant = parts.find((p) => p.user_id === user.id);
  const expensesData = (gExpenses.data ?? []) as unknown as { id: string; paid_by: string; amount: number }[];
  const net = netBalances(
    parts,
    expensesData,
    (gSplits.data ?? []) as unknown as { expense_id: string; participant_id: string; amount: number }[],
    (gSettlements.data ?? []) as unknown as { from_participant: string; to_participant: string; amount: number }[],
  );
  const transfers = simplifyDebts(net);
  const nameOf = (id: string) => parts.find((p) => p.id === id)?.name ?? "Alguien";
  const owes = transfers.filter((t) => t.from === meParticipant?.id);
  const owed = transfers.filter((t) => t.to === meParticipant?.id);

  const gastos: Stats["gastos"] =
    expensesData.length === 0
      ? { state: "none", cents: 0, name: null }
      : owes.length > 0
        ? { state: "owe", cents: owes.reduce((s, t) => s + t.cents, 0), name: owes.length === 1 ? nameOf(owes[0].to) : null }
        : owed.length > 0
          ? { state: "owed", cents: owed.reduce((s, t) => s + t.cents, 0), name: owed.length === 1 ? nameOf(owed[0].from) : null }
          : { state: "even", cents: 0, name: null };

  // Tarjetas: lo que me queda por pagar y el próximo pago (si la migración 0006 no está, queda en "sin tarjetas").
  const today = todayMadrid;
  const sharesOf = new Map<string, Record<string, number>>();
  for (const s of (cShares.data ?? []) as { purchase_id: string; user_id: string; percent: number }[]) {
    sharesOf.set(s.purchase_id, { ...(sharesOf.get(s.purchase_id) ?? {}), [s.user_id]: Number(s.percent) });
  }
  let cardPending = 0;
  let nextDue: string | null = null;
  let nextCents = 0;
  const allInstallments = (cInstallments.data ?? []) as { purchase_id: string; due_date: string; amount: number; manual_paid: boolean | null }[];
  for (const i of allInstallments) {
    if (isInstallmentPaid(i.manual_paid)) continue;
    const mine = personCents(toCents(Number(i.amount)), sharesOf.get(i.purchase_id) ?? {}, user.id);
    if (mine <= 0) continue;
    cardPending += mine;
    if (!nextDue || i.due_date < nextDue) {
      nextDue = i.due_date;
      nextCents = mine;
    } else if (i.due_date === nextDue) {
      nextCents += mine;
    }
  }
  const tarjeta: Stats["tarjeta"] = { hasData: allInstallments.length > 0, pendingCents: cardPending, nextDue, nextCents };

  // Notitas: la última que te dejaron y cuántas te faltan por abrir (si la migración 0008 no está, queda vacío).
  const received = (nNotes.data ?? []) as { id: string; from_user: string; body: string }[];
  const readIds = new Set((nReads.data ?? []).map((r) => r.message_id as string));
  const sender = (id: string) => (profiles ?? []).find((p) => p.id === id)?.display_name || "Tu pareja";
  const mensajes: Stats["mensajes"] = {
    hasPartner: (profiles ?? []).length > 1,
    unread: received.filter((n) => !readIds.has(n.id)).length,
    latest: received[0] ? { body: received[0].body, from: sender(received[0].from_user) } : null,
  };

  // Viajes: el cliente elige cuál mostrar según la fecha de hoy (si la migración 0010 no está, la lista queda vacía).
  const viajes = ((vTrips.data ?? []) as { id: string; name: string; emoji: string | null; start_date: string | null; end_date: string | null }[]);

  // Wishlist, notas y tareas (si sus migraciones no están, las listas llegan vacías y el widget lo dice).
  const wishlist: Stats["wishlist"] = { count: wItems.data?.length ?? 0, top: (wItems.data?.[0]?.title as string | undefined) ?? null };
  const notas: Stats["notas"] = { count: hNotes.data?.length ?? 0, latest: (hNotes.data?.[0]?.title as string | undefined) ?? null };
  const weekTasks = ((tTasks.data ?? []) as ReminderTask[]).filter((t) => t.assigned_to === null || t.assigned_to === userId);
  const myTasks = weekTasks.filter((t) => t.due_date <= today);
  const tareas: Stats["tareas"] = {
    overdue: myTasks.filter((t) => t.due_date < today).length,
    today: myTasks.filter((t) => t.due_date === today).length,
    first: myTasks[0]?.title ?? null,
  };

  const stats: Stats = {
    wishlist,
    notas,
    tareas,
    viajes,
    mensajes,
    tarjeta,
    gastos,
    pendingCount: pending?.length ?? 0,
    topPending: (pending ?? []).slice(0, 3).map((p) => p.name),
    recipesCount: recipes?.length ?? 0,
    favoritesCount: (recipes ?? []).filter((r) => r.is_favorite).length,
    lastRecipe: recipes?.[0]?.name ?? null,
  };

  return (
    <Dashboard
      userId={user.id}
      householdName={household.name}
      inviteCode={household.invite_code}
      initialWidgets={me ? saved : DEFAULT_WIDGETS}
      stats={stats}
      reminders={weekTasks}
      madridToday={todayMadrid}
      recentItems={(recent ?? []) as RecentItem[]}
      members={(profiles ?? []).map((p) => ({ id: p.id, name: p.display_name || "Alguien", color: p.color }))}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Resumen />
    </Suspense>
  );
}
