import type { Fixed, FixedEntry } from "@/lib/fijos/schedule";

export type Plan = {
  monthly_income: number;
  pay_day: number | null;
  savings_amount: number;
  savings_updated_at: string;
  /** Lo que había en la cuenta cuando lo indicaste; nulo si aún no lo hiciste. */
  account_amount: number | null;
  account_updated_at: string | null;
  monthly_saving_goal: number;
  saving_target: number;
};

export type EntryKind = "expense" | "income" | "saving";

/** Movimiento propio guardado en «Mis cuentas» (privado). */
export type PersonalEntry = {
  id: string;
  kind: EntryKind;
  description: string;
  amount: number;
  entry_date: string;
  category: string;
  card_id: string | null;
  /** Tarjeta privada con la que se pagó (o en la que entró el dinero). */
  personal_card_id: string | null;
  created_at: string;
};

/** Tarjeta del hogar que puedes usar al anotar un movimiento (si eres titular o es compartida). */
export type CardRef = { id: string; name: string; last4: string | null; kind: "credit" | "debit"; color: string; owner_user_id: string | null };

/** Tarjeta privada: solo la ves tú. */
export type PersonalCard = {
  id: string;
  name: string;
  last4: string | null;
  color: string;
  kind: "credit" | "debit";
  closing_day: number | null;
  due_day: number | null;
  initial_balance: number;
};

/** Gasto fijo individual (gimnasio, móvil…). */
export type PersonalFixed = {
  id: string;
  name: string;
  category: string;
  amount: number;
  every_months: number;
  start_month: string;
  due_day: number | null;
  card_id: string | null;
  personal_card_id: string | null;
};

/** Qué parte de un fijo del hogar cuenta en tu presupuesto. Sin fila = la mitad. */
export type FixedShare = { fixed_id: string; percent: number };

export type Budget = { category: string; monthly_limit: number };

export const DEFAULT_SHARE_PERCENT = 50;

/** Gasto compartido en el que participas: `amount` es solo tu parte. */
export type SharedRow = {
  id: string;
  description: string;
  /** Tu parte, en euros. */
  amount: number;
  total: number;
  date: string;
  category: string;
  card_id: string | null;
  paid_by_name: string | null;
  paid_by_me: boolean;
};

/** Cuota de una compra con tarjeta que te toca pagar (tu parte ya calculada, en euros). */
export type InstallmentRow = {
  id: string;
  description: string;
  card_id: string;
  number: number;
  count: number;
  due_date: string;
  amount: number;
};

export type MisCuentasData = {
  plan: Plan | null;
  entries: PersonalEntry[];
  shared: SharedRow[];
  installments: InstallmentRow[];
  cards: CardRef[];
  personalCards: PersonalCard[];
  personalFixed: PersonalFixed[];
  /** Gastos fijos del hogar (para contar tu parte en el presupuesto). */
  householdFixed: Fixed[];
  fixedEntries: FixedEntry[];
  fixedShares: FixedShare[];
  budgets: Budget[];
};

export type Movement = {
  key: string;
  source: "compartido" | "personal" | "cuota" | "fijo";
  kind: EntryKind;
  date: string;
  description: string;
  category: string;
  cents: number;
  /** «Efectivo» o el nombre de la tarjeta. */
  method: string;
  cardId: string | null;
  personalCardId: string | null;
  detail: string | null;
  /** Solo en movimientos propios: permite editarlos o borrarlos. */
  entryId?: string;
  /** Aún no llegó su fecha (por ejemplo, una cuota futura). */
  pending: boolean;
};
