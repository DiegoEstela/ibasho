// Qué productos "toca" comprar según el historial de compras (sin base de datos nueva).

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

/** Cuánto lleva sin comprarse respecto a lo habitual: 1 = justo ahora, más de 1 = se pasó. */
function dueScore(stat: PurchaseStat, today: number) {
  if (!stat.intervalDays) return 0;
  return (today - stat.lastDay) / stat.intervalDays;
}

type Candidate = { id: string };

/**
 * Los que más probablemente faltan: comprados 2 veces o más a los que ya les toca.
 * Si hay pocos, se completan con los que más se compran.
 */
export function suggestIds(
  candidates: Candidate[],
  stats: Map<string, PurchaseStat>,
  today: number,
  limit = 8,
): string[] {
  const known = candidates.filter((c) => stats.has(c.id));
  const due = known
    .filter((c) => {
      const s = stats.get(c.id)!;
      return s.count >= 2 && dueScore(s, today) >= 0.8;
    })
    .sort((a, b) => dueScore(stats.get(b.id)!, today) - dueScore(stats.get(a.id)!, today));

  const picked = due.slice(0, limit).map((c) => c.id);
  if (picked.length >= limit) return picked;

  const taken = new Set(picked);
  const filler = known
    .filter((c) => !taken.has(c.id))
    .sort((a, b) => stats.get(b.id)!.count - stats.get(a.id)!.count);
  return [...picked, ...filler.slice(0, limit - picked.length).map((c) => c.id)];
}

/** "hoy", "ayer", "hace 12 días", "hace 3 semanas"… */
export function sinceLabel(lastDay: number, today: number) {
  const days = Math.max(0, today - lastDay);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.round(days / 7)} semanas`;
  return `hace ${Math.round(days / 30)} meses`;
}
