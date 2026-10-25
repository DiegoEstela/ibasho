import { splitByPercent, splitEqual } from "@/lib/gastos/money";

/** Todo en céntimos y con fechas "aaaa-mm-dd" como texto, para evitar errores de zona horaria. */

export type InstallmentDraft = { number: number; due_date: string; cents: number };

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate(); // month: 1-12

/** Fecha en el mes indicado (aunque month se salga de 1-12), ajustando el día al último del mes si hace falta. */
function dateIn(year: number, month: number, day: number): string {
  const total = year * 12 + (month - 1);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/**
 * Fecha de la primera cuota.
 * - Con día de cierre: las compras hasta el cierre entran en el resumen de ese mes; las posteriores, en el siguiente.
 *   El pago cae el día de vencimiento (en el mismo mes del cierre si vence después de cerrar; si no, en el siguiente).
 * - Sin día de cierre: se paga el próximo día de vencimiento.
 */
export function firstDueDate(purchaseDate: string, closingDay: number | null, dueDay: number): string {
  const [y, m, d] = purchaseDate.split("-").map(Number);
  let offset: number;
  if (closingDay == null) {
    offset = d <= dueDay ? 0 : 1;
  } else {
    const statementOffset = d <= closingDay ? 0 : 1;
    const dueOffset = dueDay > closingDay ? 0 : 1;
    offset = statementOffset + dueOffset;
  }
  return dateIn(y, m + offset, dueDay);
}

/** Total a pagar en céntimos, con el interés total (en %) aplicado. */
export function financedCents(totalCents: number, interestPercent: number): number {
  return Math.round(totalCents * (1 + interestPercent / 100));
}

/** Genera las cuotas: importes iguales (los céntimos sobrantes van a las primeras) y un vencimiento por mes. */
export function buildInstallments(params: {
  purchaseDate: string;
  totalCents: number;
  interestPercent: number;
  count: number;
  closingDay: number | null;
  dueDay: number;
}): InstallmentDraft[] {
  const { purchaseDate, totalCents, interestPercent, count, closingDay, dueDay } = params;
  const first = firstDueDate(purchaseDate, closingDay, dueDay);
  const [fy, fm] = first.split("-").map(Number);
  const ids = Array.from({ length: count }, (_, i) => String(i));
  const amounts = splitEqual(financedCents(totalCents, interestPercent), ids);
  return ids.map((id, i) => ({ number: i + 1, due_date: dateIn(fy, fm + i, dueDay), cents: amounts[id] }));
}

/** Una cuota cuenta como pagada si se marcó a mano; si no, cuando llega su fecha. */
export function isInstallmentPaid(manualPaid: boolean | null, dueDate: string, today: string): boolean {
  return manualPaid ?? dueDate <= today;
}

/** Cuánto le toca a cada persona de una cuota, según los porcentajes de la compra (suma exacta). */
export function shareOfInstallment(cents: number, percents: Record<string, number>): Record<string, number> {
  return splitByPercent(cents, percents);
}

export type InstallmentRow = {
  purchase_id: string;
  number: number;
  due_date: string;
  amount: number;
  manual_paid: boolean | null;
};

/** Cuotas aún por pagar agrupadas por mes ("aaaa-mm"); las atrasadas se acumulan en el mes actual. */
export function projectByMonth(
  rows: InstallmentRow[],
  today: string,
  amountFor: (row: InstallmentRow) => number,
  months = 12,
): { month: string; cents: number }[] {
  const currentMonth = today.slice(0, 7);
  const [cy, cm] = currentMonth.split("-").map(Number);
  const buckets = new Map<string, number>();
  for (let i = 0; i < months; i++) buckets.set(dateIn(cy, cm + i, 1).slice(0, 7), 0);

  for (const row of rows) {
    if (isInstallmentPaid(row.manual_paid, row.due_date, today)) continue;
    const month = row.due_date.slice(0, 7) < currentMonth ? currentMonth : row.due_date.slice(0, 7);
    if (buckets.has(month)) buckets.set(month, (buckets.get(month) ?? 0) + amountFor(row));
  }
  return [...buckets.entries()].map(([month, cents]) => ({ month, cents }));
}
