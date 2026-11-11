import { splitEqual } from "@/lib/gastos/money";

/** Producto de una compra: `owner` nulo = compartido a partes iguales entre todas las personas. */
export type ItemDraft = { cents: number; owner: string | null };

/**
 * Convierte los productos en el reparto de la compra (porcentajes por persona, suman 100).
 * Así cada cuota se pasa a Gastos con las mismas proporciones que los productos.
 */
export function sharesFromItems(items: ItemDraft[], ids: string[]): { user_id: string; percent: number }[] {
  const total = items.reduce((s, i) => s + i.cents, 0);
  if (total <= 0 || ids.length === 0) return [];
  const cents: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const item of items) {
    if (item.owner) cents[item.owner] = (cents[item.owner] ?? 0) + item.cents;
    else for (const [id, c] of Object.entries(splitEqual(item.cents, ids))) cents[id] += c;
  }
  const people = ids.filter((id) => cents[id] > 0);
  // El redondeo se lo lleva la última persona para que sumen exactamente 100.
  let used = 0;
  return people.map((id, i) => {
    const percent = i === people.length - 1 ? Math.round((100 - used) * 100) / 100 : Math.round((cents[id] / total) * 10000) / 100;
    used += percent;
    return { user_id: id, percent };
  });
}
