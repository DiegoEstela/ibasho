/** Todo el cálculo se hace en céntimos (enteros) para evitar errores de redondeo. */

export const toCents = (amount: number) => Math.round(amount * 100);

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const formatEUR = (cents: number) => eur.format(cents / 100);

/** Convierte lo que escribe la persona ("12,50", "1.234,56", "12.5") en euros. */
export function parseAmount(text: string): number | null {
  let t = text.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) {
    // El último separador es el decimal; el otro es de miles.
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

/** Reparte `total` céntimos a partes iguales; los céntimos sobrantes van a los primeros. */
export function splitEqual(total: number, ids: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  if (ids.length === 0) return result;
  const base = Math.floor(total / ids.length);
  let remainder = total - base * ids.length;
  for (const id of ids) {
    result[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return result;
}

/** Reparte por porcentajes (deben sumar 100); el sobrante va a quien tenga más decimales. */
export function splitByPercent(total: number, percents: Record<string, number>): Record<string, number> {
  const ids = Object.keys(percents);
  const exact = ids.map((id) => ({ id, value: (total * percents[id]) / 100 }));
  const result: Record<string, number> = {};
  let assigned = 0;
  for (const { id, value } of exact) {
    result[id] = Math.floor(value + 1e-9);
    assigned += result[id];
  }
  let remainder = total - assigned;
  const byFraction = [...exact].sort((a, b) => (b.value % 1) - (a.value % 1));
  for (const { id } of byFraction) {
    if (remainder <= 0) break;
    result[id] += 1;
    remainder--;
  }
  return result;
}

/** Porcentajes iguales que suman exactamente 100 (el último absorbe el redondeo). */
export function evenPercents(ids: string[]): Record<string, string> {
  const base = Math.floor(10000 / ids.length) / 100;
  const result: Record<string, string> = {};
  let used = 0;
  ids.forEach((id, i) => {
    const value = i === ids.length - 1 ? Math.round((100 - used) * 100) / 100 : base;
    used += value;
    result[id] = String(value);
  });
  return result;
}
