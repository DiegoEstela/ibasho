import { toCents } from "@/lib/gastos/money";

/** Meses como "aaaa-mm" y fechas como "aaaa-mm-dd" en texto, para evitar errores de zona horaria. */

export type Fixed = {
  id: string;
  name: string;
  category: string;
  amount: number;
  every_months: number;
  start_month: string;
  due_day: number | null;
  paid_by: string | null;
  card_id: string | null;
  is_subscription: boolean;
  archived: boolean;
};

export type FixedEntry = {
  id: string;
  fixed_id: string;
  month: string;
  amount: number;
  expense_id: string | null;
  /** Factura (PDF o foto) de ese mes, guardada en Storage. */
  file_path?: string | null;
  file_name?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;

export const monthOf = (iso: string) => iso.slice(0, 7);
export const addMonths = (ym: string, n: number) => fromIndex(monthIndex(ym) + n);

/** ¿Toca pagarlo en este mes? (desde el primer mes y cada `every_months`) */
export function isDueIn(fixed: Pick<Fixed, "start_month" | "every_months">, ym: string): boolean {
  const diff = monthIndex(ym) - monthIndex(monthOf(fixed.start_month));
  return diff >= 0 && diff % fixed.every_months === 0;
}

/** Último mes en que tocaba pagarlo hasta `ym` (inclusive), para mostrar «el último fue…». */
export function lastDueMonth(fixed: Pick<Fixed, "start_month" | "every_months">, ym: string): string | null {
  const diff = monthIndex(ym) - monthIndex(monthOf(fixed.start_month));
  if (diff < 0) return null;
  return addMonths(ym, -(diff % fixed.every_months));
}

/** Próximo mes en que toca pagarlo, contando `ym` (si toca ese mismo mes, es ese). */
export function nextDueMonth(fixed: Pick<Fixed, "start_month" | "every_months">, ym: string): string {
  const start = monthOf(fixed.start_month);
  if (monthIndex(ym) <= monthIndex(start)) return start;
  const diff = monthIndex(ym) - monthIndex(start);
  const rest = diff % fixed.every_months;
  return addMonths(ym, rest === 0 ? 0 : fixed.every_months - rest);
}

/** Fecha de cobro dentro de un mes, ajustando el día al último del mes si hace falta. */
export function dueDateIn(ym: string, dueDay: number | null): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${pad(Math.min(dueDay ?? 1, last))}`;
}

/**
 * Importe de un mes: el que se guardó ese mes. Si aún no hay, la referencia es el último mes guardado antes de ese
 * (o, si no hay ninguno, el importe habitual con que se creó). Así cada mes conserva lo que costó de verdad.
 */
export function amountCents(fixed: Fixed, entries: FixedEntry[], ym: string): number {
  const mine = entries.filter((e) => e.fixed_id === fixed.id);
  const saved = mine.find((e) => monthOf(e.month) === ym);
  if (saved) return toCents(Number(saved.amount));
  const before = mine.filter((e) => monthOf(e.month) < ym).sort((a, b) => b.month.localeCompare(a.month))[0];
  return toCents(Number(before ? before.amount : fixed.amount));
}

/** Lo que costó cada vez que se guardó, del más reciente al más antiguo. */
export const historyOf = (fixedId: string, entries: FixedEntry[]) =>
  entries.filter((e) => e.fixed_id === fixedId).sort((a, b) => b.month.localeCompare(a.month));

/** Lo que va a costar cada mes de los próximos: solo los fijos que tocan ese mes. */
export function totalForMonth(fixeds: Fixed[], entries: FixedEntry[], ym: string): number {
  return fixeds.reduce((sum, f) => (!f.archived && isDueIn(f, ym) ? sum + amountCents(f, entries, ym) : sum), 0);
}

export const everyLabel = (n: number) => (n === 1 ? "cada mes" : n === 12 ? "cada año" : `cada ${n} meses`);
