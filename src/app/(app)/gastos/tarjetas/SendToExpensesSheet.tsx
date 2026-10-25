"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { colorFor } from "@/lib/compras/icons";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { financedCents } from "@/lib/tarjetas/installments";
import { cardLabel } from "@/lib/tarjetas/labels";
import { formatDate } from "../types";
import type { Card, Person, Purchase, Share } from "./types";

type Props = {
  purchase: Purchase | null;
  card: Card | undefined;
  people: Person[];
  shares: Share[];
  userId: string;
  sending: boolean;
  message: string;
  onClose: () => void;
  onConfirm: (category: string) => void;
};

export function SendToExpensesSheet(props: Props) {
  return (
    <BottomSheet open={!!props.purchase} onClose={props.onClose} title="Agregar a Gastos compartidos">
      {props.purchase && <SendForm key={props.purchase.id} {...props} purchase={props.purchase} />}
    </BottomSheet>
  );
}

function SendForm({ purchase, card, people, shares, userId, sending, message, onConfirm }: Props & { purchase: Purchase }) {
  const [category, setCategory] = useState("Otros");

  const total = financedCents(toCents(purchase.total_amount), purchase.interest_percent);
  const nameOf = (id: string) => (id === userId ? "Tú" : (people.find((p) => p.id === id)?.name ?? "Alguien"));
  const payer = card?.owner_user_id ? nameOf(card.owner_user_id) : null;

  const rows: [string, string][] = [
    ["Concepto", purchase.merchant ? `${purchase.description} · ${purchase.merchant}` : purchase.description],
    ["Importe", `${formatEUR(total)}${purchase.interest_percent > 0 ? " (con interés)" : ""}`],
    ["Fecha", formatDate(purchase.purchase_date)],
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
      <p className="-mt-1 text-sm text-ink-soft">Se copian todos los datos de la compra. Solo falta elegir la categoría.</p>

      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
            <dt className="shrink-0 text-ink-soft">{term}</dt>
            <dd className="min-w-0 text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

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
        Las cuotas y el interés quedan anotados en el gasto. Si luego lo eliminas de Gastos, podrás volver a enviarlo desde aquí.
      </p>

      {message && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{message}</p>
      )}

      <button
        onClick={() => onConfirm(category)}
        disabled={sending}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {sending ? "Agregando…" : "Agregar a Gastos compartidos"}
      </button>
    </div>
  );
}
