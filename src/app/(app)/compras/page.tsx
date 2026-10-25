import { Suspense } from "react";
import { requireHousehold } from "@/lib/household";
import type { CustomCategoryRow } from "./categoryTypes";
import { ShoppingList, type Item, type Member, type Product } from "./ShoppingList";

async function Compras() {
  const { supabase, user, household } = await requireHousehold();

  const [{ data: items }, { data: products }, { data: profiles }, { data: categories }] = await Promise.all([
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
    <Suspense fallback={<h1 className="font-display text-3xl font-bold lg:text-4xl">Compras</h1>}>
      <Compras />
    </Suspense>
  );
}
