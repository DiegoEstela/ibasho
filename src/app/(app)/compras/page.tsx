import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { TEMPLATES_SELECT, toTemplates } from "@/lib/compras/templates";
import { PURCHASES_SELECT, PURCHASE_ITEMS_SELECT, type ShoppingPurchase, type ShoppingPurchaseItem } from "@/lib/compras/historial";
import { createClient } from "@/lib/supabase/server";
import type { CustomCategoryRow } from "./categoryTypes";
import { ShoppingList, type Item, type Member, type Product } from "./ShoppingList";

async function Compras() {
  const supabase = await createClient();

  const [{ user, household }, { data: items }, { data: products }, { data: profiles }, { data: categories }, templates, { data: history }, purchases, purchaseItems, { data: cards }] =
    await Promise.all([
      requireHousehold(),
      supabase.from("shopping_items").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("products").select("id, name, category, in_stock").order("name").limit(1000),
      supabase.from("profiles").select("id, display_name, color"),
      supabase.from("shopping_categories").select("id, name, icon, color, position").order("position"),
      // Si aún no se ejecutó la migración de plantillas, el resto de Compras funciona igual.
      supabase.from("shopping_templates").select(TEMPLATES_SELECT).order("position").order("created_at"),
      // Compras ya hechas: de ahí sale «te suele hacer falta».
      supabase
        .from("shopping_items")
        .select("product_id, done_at")
        .eq("done", true)
        .not("product_id", "is", null)
        .order("done_at", { ascending: false })
        .limit(3000),
      // Historial de compras terminadas (si falta la migración, simplemente sale vacío).
      supabase.from("shopping_purchases").select(PURCHASES_SELECT).order("purchased_on", { ascending: false }).order("created_at", { ascending: false }).limit(300),
      supabase.from("shopping_purchase_items").select(PURCHASE_ITEMS_SELECT).limit(5000),
      supabase.from("cards").select("id, name, last4").eq("archived", false).order("created_at"),
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
      initialTemplates={toTemplates(templates.data as Parameters<typeof toTemplates>[0])}
      templatesUnavailable={!!templates.error}
      history={history ?? []}
      members={members}
      initialPurchases={(purchases.data ?? []) as ShoppingPurchase[]}
      initialPurchaseItems={(purchaseItems.data ?? []) as ShoppingPurchaseItem[]}
      cards={cards ?? []}
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
