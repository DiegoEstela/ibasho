export type Participant = { id: string; user_id: string | null; name: string; color: string };
// paid_by nulo = pagado desde una tarjeta compartida: no genera deudas entre las personas.
export type ExpenseRow = { id: string; paid_by: string | null; amount: number };
export type SplitRow = { expense_id: string; participant_id: string; amount: number };
export type SettlementRow = { from_participant: string; to_participant: string; amount: number };
export type Transfer = { from: string; to: string; cents: number };

const cents = (n: number) => Math.round(n * 100);

/** Saldo de cada participante en céntimos: positivo = le deben, negativo = debe. */
export function netBalances(
  participants: Participant[],
  expenses: ExpenseRow[],
  splits: SplitRow[],
  settlements: SettlementRow[],
): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries(participants.map((p) => [p.id, 0]));
  const add = (id: string, value: number) => {
    net[id] = (net[id] ?? 0) + value;
  };

  // Solo cuentan los gastos con pagador: los de una tarjeta compartida no crean deudas.
  const withPayer = expenses.filter((e): e is ExpenseRow & { paid_by: string } => e.paid_by !== null);
  const paidBy = new Map(withPayer.map((e) => [e.id, e.paid_by]));
  for (const e of withPayer) add(e.paid_by, cents(e.amount));
  for (const s of splits) if (paidBy.has(s.expense_id)) add(s.participant_id, -cents(s.amount));

  // Quien paga una deuda mejora su saldo; quien la recibe lo reduce.
  for (const s of settlements) {
    add(s.from_participant, cents(s.amount));
    add(s.to_participant, -cents(s.amount));
  }
  return net;
}

/** Simplifica las deudas al mínimo de transferencias (emparejando mayor deudor con mayor acreedor). */
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].left, creditors[c].left);
    if (amount > 0) transfers.push({ from: debtors[d].id, to: creditors[c].id, cents: amount });
    debtors[d].left -= amount;
    creditors[c].left -= amount;
    if (debtors[d].left === 0) d++;
    if (creditors[c].left === 0) c++;
  }
  return transfers;
}
