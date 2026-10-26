"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { colorFor } from "@/lib/compras/icons";
import { useProfile } from "@/components/profile/ProfileProvider";
import { createClient } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push/client";
import { cardLabel } from "@/lib/tarjetas/labels";
import type { Participant } from "@/lib/gastos/balance";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { CURRENCIES, formatMoney, parseRate, toEuroCents } from "@/lib/gastos/currency";
import { evenPercents, formatEUR, parseAmount, splitByPercent, splitEqual, toCents } from "@/lib/gastos/money";
import { fetchRate } from "../viajes/[id]/actions";
import { formatDate, type Expense, type Split } from "./types";

type Mode = "equal" | "percent" | "exact";

/** Lo mínimo de una tarjeta para elegirla al pagar. */
export type PayCard = { id: string; name: string; last4: string | null; kind: "credit" | "debit"; owner_user_id: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  participants: Participant[];
  meId: string | null;
  /** Tarjetas registradas; solo se puede pagar con una de ellas. */
  cards: PayCard[];
  /** Solo en gastos de viaje: activa las otras monedas y oculta las tarjetas. `currency` es la del destino. */
  trip?: { currency: string } | null;
  /** Gasto que se edita; null para crear uno nuevo. */
  expense: Expense | null;
  splits: Split[];
  onSaved: () => void;
  onDelete: (expense: Expense) => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function ExpenseSheet(props: Props) {
  const { open, onClose, expense } = props;
  return (
    <BottomSheet open={open} onClose={onClose} title={expense ? "Editar gasto" : "Nuevo gasto"}>
      {open && <ExpenseForm key={expense?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function ExpenseForm({ groupId, participants, meId, cards, trip, expense, splits, onSaved, onDelete }: Props) {
  const profile = useProfile();
  const ids = participants.map((p) => p.id);

  // Si el gasto ya existe, deduce cómo se repartió para mostrarlo igual.
  const initial = (() => {
    if (!expense) return { mode: "equal" as Mode, included: new Set(ids), exacts: {} as Record<string, string> };
    const mine = splits.filter((s) => s.expense_id === expense.id);
    const includedIds = mine.filter((s) => s.amount > 0).map((s) => s.participant_id);
    const total = toCents(expense.amount);
    const expected = splitEqual(total, includedIds);
    const isEqual = mine.every((s) => (expected[s.participant_id] ?? 0) === toCents(s.amount));
    return {
      mode: (isEqual ? "equal" : "exact") as Mode,
      included: new Set(includedIds),
      exacts: Object.fromEntries(mine.map((s) => [s.participant_id, String(s.amount).replace(".", ",")])),
    };
  })();

  const [description, setDescription] = useState(expense?.description ?? "");
  const [currency, setCurrency] = useState(expense?.currency ?? trip?.currency ?? "EUR");
  const [amountText, setAmountText] = useState(
    expense ? String(expense.currency !== "EUR" && expense.original_amount ? expense.original_amount : expense.amount).replace(".", ",") : "",
  );
  const [rateText, setRateText] = useState(expense?.exchange_rate ? String(expense.exchange_rate).replace(".", ",") : "");
  const [rateNote, setRateNote] = useState("");
  const [fetchingRate, setFetchingRate] = useState(false);
  const [date, setDate] = useState(expense?.expense_date ?? todayISO());
  const [category, setCategory] = useState(expense?.category ?? "Supermercado");
  const [cardId, setCardId] = useState(expense?.card_id ?? "");
  // "" = sin pagador (sale de una tarjeta compartida); solo se usa con una tarjeta sin titular.
  const [paidBy, setPaidBy] = useState(expense ? (expense.paid_by ?? "") : (meId ?? ids[0] ?? ""));
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [included, setIncluded] = useState<Set<string>>(initial.included);
  const [percents, setPercents] = useState<Record<string, string>>(() => evenPercents(ids));
  const [exacts, setExacts] = useState<Record<string, string>>(initial.exacts);
  const [error, setError] = useState("");
  // El error se muestra dentro del formulario (silent); al guardar, React Query actualiza las pantallas abiertas.
  const save = useMutation({
    mutationFn: async (args: Record<string, unknown>) => {
      const { error: rpcError } = await createClient().rpc("save_expense", args);
      if (rpcError) throw new Error(rpcError.message);
    },
    meta: { silent: true },
  });
  const saving = save.isPending;

  const card = cards.find((c) => c.id === cardId);
  // Una tarjeta sin titular es de los dos: el dinero sale de la cuenta común y no hay un "pagador".
  const sharedCard = !!card && card.owner_user_id === null;
  // En el hogar (dos personas) una tarjeta compartida nunca tiene pagador; en un viaje, con amigos de por medio, se puede elegir.
  const forcedPool = sharedCard && !trip;

  function chooseCard(id: string) {
    setCardId(id);
    const chosen = cards.find((c) => c.id === id);
    const owner = chosen?.owner_user_id ? participants.find((p) => p.user_id === chosen.owner_user_id) : undefined;
    if (owner) setPaidBy(owner.id);
    else if (chosen && trip) setPaidBy(""); // tarjeta compartida en un viaje: por defecto, sin pagador
    else if (!paidBy) setPaidBy(meId ?? ids[0] ?? "");
  }

  // Otra moneda: se escribe el importe en esa moneda y se convierte a euros con la cotización.
  const foreign = !!trip && currency !== "EUR";
  const typed = parseAmount(amountText);
  const rate = parseRate(rateText);
  const amount = foreign ? (typed && rate ? toEuroCents(typed, rate) / 100 : null) : typed;
  const totalCents = amount ? toCents(amount) : 0;

  const currencyOptions = [
    "EUR",
    ...(trip && trip.currency !== "EUR" ? [trip.currency] : []),
    ...CURRENCIES.map((c) => c.code).filter((c) => c !== "EUR" && c !== trip?.currency),
    ...(currency !== "EUR" && !CURRENCIES.some((c) => c.code === currency) && currency !== trip?.currency ? [currency] : []),
  ];

  async function loadRate(code: string, on: string) {
    setFetchingRate(true);
    setRateNote("");
    const result = await fetchRate(code, on);
    setFetchingRate(false);
    if (result.ok) {
      setRateText(String(result.perEuro).replace(".", ","));
      setRateNote(`Cotización del ${formatDate(result.date)} (Banco Central Europeo)`);
    } else {
      setRateNote(result.message);
    }
  }

  async function chooseCurrency(code: string) {
    setCurrency(code);
    setRateText("");
    setRateNote("");
    if (code !== "EUR") await loadRate(code, date);
  }

  // Diferencia entre lo repartido y el importe, para guiar mientras se escribe.
  const exactSum = ids.reduce((sum, id) => sum + toCents(parseAmount(exacts[id] ?? "") ?? 0), 0);
  const percentSum = ids.reduce((sum, id) => sum + (Number((percents[id] ?? "").replace(",", ".")) || 0), 0);

  function buildSplits(): Record<string, number> | string {
    if (mode === "equal") {
      const chosen = ids.filter((id) => included.has(id));
      if (chosen.length === 0) return "Elige al menos a una persona para repartir el gasto.";
      return splitEqual(totalCents, chosen);
    }
    if (mode === "percent") {
      if (Math.abs(percentSum - 100) > 0.01) return `Los porcentajes suman ${percentSum.toFixed(2).replace(".", ",")} %, deben sumar 100 %.`;
      const parsed = Object.fromEntries(ids.map((id) => [id, Number((percents[id] ?? "").replace(",", ".")) || 0]));
      return splitByPercent(totalCents, parsed);
    }
    if (exactSum !== totalCents) {
      const diff = totalCents - exactSum;
      return diff > 0 ? `Faltan ${formatEUR(diff)} por repartir.` : `Te pasas ${formatEUR(-diff)} del importe.`;
    }
    return Object.fromEntries(ids.map((id) => [id, toCents(parseAmount(exacts[id] ?? "") ?? 0)]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!description.trim()) return setError("Escribe en qué fue el gasto.");
    if (!sharedCard && !paidBy) return setError("Elige quién pagó el gasto.");
    if (foreign && !rate) return setError("Escribe la cotización: cuántas unidades de esa moneda equivalen a 1 euro.");
    if (!amount || amount <= 0) return setError("Escribe un importe válido, por ejemplo 12,50.");

    const result = buildSplits();
    if (typeof result === "string") return setError(result);

    try {
      await save.mutateAsync({
        p_id: expense?.id ?? null,
        p_group: groupId,
        p_description: description.trim(),
        p_amount: amount,
        p_date: date,
        p_category: category,
        p_paid_by: forcedPool ? null : paidBy || null,
        p_card: cardId || null,
        p_currency: foreign ? currency : "EUR",
        p_original_amount: foreign ? typed : null,
        p_rate: foreign ? rate : null,
        p_splits: Object.entries(result).map(([participant_id, cents]) => ({ participant_id, amount: cents / 100 })),
      });
    } catch {
      return setError("No se pudo guardar el gasto. Revisa tu conexión e inténtalo de nuevo.");
    }
    if (!expense && !trip) {
      notifyPartner({ kind: "gastos", title: "Gasto nuevo", body: `${profile.name || "Tu pareja"} anotó «${description.trim()}» · ${formatEUR(toCents(amount))}`, url: "/gastos" });
    }
    onSaved();
  }

  const segment = (value: Mode, text: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`min-h-10 flex-1 rounded-lg text-sm font-medium transition ${
        mode === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
      }`}
    >
      {text}
    </button>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {expense?.notes && (
        <p className="rounded-xl bg-background px-3.5 py-2.5 text-sm text-ink-soft">{expense.notes}</p>
      )}

      <div>
        <label className={label} htmlFor="g-desc">Concepto</label>
        <input id="g-desc" className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Compra semanal, luz, cena…" maxLength={80} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="g-amount">Importe {trip ? `(${currency})` : "(€)"}</label>
          <input id="g-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className={label} htmlFor="g-date">Fecha</label>
          <input id="g-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {trip && (
        <div>
          <label className={label} htmlFor="g-currency">Moneda</label>
          <select id="g-currency" className={field} value={currency} onChange={(e) => chooseCurrency(e.target.value)}>
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {code} · {CURRENCIES.find((c) => c.code === code)?.name ?? "Otra moneda"}
              </option>
            ))}
          </select>

          {foreign && (
            <div className="mt-2 rounded-2xl bg-forest/10 p-3.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-ink-soft">1 € =</span>
                <input
                  className={`${field} min-h-10 flex-1`}
                  inputMode="decimal"
                  value={rateText}
                  onChange={(e) => {
                    setRateText(e.target.value);
                    setRateNote("");
                  }}
                  placeholder="Cotización"
                  aria-label={`Cuántos ${currency} son 1 euro`}
                />
                <span className="shrink-0 text-sm text-ink-soft">{currency}</span>
                <button
                  type="button"
                  onClick={() => loadRate(currency, date)}
                  disabled={fetchingRate}
                  className="min-h-10 shrink-0 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-forest transition active:scale-95 disabled:opacity-60"
                >
                  {fetchingRate ? "Buscando…" : "Actualizar"}
                </button>
              </div>
              {rateNote && <p className="mt-1.5 text-xs text-ink-soft">{rateNote}</p>}
              {typed && rate ? (
                <p className="mt-1.5 text-sm">
                  {formatMoney(typed, currency)} <span className="text-ink-soft">equivale a</span>{" "}
                  <span className="font-display text-base font-bold text-forest">{formatEUR(totalCents)}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-ink-soft">Escribe el importe y la cotización para ver cuánto son en euros.</p>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <p className={label}>Categoría</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {EXPENSE_CATEGORIES.map((c) => {
            const selected = c.name === category;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setCategory(c.name)}
                aria-pressed={selected}
                className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  selected ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <CatIcon name={c.icon} size={14} style={{ color: colorFor(c.color) }} /> {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="g-card">Pagado con</label>
        <select id="g-card" className={field} value={cardId} onChange={(e) => chooseCard(e.target.value)}>
          <option value="">Efectivo u otro medio</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {cardLabel(c)} · {c.kind === "debit" ? "Débito" : "Crédito"}
              {c.owner_user_id === null ? " · Compartida" : ""}
            </option>
          ))}
        </select>
        {cards.length === 0 && (
          <p className="mt-1.5 px-1 text-xs text-ink-soft">
            Para pagar con una tarjeta, primero{" "}
            <Link href="/gastos/tarjetas" className="font-medium text-forest underline underline-offset-2">
              regístrala en Tarjetas
            </Link>
            .
          </p>
        )}
        {card?.kind === "debit" && (
          <p className="mt-1.5 px-1 text-xs text-ink-soft">Este gasto se descontará del saldo de la tarjeta.</p>
        )}
      </div>

      {forcedPool ? (
        <p className="rounded-xl bg-moss/15 px-3.5 py-3 text-sm text-forest">
          Pagado con la tarjeta compartida: sale del dinero de los dos, así que no crea deudas entre ustedes.
        </p>
      ) : (
        <div>
          <label className={label} htmlFor="g-paid">¿Quién pagó?</label>
          <select id="g-paid" className={field} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {sharedCard && <option value="">Cuenta compartida (no crea deudas)</option>}
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.user_id && p.id === meId ? `${p.name} (tú)` : p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <p className={label}>Dividir</p>
        <div className="flex gap-1 rounded-xl bg-washi-deep p-1" role="tablist" aria-label="Forma de dividir">
          {segment("equal", "Iguales")}
          {segment("percent", "Porcentaje")}
          {segment("exact", foreign ? "Importes (€)" : "Importes")}
        </div>

        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {participants.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-3 px-3">
              <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}</span>

              {mode === "equal" && (
                <>
                  <span className="text-sm text-ink-soft">
                    {included.has(p.id) && totalCents > 0
                      ? formatEUR(splitEqual(totalCents, ids.filter((id) => included.has(id)))[p.id] ?? 0)
                      : ""}
                  </span>
                  <input
                    type="checkbox"
                    checked={included.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(included);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setIncluded(next);
                    }}
                    aria-label={`Incluir a ${p.name}`}
                    className="size-5 accent-[var(--forest)]"
                  />
                </>
              )}

              {mode === "percent" && (
                <div className="flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    value={percents[p.id] ?? ""}
                    onChange={(e) => setPercents({ ...percents, [p.id]: e.target.value })}
                    aria-label={`Porcentaje de ${p.name}`}
                    className="min-h-9 w-20 rounded-lg border border-line bg-background px-2 text-right text-base outline-none focus:border-forest"
                  />
                  <span className="text-sm text-ink-soft">%</span>
                </div>
              )}

              {mode === "exact" && (
                <div className="flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    value={exacts[p.id] ?? ""}
                    onChange={(e) => setExacts({ ...exacts, [p.id]: e.target.value })}
                    placeholder="0,00"
                    aria-label={`Importe de ${p.name}`}
                    className="min-h-9 w-24 rounded-lg border border-line bg-background px-2 text-right text-base outline-none focus:border-forest"
                  />
                  <span className="text-sm text-ink-soft">€</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        {mode === "percent" && (
          <p className={`mt-1.5 px-1 text-xs ${Math.abs(percentSum - 100) <= 0.01 ? "text-forest" : "text-hanko"}`}>
            Suman {percentSum.toFixed(2).replace(".", ",")} % de 100 %
          </p>
        )}
        {mode === "exact" && totalCents > 0 && (
          <p className={`mt-1.5 px-1 text-xs ${exactSum === totalCents ? "text-forest" : "text-hanko"}`}>
            {exactSum === totalCents
              ? "El reparto cuadra con el importe"
              : exactSum < totalCents
                ? `Faltan ${formatEUR(totalCents - exactSum)} por repartir`
                : `Te pasas ${formatEUR(exactSum - totalCents)}`}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
          {error}
        </p>
      )}

      <button
        disabled={saving}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {saving ? "Guardando…" : expense ? "Guardar cambios" : "Añadir gasto"}
      </button>

      {expense && (
        <button
          type="button"
          onClick={() => onDelete(expense)}
          className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko"
        >
          <Trash2 size={16} /> Eliminar gasto
        </button>
      )}
    </form>
  );
}
