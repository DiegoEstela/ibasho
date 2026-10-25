"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { colorFor } from "@/lib/compras/icons";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { cardLabel } from "@/lib/tarjetas/labels";
import { formatDate } from "../types";
import type { Card, Installment, Person, Purchase, Share } from "./types";

type Props = {
  installment: Installment | null;
  purchase: Purchase | undefined;
  card: Card | undefined;
  people: Person[];
  shares: Share[];
  userId: string;
  /** Hoy ("aaaa-mm-dd"): una cuota que aún no vence se registra con la fecha de hoy por defecto. */
  today: string;
  sending: boolean;
  message: string;
  onClose: () => void;
  onConfirm: (category: string, date: string) => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none focus:border-forest";

export function SendToExpensesSheet(props: Props) {
  const { installment, purchase } = props;
  return (
    <BottomSheet open={!!installment && !!purchase} onClose={props.onClose} title="Agregar cuota a Gastos">
      {installment && purchase && <SendForm key={installment.id} {...props} installment={installment} purchase={purchase} />}
    </BottomSheet>
  );
}

function SendForm({
  installment,
  purchase,
  card,
  people,
  shares,
  userId,
  today,
  sending,
  message,
  onConfirm,
}: Props & { installment: Installment; purchase: Purchase }) {
  const [category, setCategory] = useState("Otros");
  const [date, setDate] = useState(installment.due_date <= today ? installment.due_date : today);

  const nameOf = (id: string) => (id === userId ? "Tú" : (people.find((p) => p.id === id)?.name ?? "Alguien"));
  const payer = card?.owner_user_id ? nameOf(card.owner_user_id) : null;
  const count = purchase.installments_count;
  const label = count === 1 ? "pago único" : `cuota ${installment.number}/${count}`;
  const base = purchase.merchant ? `${purchase.description} · ${purchase.merchant}` : purchase.description;

  const rows: [string, string][] = [
    ["Concepto", `${base} · ${label}`],
    ["Importe", formatEUR(toCents(installment.amount))],
    ["Vence", formatDate(installment.due_date)],
    ["Tarjeta", card ? cardLabel(card) : "—"],
    ["Pagó", payer ?? "Cuenta compartida · no crea deudas"],
    [
      "Reparto",
      shares
        .filter((s) => Number(s.percent) > 0)
        .map((s) => `${nameOf(s.user_id)} ${String(s.percent).replace(".", ",")} %`)
        .join(" · "),
    ],
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="-mt-1 text-sm text-ink-soft">
        Se registra solo esta cuota, con los datos de la compra. Elige la categoría y el día en que la pagaste.
      </p>

      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
            <dt className="shrink-0 text-ink-soft">{term}</dt>
            <dd className="min-w-0 text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-soft" htmlFor="s-date">Fecha del gasto</label>
        <input id="s-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-soft">Categoría</p>
        <div className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((c) => {
            const selected = c.name === category;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setCategory(c.name)}
                aria-pressed={selected}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  selected ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <CatIcon name={c.icon} size={14} style={{ color: colorFor(c.color) }} /> {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-ink-soft">
        Si luego eliminas ese gasto desde Gastos, la cuota vuelve a quedar disponible para enviarla otra vez.
      </p>

      {message && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{message}</p>}

      <button
        onClick={() => date && onConfirm(category, date)}
        disabled={sending || !date}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {sending ? "Agregando…" : "Agregar a Gastos compartidos"}
      </button>
    </div>
  );
}
