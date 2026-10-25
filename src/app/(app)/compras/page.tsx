import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { CustomCategoryRow } from "./categoryTypes";
import { ShoppingList, type Item, type Member, type Product } from "./ShoppingList";

async function Compras() {
  const supabase = await createClient();

  const [{ user, household }, { data: items }, { data: products }, { data: profiles }, { data: categories }] = await Promise.all([
    requireHousehold(),
    supabase.from("shopping_items").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("products").select("id, name, category").order("name").limit(1000),
    supabase.from("profiles").select("id, display_name, color"),
    supabase.from("shopping_categories").select("id, name, icon, color, position").order("position"),
  ]);

  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || "Alguien",
    color: p.color,
  }));

  return (
    <ShoppingList
      householdId={household.id}
      userId={user.id}
      initialItems={(items ?? []) as Item[]}
      initialProducts={(products ?? []) as Product[]}
      initialCategories={(categories ?? []) as CustomCategoryRow[]}
      members={members}
    />
  );
}

export default function ComprasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Compras />
    </Suspense>
  );
}
