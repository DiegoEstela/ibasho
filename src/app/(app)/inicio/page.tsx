import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { Dashboard, type RecentItem, type Stats } from "./Dashboard";
import { DEFAULT_WIDGETS, isWidgetId } from "./catalog";

async function Resumen() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? "";

  const [{ user, household }, { data: pending }, { data: recipes }, { data: profiles }, { data: me }, { data: recent }] =
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
    ]);

  // Si la migración 0004 aún no se ejecutó, la columna no existe y se usan los widgets por defecto.
  const saved = ((me as { dashboard_widgets?: string[] } | null)?.dashboard_widgets ?? []).filter(isWidgetId);

  const stats: Stats = {
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
