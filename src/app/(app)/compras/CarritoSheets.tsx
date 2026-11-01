"use client";

import { useState } from "react";
import { ChevronDown, ReceiptText, Undo2 } from "lucide-react";
import { formatEUR, parseAmount, toCents } from "@/lib/gastos/money";
import { monthName } from "@/lib/personal/compute";
import { groupByMonth, type ShoppingPurchase, type ShoppingPurchaseItem } from "@/lib/compras/historial";
import { cardLabel } from "@/lib/tarjetas/labels";
import { formatDate } from "../gastos/types";
import { sendShoppingPurchaseToExpenses } from "./actions";
import type { Item, Member } from "./ShoppingList";

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const STORES = ["Mercadona", "Consum", "Dia", "Carrefour", "Lidl", "Aldi"];

export type CardOption = { id: string; name: string; last4: string | null };

/** Terminar la compra: detalle del carrito, precio total y tienda. */
export function FinishPane({
  cart,
  leftover,
  onUncart,
  onFinish,
}: {
  cart: Item[];
  /** Productos de «Para el súper» que no se tacharon: vuelven a la lista. */
  leftover: number;
  onUncart: (item: Item) => void;
  onFinish: (totalEuros: number, store: string) => Promise<void>;
}) {
  const [total, setTotal] = useState("");
  const [store, setStore] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = parseAmount(total);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount === null || busy) return;
    setBusy(true);
    await onFinish(amount, store.trim());
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {cart.map((i) => (
          <li key={i.id} className="flex min-h-11 items-center gap-2 pl-3 pr-1 text-[15px]">
            <span className="min-w-0 flex-1 truncate">
              {i.name}
              {i.quantity && <span className="text-xs text-ink-soft"> · {i.quantity}</span>}
            </span>
            <button
              type="button"
              onClick={() => onUncart(i)}
              aria-label={`Devolver «${i.name}» a la lista`}
              className="flex size-11 shrink-0 items-center justify-center text-ink-soft"
            >
              <Undo2 size={18} />
            </button>
          </li>
        ))}
      </ul>

      <div>
        <label htmlFor="f-total" className="mb-1 block text-sm font-medium">
          Precio total
        </label>
        <input
          id="f-total"
          className={field}
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          inputMode="decimal"
          placeholder="0,00 €"
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="f-store" className="mb-1 block text-sm font-medium">
          Tienda <span className="font-normal text-ink-soft">(opcional)</span>
        </label>
        <input id="f-store" className={field} value={store} onChange={(e) => setStore(e.target.value)} list="finish-stores" autoComplete="off" />
        <datalist id="finish-stores">
          {STORES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      {leftover > 0 && (
        <p className="text-sm text-ink-soft">
          {leftover === 1 ? "1 producto sin tachar vuelve" : `${leftover} productos sin tachar vuelven`} a la lista.
        </p>
      )}

      <button
        disabled={amount === null || busy}
        className="min-h-12 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-40"
      >
        {busy ? "Guardando…" : "Terminar compra"}
      </button>
    </form>
  );
}

/** Historial de compras terminadas, con su detalle y el envío a Gastos compartidos. */
export function HistoryPane({
  purchases,
  items,
  cards,
  members,
  userId,
  onSent,
}: {
  purchases: ShoppingPurchase[];
  items: ShoppingPurchaseItem[];
  cards: CardOption[];
  members: Member[];
  userId: string;
  onSent: (purchaseId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (purchases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center">
        <ReceiptText className="mx-auto text-forest" size={32} strokeWidth={1.5} />
        <p className="mt-2 font-display text-lg font-bold">Aún no hay compras</p>
        <p className="mt-1 text-sm text-ink-soft">Tacha productos en el súper y toca «Terminar compra».</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groupByMonth(purchases).map(([month, list]) => (
        <section key={month}>
          <h3 className="mb-1 flex items-baseline justify-between px-1 text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            <span>
              {monthName(month)}
            </span>
            <span>{formatEUR(list.reduce((s, p) => s + toCents(Number(p.total_amount)), 0))}</span>
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {list.map((p) => {
              const rows = items.filter((i) => i.purchase_id === p.id);
              const open = openId === p.id;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setOpenId(open ? null : p.id)}
                    aria-expanded={open}
                    className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{p.store || "Compra del súper"}</span>
                      <span className="block truncate text-xs text-ink-soft">
                        {formatDate(p.purchased_on)} · {rows.length === 1 ? "1 producto" : `${rows.length} productos`}
                        {p.expense_id ? " · en Gastos" : ""}
                      </span>
                    </span>
                    <span className="text-[15px] font-medium">{formatEUR(toCents(Number(p.total_amount)))}</span>
                    <ChevronDown size={18} className={`shrink-0 text-ink-soft transition ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="border-t border-line bg-background/50 px-3 py-3">
                      <ul className="flex flex-col gap-1 text-sm">
                        {rows.map((i) => (
                          <li key={i.id} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate">{i.name}</span>
                            {i.quantity && <span className="shrink-0 text-ink-soft">{i.quantity}</span>}
                          </li>
                        ))}
                      </ul>
                      {!p.expense_id && <SendBlock purchase={p} cards={cards} members={members} userId={userId} onSent={onSent} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SendBlock({
  purchase,
  cards,
  members,
  userId,
  onSent,
}: {
  purchase: ShoppingPurchase;
  cards: CardOption[];
  members: Member[];
  userId: string;
  onSent: (purchaseId: string) => void;
}) {
  const [card, setCard] = useState("");
  const [payer, setPayer] = useState(userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    const result = await sendShoppingPurchaseToExpenses(purchase.id, card || null, payer);
    setBusy(false);
    if (result.ok) onSent(purchase.id);
    else setError(result.message);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-sm font-medium">Pasar a Gastos compartidos</p>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-ink-soft">Pagado con</span>
          <select className={field} value={card} onChange={(e) => setCard(e.target.value)}>
            <option value="">Efectivo / otro</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {cardLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-ink-soft">Pagó</span>
          <select className={field} value={payer} onChange={(e) => setPayer(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === userId ? "Yo" : m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-ink-soft">Se reparte a partes iguales entre los dos.</p>
      {error && <p className="text-sm text-hanko">{error}</p>}
      <button
        onClick={send}
        disabled={busy}
        className="min-h-11 rounded-xl bg-forest px-4 text-sm font-medium text-surface transition active:scale-95 disabled:opacity-40"
      >
        {busy ? "Enviando…" : "Pasar a Gastos"}
      </button>
    </div>
  );
}
