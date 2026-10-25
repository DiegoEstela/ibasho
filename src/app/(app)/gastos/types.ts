export type Expense = {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  expense_date: string;
  category: string;
  /** Nulo si se pagó desde una tarjeta compartida. */
  paid_by: string | null;
  card_id: string | null;
  notes: string | null;
  /** Moneda en que se pagó; el importe `amount` siempre está en euros. */
  currency: string;
  original_amount: number | null;
  /** Unidades de la moneda por cada 1 euro. */
  exchange_rate: number | null;
  created_at: string;
};

export type Split = { expense_id: string; participant_id: string; amount: number };

export type Settlement = {
  id: string;
  group_id: string;
  from_participant: string;
  to_participant: string;
  amount: number;
  settled_on: string;
  note: string | null;
  created_at: string;
};

/** dd/mm/aaaa a partir de "aaaa-mm-dd" (sin pasar por zonas horarias). */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
