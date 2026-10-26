const toCents = (amount: number) => Math.round(amount * 100);

export type DepositRow = {
  id: string;
  card_id: string;
  amount: number;
  deposit_date: string;
  deposited_by: string | null;
  note: string | null;
  created_at: string;
};

export type CardExpenseRow = {
  id: string;
  card_id: string | null;
  description: string;
  amount: number;
  expense_date: string;
  paid_by: string | null;
  created_at: string;
};

/** Cuánto le toca a un participante de un gasto. */
export type CardExpenseSplit = { expense_id: string; participant_id: string; amount: number };

/** Saldo de una tarjeta de débito en céntimos: lo inicial más los ingresos, menos los gastos pagados con ella. */
export function debitBalanceCents(
  initialBalance: number,
  deposits: { amount: number }[],
  expenses: { amount: number }[],
): number {
  const deposited = deposits.reduce((sum, d) => sum + toCents(d.amount), 0);
  const spent = expenses.reduce((sum, e) => sum + toCents(e.amount), 0);
  return toCents(initialBalance) + deposited - spent;
}

/** Cuánto ha puesto cada persona (id de usuario) en la tarjeta, en céntimos. */
export function contributionsByPerson(deposits: { amount: number; deposited_by: string | null }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const d of deposits) {
    const key = d.deposited_by ?? "";
    result[key] = (result[key] ?? 0) + toCents(d.amount);
  }
  return result;
}

export type Movement = {
  key: string;
  kind: "deposit" | "expense";
  date: string;
  created: string;
  /** Positivo si entra dinero, negativo si sale. */
  cents: number;
  title: string;
  who: string;
};

/** Ingresos y gastos de una tarjeta mezclados, del más reciente al más antiguo. */
export function buildMovements(
  deposits: DepositRow[],
  expenses: CardExpenseRow[],
  names: { user: (id: string | null) => string; participant: (id: string | null) => string },
): Movement[] {
  const rows: Movement[] = [
    ...deposits.map<Movement>((d) => ({
      key: `d-${d.id}`,
      kind: "deposit",
      date: d.deposit_date,
      created: d.created_at,
      cents: toCents(d.amount),
      title: d.note?.trim() || "Ingreso",
      who: names.user(d.deposited_by),
    })),
    ...expenses.map<Movement>((e) => ({
      key: `e-${e.id}`,
      kind: "expense",
      date: e.expense_date,
      created: e.created_at,
      cents: -toCents(e.amount),
      title: e.description,
      who: names.participant(e.paid_by),
    })),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
}
