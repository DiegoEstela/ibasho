import { isInstallmentPaid, shareOfInstallment } from "./installments";

export type InstRow = { number: number; due_date: string; amount: number; manual_paid: boolean | null };

export type PurchaseStats = {
  total: number;
  paid: number;
  remaining: number;
  pendingCents: number;
  nextDue: string | null;
  lastDue: string | null;
  firstCents: number;
};

const toCents = (amount: number) => Math.round(amount * 100);

/** Cuántas cuotas van pagadas, cuántas faltan, cuánto queda y cuándo es la próxima y la última. */
export function purchaseStats(rows: InstRow[]): PurchaseStats {
  const sorted = [...rows].sort((a, b) => a.number - b.number);
  let paid = 0;
  let pendingCents = 0;
  let nextDue: string | null = null;
  let lastDue: string | null = null;

  for (const r of sorted) {
    if (isInstallmentPaid(r.manual_paid)) paid++;
    else {
      pendingCents += toCents(r.amount);
      if (!nextDue) nextDue = r.due_date;
    }
    if (!lastDue || r.due_date > lastDue) lastDue = r.due_date;
  }

  return {
    total: sorted.length,
    paid,
    remaining: sorted.length - paid,
    pendingCents,
    nextDue,
    lastDue,
    firstCents: sorted[0] ? toCents(sorted[0].amount) : 0,
  };
}

/** La parte de una cuota que le toca a una persona; sin persona, el importe completo. */
export function personCents(cents: number, shares: Record<string, number>, personId: string): number {
  if (!personId) return cents;
  return shareOfInstallment(cents, shares)[personId] ?? 0;
}
