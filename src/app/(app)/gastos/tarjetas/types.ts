export type Card = {
  id: string;
  name: string;
  last4: string | null;
  color: string;
  kind: "credit" | "debit";
  /** Titular; nulo = tarjeta compartida entre las personas del hogar. */
  owner_user_id: string | null;
  closing_day: number | null;
  /** Solo las de crédito tienen día de pago. */
  due_day: number | null;
  initial_balance: number;
  archived: boolean;
};

export type { DepositRow as CardDeposit, CardExpenseRow } from "@/lib/tarjetas/debit";

export type Purchase = {
  id: string;
  card_id: string;
  description: string;
  merchant: string | null;
  purchase_date: string;
  total_amount: number;
  interest_percent: number;
  installments_count: number;
  expense_id: string | null;
  notes: string | null;
  created_at: string;
};

export type Share = { purchase_id: string; user_id: string; percent: number };

export type Installment = {
  id: string;
  purchase_id: string;
  number: number;
  due_date: string;
  amount: number;
  manual_paid: boolean | null;
};

/** Persona del hogar (con o sin perfil completo). */
export type Person = { id: string; name: string; color: string };
