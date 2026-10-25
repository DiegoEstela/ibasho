import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { netBalances, simplifyDebts, type Participant } from "@/lib/gastos/balance";
import { Dashboard, type RecentItem, type Stats } from "./Dashboard";
import { DEFAULT_WIDGETS, isWidgetId } from "./catalog";

async function Resumen() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? "";

  const [{ user, household }, { data: pending }, { data: recipes }, { data: profiles }, { data: me }, { data: recent }, gParts, gExpenses, gSplits, gSettlements] =
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

  const stats: Stats = {
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
