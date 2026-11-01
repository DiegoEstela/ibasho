/** Una compra terminada y lo que llevaba (copia: no depende de la lista). */
export type ShoppingPurchase = {
  id: string;
  purchased_on: string;
  store: string | null;
  total_amount: number;
  expense_id: string | null;
  /** Tarjeta con la que se pagó; nulo = efectivo u otro. */
  card_id: string | null;
  created_at: string;
};

export type ShoppingPurchaseItem = {
  id: string;
  purchase_id: string;
  name: string;
  quantity: string | null;
  category: string | null;
};

export const PURCHASES_SELECT = "id, purchased_on, store, total_amount, expense_id, card_id, created_at";
export const PURCHASE_ITEMS_SELECT = "id, purchase_id, name, quantity, category";

/** Agrupa las compras por mes («aaaa-mm»), de la más reciente a la más antigua. */
export function groupByMonth(purchases: ShoppingPurchase[]): [string, ShoppingPurchase[]][] {
  const sorted = [...purchases].sort(
    (a, b) => b.purchased_on.localeCompare(a.purchased_on) || b.created_at.localeCompare(a.created_at),
  );
  const map = new Map<string, ShoppingPurchase[]>();
  for (const p of sorted) {
    const month = p.purchased_on.slice(0, 7);
    map.set(month, [...(map.get(month) ?? []), p]);
  }
  return [...map.entries()];
}
