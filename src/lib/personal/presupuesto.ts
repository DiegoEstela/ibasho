import { toCents } from "@/lib/gastos/money";
import type { MisCuentasData, Movement } from "./types";

export type BudgetMonth = {
  month: string;
  incomeCents: number;
  /** Tus fijos individuales. */
  ownFixedCents: number;
  /** Tu parte de los fijos del hogar que aún no se pasaron a Gastos. */
  householdFixedCents: number;
  /** Tus cuotas de tarjeta. */
  installmentsCents: number;
  /** Gastos compartidos (tu parte) y gastos propios sueltos. */
  otherCents: number;
  /** Lo ya gastado y lo que todavía no llegó (por fecha). */
  doneCents: number;
  upcomingCents: number;
  spentCents: number;
  savingCents: number;
  leftCents: number;
};

/** El presupuesto de un mes: lo que entra, lo comprometido y lo que te queda para vivir. */
export function budgetFor(data: MisCuentasData, all: Movement[], month: string): BudgetMonth {
  const inMonth = all.filter((m) => m.date.slice(0, 7) === month);
  const expenses = inMonth.filter((m) => m.kind === "expense");
  const sum = (list: Movement[]) => list.reduce((s, m) => s + m.cents, 0);

  const ownFixedCents = sum(expenses.filter((m) => m.source === "fijo" && m.key.startsWith("f-")));
  const householdFixedCents = sum(expenses.filter((m) => m.source === "fijo" && m.key.startsWith("h-")));
  const installmentsCents = sum(expenses.filter((m) => m.source === "cuota"));
  const spentCents = sum(expenses);

  const incomeCents = toCents(data.plan?.monthly_income ?? 0) + sum(inMonth.filter((m) => m.kind === "income"));
  // Lo que apartas: la meta mensual, o más si ya apartaste más ese mes.
  const savingCents = Math.max(toCents(data.plan?.monthly_saving_goal ?? 0), sum(inMonth.filter((m) => m.kind === "saving")));

  return {
    month,
    incomeCents,
    ownFixedCents,
    householdFixedCents,
    installmentsCents,
    otherCents: spentCents - ownFixedCents - householdFixedCents - installmentsCents,
    doneCents: sum(expenses.filter((m) => !m.pending)),
    upcomingCents: sum(expenses.filter((m) => m.pending)),
    spentCents,
    savingCents,
    leftCents: incomeCents - spentCents - savingCents,
  };
}

export type CategoryUse = { category: string; spentCents: number; limitCents: number };

/** Lo gastado en el mes por categoría, junto al tope si lo hay (primero las que tienen tope). */
export function categoryUse(data: MisCuentasData, all: Movement[], month: string): CategoryUse[] {
  const spent = new Map<string, number>();
  for (const m of all) if (m.kind === "expense" && m.date.slice(0, 7) === month) spent.set(m.category, (spent.get(m.category) ?? 0) + m.cents);
  const limits = new Map(data.budgets.map((b) => [b.category, toCents(b.monthly_limit)]));
  const categories = new Set([...spent.keys(), ...limits.keys()]);
  return [...categories]
    .map((category) => ({ category, spentCents: spent.get(category) ?? 0, limitCents: limits.get(category) ?? 0 }))
    .sort((a, b) => Number(b.limitCents > 0) - Number(a.limitCents > 0) || b.spentCents - a.spentCents);
}

export type CardTile = {
  key: string;
  id: string;
  name: string;
  last4: string | null;
  color: string;
  kind: "credit" | "debit";
  isPrivate: boolean;
  /** Gastado este mes con esta tarjeta (incluye lo que aún no llegó). */
  monthCents: number;
  /** Solo débito privada: dinero que queda. */
  balanceCents: number | null;
  dueDay: number | null;
};

/** Una ficha por tarjeta: las privadas y las del hogar que puedes usar. */
export function cardTiles(data: MisCuentasData, all: Movement[], today: string): CardTile[] {
  const month = today.slice(0, 7);
  const monthSpent = (match: (m: Movement) => boolean) =>
    all.filter((m) => m.kind === "expense" && m.date.slice(0, 7) === month && match(m)).reduce((s, m) => s + m.cents, 0);

  const own: CardTile[] = data.personalCards.map((c) => {
    let balance: number | null = null;
    if (c.kind === "debit") {
      balance = toCents(c.initial_balance);
      for (const m of all) {
        if (m.personalCardId !== c.id || m.pending) continue;
        balance += m.kind === "income" ? m.cents : -m.cents;
      }
    }
    return {
      key: `p-${c.id}`,
      id: c.id,
      name: c.name,
      last4: c.last4,
      color: c.color,
      kind: c.kind,
      isPrivate: true,
      monthCents: monthSpent((m) => m.personalCardId === c.id),
      balanceCents: balance,
      dueDay: c.due_day,
    };
  });

  const shared: CardTile[] = data.cards.map((c) => ({
    key: `c-${c.id}`,
    id: c.id,
    name: c.name,
    last4: c.last4,
    color: c.color,
    kind: c.kind,
    isPrivate: false,
    monthCents: monthSpent((m) => m.cardId === c.id),
    balanceCents: null,
    dueDay: null,
  }));

  return [...own, ...shared];
}

/** CSV del presupuesto de un mes para Excel (separado por «;», con BOM). */
export function budgetCsv(b: BudgetMonth, categories: CategoryUse[], monthLabel: string): string {
  const eur = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["Presupuesto", q(monthLabel)].join(";"),
    "",
    ["Concepto", "Importe"].join(";"),
    ["Ingresos", eur(b.incomeCents)].join(";"),
    ["Mis gastos fijos", eur(-b.ownFixedCents)].join(";"),
    ["Mi parte de los fijos del hogar", eur(-b.householdFixedCents)].join(";"),
    ["Mis cuotas de tarjeta", eur(-b.installmentsCents)].join(";"),
    ["Otros gastos", eur(-b.otherCents)].join(";"),
    ["Ahorro", eur(-b.savingCents)].join(";"),
    ["Te queda", eur(b.leftCents)].join(";"),
    "",
    ["Categoría", "Gastado", "Tope"].join(";"),
    ...categories.map((c) => [q(c.category), eur(c.spentCents), c.limitCents ? eur(c.limitCents) : ""].join(";")),
  ];
  return "﻿" + lines.join("\n");
}
