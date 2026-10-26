"use client";

import { useState } from "react";
import { Check, ShoppingBasket } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { classify } from "@/lib/compras/categories";
import { formatQuantity } from "@/lib/cocina/parse";
import { createClient } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push/client";

export type RecipeIngredient = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  product_id: string | null;
  /** Está en casa según la sección Casa de Compras. */
  inStock: boolean;
  category: string | null;
  /** Ya figura en la lista de la próxima compra. */
  inList: boolean;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Revisa qué ingredientes de la receta no están en casa y ofrece añadirlos a la lista de compras. */
export function MissingIngredients({ householdId, meName, ingredients }: { householdId: string; meName: string; ingredients: RecipeIngredient[] }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const missing = ingredients.filter((i) => !i.inStock && !i.inList && !added.includes(i.id));
  const inList = ingredients.filter((i) => !i.inStock && (i.inList || added.includes(i.id)));
  const atHome = ingredients.filter((i) => i.inStock);

  function show() {
    setPicked(missing.map((i) => i.id));
    setError("");
    setOpen(true);
  }

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function addToList() {
    const chosen = missing.filter((i) => picked.includes(i.id));
    if (chosen.length === 0) return;
    setSaving(true);
    setError("");
    const supabase = createClient();
    const rows = chosen.map((i) => ({
      household_id: householdId,
      product_id: i.product_id,
      name: capitalize(i.name),
      quantity: formatQuantity(i.quantity, i.unit) || null,
      category: i.category ?? classify(i.name),
    }));
    const { error: insertError } = await supabase.from("shopping_items").insert(rows);
    if (insertError) {
      setSaving(false);
      setError("No se pudieron añadir. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    const productIds = chosen.map((i) => i.product_id).filter((id): id is string => !!id);
    if (productIds.length) await supabase.from("products").update({ in_stock: false }).in("id", productIds);
    setSaving(false);
    setAdded((prev) => [...prev, ...chosen.map((i) => i.id)]);
    notifyPartner({
      kind: "compras",
      title: "Lista de compras",
      body: `${meName || "Tu pareja"} agregó ${chosen.length === 1 ? `«${capitalize(chosen[0].name)}»` : `${chosen.length} productos`}`,
      url: "/compras",
    });
    setOpen(false);
  }

  if (ingredients.length === 0) return null;

  return (
    <>
      <button
        onClick={show}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-sm font-medium text-forest shadow-sm transition active:scale-95"
      >
        <ShoppingBasket size={17} /> ¿Qué me falta?
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="¿Qué me falta?">
        <div className="flex flex-col gap-5">
          {missing.length > 0 ? (
            <div>
              <p className="mb-2 text-sm text-ink-soft">
                {missing.length === 1 ? "Falta 1 ingrediente." : `Faltan ${missing.length} ingredientes.`} ¿Los añado a la lista de compras?
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {missing.map((i) => (
                  <li key={i.id}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
                      <input type="checkbox" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} className="size-5 accent-forest" />
                      <span className="flex-1 text-[15px]">{capitalize(i.name)}</span>
                      <span className="text-xs text-ink-soft">{formatQuantity(i.quantity, i.unit)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {error && <p role="alert" className="mt-3 rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}
              <button
                onClick={addToList}
                disabled={saving || picked.length === 0}
                className="mt-4 min-h-12 w-full rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                {saving ? "Añadiendo…" : picked.length === 1 ? "Añadir 1 a la lista" : `Añadir ${picked.length} a la lista`}
              </button>
            </div>
          ) : (
            <p className="rounded-2xl bg-forest/10 px-4 py-3 text-sm text-forest">
              {inList.length > 0 ? "Todo lo que falta ya está en la lista de compras." : "Tienen todo lo que necesita esta receta. 🎉"}
            </p>
          )}

          {inList.length > 0 && missing.length > 0 && (
            <Group title="Ya en la lista de compras" names={inList.map((i) => i.name)} />
          )}
          {atHome.length > 0 && <Group title="Ya tienen en casa" names={atHome.map((i) => i.name)} />}
        </div>
      </BottomSheet>
    </>
  );
}

function Group({ title, names }: { title: string; names: string[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-ink-soft">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <li key={n} className="flex items-center gap-1 rounded-full bg-moss/15 px-2.5 py-1 text-xs text-forest">
            <Check size={12} /> {capitalize(n)}
          </li>
        ))}
      </ul>
    </div>
  );
}
