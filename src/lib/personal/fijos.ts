import { toCents } from "@/lib/gastos/money";
import { amountCents, dueDateIn, isDueIn } from "@/lib/fijos/schedule";
import { DEFAULT_SHARE_PERCENT, type MisCuentasData, type Movement } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const index = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
const monthFromIndex = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;

/** Meses «aaaa-mm» de `from` a `to`, ambos incluidos. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = index(from); i <= index(to); i++) out.push(monthFromIndex(i));
  return out;
}

/** Cuánto de un fijo del hogar cuenta en tu presupuesto (por defecto, la mitad). */
export const sharePercent = (data: MisCuentasData, fixedId: string) =>
  data.fixedShares.find((s) => s.fixed_id === fixedId)?.percent ?? DEFAULT_SHARE_PERCENT;

/**
 * Los gastos fijos como movimientos, de `fromMonth` a `toMonth`:
 * - tus fijos individuales, desde el mes en que empiezan;
 * - tu parte de los fijos del hogar, solo del mes actual en adelante (los meses pasados ya están en tus gastos compartidos)
 *   y solo si ese mes aún no se pasó a Gastos (si ya se pasó, sale como gasto compartido y no se cuenta dos veces).
 */
export function fixedMovements(
  data: MisCuentasData,
  today: string,
  fromMonth: string,
  toMonth: string,
  cardName: (cardId: string | null, personalCardId: string | null) => string,
): Movement[] {
  const currentMonth = today.slice(0, 7);
  const list: Movement[] = [];

  for (const f of data.personalFixed) {
    if (f.amount <= 0) continue;
    for (const ym of monthsBetween(fromMonth, toMonth)) {
      if (!isDueIn(f, ym)) continue;
      const date = dueDateIn(ym, f.due_day);
      list.push({
        key: `f-${f.id}-${ym}`,
        source: "fijo",
        kind: "expense",
        date,
        description: f.name,
        category: f.category,
        cents: toCents(f.amount),
        method: cardName(f.card_id, f.personal_card_id),
        cardId: f.card_id,
        personalCardId: f.personal_card_id,
        detail: f.every_months === 1 ? "Fijo mensual" : `Fijo cada ${f.every_months} meses`,
        pending: date > today,
      });
    }
  }

  for (const f of data.householdFixed) {
    const percent = sharePercent(data, f.id);
    if (percent <= 0) continue;
    for (const ym of monthsBetween(fromMonth > currentMonth ? fromMonth : currentMonth, toMonth)) {
      if (!isDueIn(f, ym)) continue;
      if (data.fixedEntries.some((e) => e.fixed_id === f.id && e.month.slice(0, 7) === ym && e.expense_id)) continue;
      const cents = Math.round((amountCents(f, data.fixedEntries, ym) * percent) / 100);
      if (cents <= 0) continue;
      const date = dueDateIn(ym, f.due_day);
      list.push({
        key: `h-${f.id}-${ym}`,
        source: "fijo",
        kind: "expense",
        date,
        description: f.name,
        category: f.category,
        cents,
        method: cardName(f.card_id, null),
        cardId: f.card_id,
        personalCardId: null,
        detail: `Fijo del hogar · tu ${percent === 50 ? "mitad" : `${percent}%`}`,
        pending: date > today,
      });
    }
  }

  return list;
}
