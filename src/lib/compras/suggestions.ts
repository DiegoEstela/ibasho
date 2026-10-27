// Estadísticas de compra por producto (sin base de datos nueva): de aquí sale el ranking de la lista.

export type PurchaseRow = { product_id: string | null; done_at: string | null };

export type PurchaseStat = {
  /** Días distintos en que se compró. */
  count: number;
  /** Día (número absoluto) de la última compra. */
  lastDay: number;
  /** Cada cuántos días se compra, de media; nulo si solo se compró una vez. */
  intervalDays: number | null;
};

const madridDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });

function ymdToDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400_000);
}

/** Número de día en hora de España, para restar fechas sin líos de zonas horarias. */
export function madridDay(at: string | number) {
  return ymdToDay(madridDate.format(new Date(at)));
}

export function purchaseStats(rows: PurchaseRow[]): Map<string, PurchaseStat> {
  const daysByProduct = new Map<string, Set<number>>();
  for (const r of rows) {
    if (!r.product_id || !r.done_at) continue;
    const set = daysByProduct.get(r.product_id) ?? new Set<number>();
    set.add(madridDay(r.done_at));
    daysByProduct.set(r.product_id, set);
  }

  const stats = new Map<string, PurchaseStat>();
  for (const [id, set] of daysByProduct) {
    const days = [...set].sort((a, b) => a - b);
    const first = days[0];
    const last = days[days.length - 1];
    stats.set(id, {
      count: days.length,
      lastDay: last,
      intervalDays: days.length > 1 ? Math.max(1, (last - first) / (days.length - 1)) : null,
    });
  }
  return stats;
}
