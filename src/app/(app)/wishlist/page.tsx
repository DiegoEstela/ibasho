import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { Person, WishItem, Wishlist } from "./types";
import { WishlistView } from "./WishlistView";

function Unavailable({ step, detail }: { step: string; detail: string }) {
  console.error(`[wishlist] ${step}: ${detail}`);
  return (
    <section>
      <PageHeader title="Wishlist" />
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
        <p className="font-medium text-ink">No pudimos cargar la wishlist.</p>
        <p className="mt-2">Paso que falló: <span className="font-mono">{step}</span></p>
        <p className="mt-1 break-words font-mono text-xs">{detail}</p>
        <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0012 en Supabase.</p>
      </div>
    </section>
  );
}

async function Wishlist_() {
  const supabase = await createClient();

  const [{ user, household }, lists, items, members, profiles] = await Promise.all([
    requireHousehold(),
    supabase.from("wishlists").select("id, name, emoji, position").order("position").order("created_at"),
    supabase.from("wishlist_items").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
  ]);

  const failed = [["leer las listas", lists.error], ["leer los deseos", items.error], ["leer los miembros del hogar", members.error]].find(([, e]) => e) as
    | [string, { code: string; message: string }]
    | undefined;
  if (failed) return <Unavailable step={failed[0]} detail={`${failed[1].code}: ${failed[1].message}`} />;

  const palette = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f"];
  const people: Person[] = (members.data ?? []).map((m, i) => {
    const profile = profiles.data?.find((p) => p.id === m.user_id);
    const fallback = m.user_id === user.id ? user.email.split("@")[0] : "";
    return { id: m.user_id, name: profile?.display_name || fallback || "Alguien", color: profile?.color || palette[i % palette.length] };
  });

  return (
    <WishlistView
      householdId={household.id}
      userId={user.id}
      people={people}
      initialLists={(lists.data ?? []) as Wishlist[]}
      initialItems={(items.data ?? []) as WishItem[]}
    />
  );
}

export default function WishlistPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Wishlist_ />
    </Suspense>
  );
}
