import { formatEUR, toCents } from "@/lib/gastos/money";
import { cardLabel } from "@/lib/tarjetas/labels";
import type { EntryKind, MisCuentasData, Movement, Plan } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export const monthOf = (iso: string) => iso.slice(0, 7);

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

const daysIn = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

export function monthName(ym: string, long = true): string {
  const [y, m] = ym.split("-").map(Number);
  const text = new Date(y, m - 1, 1).toLocaleDateString("es-ES", long ? { month: "long", year: "numeric" } : { month: "short" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------- Período ----------

export type PeriodMode = "mes" | "3m" | "6m" | "anio" | "todo";

export const PERIODS: { mode: PeriodMode; label: string }[] = [
  { mode: "mes", label: "Mes" },
  { mode: "3m", label: "3 meses" },
  { mode: "6m", label: "6 meses" },
  { mode: "anio", label: "Año" },
  { mode: "todo", label: "Todo" },
];

export type Period = {
  mode: PeriodMode;
  /** Meses del período ("aaaa-mm"), del más antiguo al más reciente. */
  months: string[];
  from: string;
  to: string;
  /** Cuántos meses ya empezaron (los que cuentan para el sueldo y la meta de ahorro). */
  elapsed: number;
  title: string;
};

/** `anchor` es el último mes del período (en «Año», cualquier mes del año). */
export function buildPeriod(mode: PeriodMode, anchor: string, firstMonth: string, currentMonth: string): Period {
  let months: string[];
  if (mode === "anio") {
    const y = anchor.slice(0, 4);
    months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  } else if (mode === "todo") {
    const first = firstMonth < currentMonth ? firstMonth : currentMonth;
    months = [];
    for (let m = first; m <= currentMonth; m = addMonths(m, 1)) months.push(m);
  } else {
    const n = mode === "mes" ? 1 : mode === "3m" ? 3 : 6;
    months = Array.from({ length: n }, (_, i) => addMonths(anchor, i - (n - 1)));
  }
  const first = months[0];
  const last = months[months.length - 1];
  const title =
    mode === "mes" ? monthName(first) : mode === "anio" ? first.slice(0, 4) : mode === "todo" ? "Todo el historial" : `${monthName(first, false)} ${first.slice(0, 4)} – ${monthName(last, false)} ${last.slice(0, 4)}`;
  return {
    mode,
    months,
    from: `${first}-01`,
    to: `${last}-${pad(daysIn(last))}`,
    elapsed: months.filter((m) => m <= currentMonth).length,
    title,
  };
}

// ---------- Movimientos ----------

/** Une tus gastos compartidos, tus cuotas y tus movimientos propios en una sola lista (del más reciente al más antiguo). */
export function toMovements(data: MisCuentasData, today: string): Movement[] {
  const cardName = new Map(data.cards.map((c) => [c.id, cardLabel(c)]));
  const methodOf = (cardId: string | null) => (cardId ? (cardName.get(cardId) ?? "Tarjeta") : "Efectivo");
  const list: Movement[] = [];

  for (const e of data.shared) {
    list.push({
      key: `s-${e.id}`,
      source: "compartido",
      kind: "expense",
      date: e.date,
      description: e.description,
      category: e.category,
      cents: toCents(e.amount),
      method: methodOf(e.card_id),
      cardId: e.card_id,
      detail: e.paid_by_me ? (e.total - e.amount > 0.004 ? `Pagaste tú ${formatEUR(toCents(e.total))} · tu parte` : "Pagaste tú") : e.paid_by_name ? `Pagó ${e.paid_by_name}` : null,
      pending: e.date > today,
    });
  }

  for (const i of data.installments) {
    list.push({
      key: `c-${i.id}`,
      source: "cuota",
      kind: "expense",
      date: i.due_date,
      description: i.description,
      category: "Cuotas",
      cents: toCents(i.amount),
      method: methodOf(i.card_id),
      cardId: i.card_id,
      detail: `Cuota ${i.number} de ${i.count}`,
      pending: i.due_date > today,
    });
  }

  for (const e of data.entries) {
    list.push({
      key: `p-${e.id}`,
      source: "personal",
      kind: e.kind,
      date: e.entry_date,
      description: e.description,
      category: e.kind === "expense" ? e.category : e.kind === "income" ? "Ingreso" : "Ahorro",
      cents: toCents(e.amount),
      method: e.kind === "expense" ? methodOf(e.card_id) : "—",
      cardId: e.card_id,
      detail: null,
      entryId: e.id,
      pending: e.entry_date > today,
    });
  }

  return list.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

export const inPeriod = (list: Movement[], period: Period) => list.filter((m) => m.date >= period.from && m.date <= period.to);

// ---------- Resumen ----------

export type Summary = {
  incomeCents: number;
  spentCents: number;
  savedCents: number;
  leftCents: number;
  /** Lo que querías ahorrar en el período (meta mensual × meses que ya empezaron). */
  goalCents: number;
  count: number;
  avgPerDayCents: number;
  biggest: Movement | null;
};

export function summarize(list: Movement[], plan: Plan | null, period: Period, today: string): Summary {
  const sum = (kind: EntryKind) => list.filter((m) => m.kind === kind).reduce((s, m) => s + m.cents, 0);
  const spentCents = sum("expense");
  const savedCents = sum("saving");
  const incomeCents = toCents(plan?.monthly_income ?? 0) * period.elapsed + sum("income");
  const expenses = list.filter((m) => m.kind === "expense");
  // Promedio por día: días transcurridos del período hasta hoy.
  const end = period.to < today ? period.to : today;
  const days = Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86400000) + 1);
  return {
    incomeCents,
    spentCents,
    savedCents,
    leftCents: incomeCents - spentCents - savedCents,
    goalCents: toCents(plan?.monthly_saving_goal ?? 0) * period.elapsed,
    count: expenses.length,
    avgPerDayCents: Math.round(spentCents / days),
    biggest: expenses.reduce<Movement | null>((top, m) => (!top || m.cents > top.cents ? m : top), null),
  };
}

/** Lo ahorrado hasta hoy: lo que indicaste en tu plan más lo que apartaste desde entonces. */
export function totalSavedCents(plan: Plan | null, data: MisCuentasData): number {
  if (!plan) return data.entries.filter((e) => e.kind === "saving").reduce((s, e) => s + toCents(e.amount), 0);
  const since = Date.parse(plan.savings_updated_at);
  const after = data.entries.filter((e) => e.kind === "saving" && Date.parse(e.created_at) > since).reduce((s, e) => s + toCents(e.amount), 0);
  return toCents(plan.savings_amount) + after;
}

/**
 * Lo que hay hoy en la cuenta: lo que indicaste más lo que pasó desde entonces
 * (ingresos que sumas; gastos y dinero apartado para ahorrar que restas). Nulo si aún no lo indicaste.
 */
export function accountBalanceCents(plan: Plan | null, data: MisCuentasData, today: string): number | null {
  if (!plan || plan.account_amount == null || !plan.account_updated_at) return null;
  const since = Date.parse(plan.account_updated_at);
  const d = new Date(since);
  const sinceDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let cents = toCents(plan.account_amount);
  for (const e of data.entries) {
    // Los movimientos propios se comparan con la hora exacta en que los anotaste.
    if (Date.parse(e.created_at) <= since || e.entry_date > today) continue;
    cents += e.kind === "income" ? toCents(e.amount) : -toCents(e.amount);
  }
  for (const e of data.shared) if (e.date > sinceDate && e.date <= today) cents -= toCents(e.amount);
  for (const i of data.installments) if (i.due_date > sinceDate && i.due_date <= today) cents -= toCents(i.amount);
  return cents;
}

// ---------- Gráficos ----------

export type Slice = { label: string; cents: number };

/** Gastos agrupados (por categoría o por forma de pago), de mayor a menor. */
export function breakdown(list: Movement[], by: (m: Movement) => string): Slice[] {
  const map = new Map<string, number>();
  for (const m of list) if (m.kind === "expense") map.set(by(m), (map.get(by(m)) ?? 0) + m.cents);
  return [...map.entries()].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);
}

/** Deja las `max` mayores y agrupa el resto en «Otras». */
export function topSlices(slices: Slice[], max: number): Slice[] {
  if (slices.length <= max) return slices;
  const rest = slices.slice(max - 1).reduce((s, x) => s + x.cents, 0);
  return [...slices.slice(0, max - 1), { label: "Otras", cents: rest }];
}

export type Bucket = { key: string; label: string; cents: number; incomeCents: number | null };

/** Gasto por mes (si el período abarca varios) o por día (si es un solo mes). */
export function buckets(list: Movement[], plan: Plan | null, period: Period): Bucket[] {
  const expenses = list.filter((m) => m.kind === "expense");
  if (period.months.length > 1) {
    return period.months.map((m, index) => {
      const extra = list.filter((x) => x.kind === "income" && monthOf(x.date) === m).reduce((s, x) => s + x.cents, 0);
      return {
        key: m,
        label: monthName(m, false).replace(".", ""),
        cents: expenses.filter((x) => monthOf(x.date) === m).reduce((s, x) => s + x.cents, 0),
        incomeCents: index < period.elapsed ? toCents(plan?.monthly_income ?? 0) + extra : null,
      };
    });
  }
  const month = period.months[0];
  return Array.from({ length: daysIn(month) }, (_, i) => {
    const date = `${month}-${pad(i + 1)}`;
    return { key: date, label: String(i + 1), cents: expenses.filter((x) => x.date === date).reduce((s, x) => s + x.cents, 0), incomeCents: null };
  });
}

// ---------- Descarga ----------

const KIND_LABEL: Record<EntryKind, string> = { expense: "Gasto", income: "Ingreso", saving: "Ahorro" };
const SOURCE_LABEL = { compartido: "Gasto compartido", cuota: "Cuota de tarjeta", personal: "Personal" } as const;

/** CSV para Excel (separado por «;», con BOM para que se vean bien los acentos). */
export function movementsCsv(list: Movement[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["Fecha", "Concepto", "Tipo", "Categoría", "Forma de pago", "Importe", "Origen", "Detalle"].join(";"),
    ...list.map((m) =>
      [
        m.date.split("-").reverse().join("/"),
        escape(m.description),
        KIND_LABEL[m.kind],
        escape(m.category),
        escape(m.method),
        (((m.kind === "expense" ? -m.cents : m.cents) / 100).toFixed(2)).replace(".", ","),
        SOURCE_LABEL[m.source],
        escape(m.detail ?? ""),
      ]
        .join(";"),
    ),
  ];
  return "﻿" + lines.join("\n");
}
