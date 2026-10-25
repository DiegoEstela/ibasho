"use client";

import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import { evenPercents, formatEUR, parseAmount, toCents } from "@/lib/gastos/money";
import { buildInstallments, financedCents } from "@/lib/tarjetas/installments";
import { formatDate } from "../types";
import type { Card, Person } from "./types";

type Mode = "me" | "other" | "equal" | "custom";

type Props = {
  open: boolean;
  onClose: () => void;
  cards: Card[];
  defaultCardId: string | null;
  people: Person[];
  meId: string;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";
const COUNTS = [1, 3, 6, 9, 12, 18, 24];

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function PurchaseSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Nueva compra con tarjeta">
      {props.open && <PurchaseForm {...props} />}
    </BottomSheet>
  );
}

function PurchaseForm({ cards, defaultCardId, people, meId, onSaved }: Props) {
  const ids = people.map((p) => p.id);
  const other = people.length === 2 ? people.find((p) => p.id !== meId) : undefined;

  const [cardId, setCardId] = useState(defaultCardId ?? cards[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(todayISO());
  const [count, setCount] = useState(1);
  const [customCount, setCustomCount] = useState(false);
  const [interestText, setInterestText] = useState("");
  const [mode, setMode] = useState<Mode>(people.length > 1 ? "equal" : "me");
  const [percents, setPercents] = useState<Record<string, string>>(() => evenPercents(ids));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const card = cards.find((c) => c.id === cardId);
  const amount = parseAmount(amountText);
  const interest = interestText ? Number(interestText.replace(",", ".")) : 0;
  const interestOk = Number.isFinite(interest) && interest >= 0;

  const preview = useMemo(() => {
    if (!card || !amount || !interestOk) return null;
    const rows = buildInstallments({
      purchaseDate: date,
      totalCents: toCents(amount),
      interestPercent: interest,
      count,
      closingDay: card.closing_day,
      dueDay: card.due_day,
    });
    return { rows, total: financedCents(toCents(amount), interest) };
  }, [card, amount, interest, interestOk, date, count]);

  const percentSum = ids.reduce((s, id) => s + (Number((percents[id] ?? "").replace(",", ".")) || 0), 0);

  function buildShares(): { user_id: string; percent: number }[] | string {
    if (mode === "me") return [{ user_id: meId, percent: 100 }];
    if (mode === "other" && other) return [{ user_id: other.id, percent: 100 }];
    const source = mode === "equal" ? evenPercents(ids) : percents;
    if (mode === "custom" && Math.abs(percentSum - 100) > 0.01) {
      return `Los porcentajes suman ${percentSum.toFixed(2).replace(".", ",")} %, deben sumar 100 %.`;
    }
    return ids
      .map((id) => ({ user_id: id, percent: Number((source[id] ?? "").replace(",", ".")) || 0 }))
      .filter((s) => s.percent > 0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!card) return setError("Primero elige la tarjeta.");
    if (!description.trim()) return setError("Escribe qué compraste.");
    if (!amount || amount <= 0) return setError("Escribe un importe válido, por ejemplo 349,90.");
    if (!interestOk) return setError("El interés debe ser un número, por ejemplo 12 o 0.");
    if (!Number.isInteger(count) || count < 1 || count > 60) return setError("Las cuotas deben estar entre 1 y 60.");
    if (!preview) return;

    const shares = buildShares();
    if (typeof shares === "string") return setError(shares);

    setSaving(true);
    const { error: rpcError } = await createClient().rpc("save_card_purchase", {
      p_card: card.id,
      p_description: description.trim(),
      p_merchant: merchant.trim() || null,
      p_date: date,
      p_total: amount,
      p_interest: interest,
      p_count: count,
      p_notes: null,
      p_shares: shares,
      p_installments: preview.rows.map((r) => ({ number: r.number, due_date: r.due_date, amount: r.cents / 100 })),
    });
    setSaving(false);
    if (rpcError) return setError("No se pudo guardar la compra. Revisa tu conexión e inténtalo de nuevo.");
    onSaved();
  }

  const modeButton = (value: Mode, text: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`min-h-10 flex-1 rounded-lg px-2 text-[13px] font-medium transition ${
        mode === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
      }`}
    >
      {text}
    </button>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="p-card">Tarjeta</label>
        <select id="p-card" className={field} value={cardId} onChange={(e) => setCardId(e.target.value)}>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ····${c.last4}` : ""}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="p-desc">¿Qué compraste?</label>
        <input id="p-desc" className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Televisor, vuelos, sofá…" maxLength={80} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="p-amount">Importe (€)</label>
          <input id="p-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className={label} htmlFor="p-date">Fecha</label>
          <input id="p-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="p-merchant">Comercio (opcional)</label>
        <input id="p-merchant" className={field} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Dónde la compraste" maxLength={60} />
      </div>

      <div>
        <p className={label}>Cuotas</p>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setCount(n);
                setCustomCount(false);
              }}
              aria-pressed={!customCount && count === n}
              className={`min-h-10 min-w-12 rounded-xl border px-3 text-sm font-medium transition ${
                !customCount && count === n ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
              }`}
            >
              {n === 1 ? "1 pago" : n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomCount(true)}
            aria-pressed={customCount}
            className={`min-h-10 rounded-xl border px-3 text-sm font-medium transition ${
              customCount ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
            }`}
          >
            Otro
          </button>
        </div>
        {customCount && (
          <input
            className={`${field} mt-2`}
            inputMode="numeric"
            value={count || ""}
            onChange={(e) => setCount(Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || 0)}
            placeholder="Número de cuotas (1 a 60)"
            aria-label="Número de cuotas"
          />
        )}
      </div>

      <div>
        <label className={label} htmlFor="p-interest">Interés total, % (opcional)</label>
        <input id="p-interest" className={field} inputMode="decimal" value={interestText} onChange={(e) => setInterestText(e.target.value)} placeholder="0 si no tiene" />
      </div>

      {preview && (
        <div className="rounded-2xl bg-forest/10 p-3.5 text-sm">
          <p className="font-display text-base font-bold text-forest">
            {count === 1 ? `Un pago de ${formatEUR(preview.rows[0].cents)}` : `${count} cuotas de ${formatEUR(preview.rows[0].cents)}`}
          </p>
          <p className="mt-1 text-ink-soft">
            Primera: {formatDate(preview.rows[0].due_date)} · Última: {formatDate(preview.rows[preview.rows.length - 1].due_date)}
          </p>
          <p className="text-ink-soft">
            Total a pagar: <span className="font-medium text-ink">{formatEUR(preview.total)}</span>
            {interest > 0 && ` (incluye ${formatEUR(preview.total - toCents(amount ?? 0))} de interés)`}
          </p>
        </div>
      )}

      {people.length > 1 && (
        <div>
          <p className={label}>¿A quién corresponde?</p>
          <div className="flex gap-1 rounded-xl bg-washi-deep p-1">
            {modeButton("me", "Solo yo")}
            {other && modeButton("other", `Solo ${other.name}`)}
            {modeButton("equal", people.length === 2 ? "50 / 50" : "A partes iguales")}
            {modeButton("custom", "Otro %")}
          </div>

          {mode === "custom" && (
            <>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {people.map((p) => (
                  <li key={p.id} className="flex min-h-12 items-center gap-3 px-3">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{p.id === meId ? `${p.name} (tú)` : p.name}</span>
                    <input
                      inputMode="decimal"
                      value={percents[p.id] ?? ""}
                      onChange={(e) => setPercents({ ...percents, [p.id]: e.target.value })}
                      aria-label={`Porcentaje de ${p.name}`}
                      className="min-h-9 w-20 rounded-lg border border-line bg-background px-2 text-right text-base outline-none focus:border-forest"
                    />
                    <span className="text-sm text-ink-soft">%</span>
                  </li>
                ))}
              </ul>
              <p className={`mt-1.5 px-1 text-xs ${Math.abs(percentSum - 100) <= 0.01 ? "text-forest" : "text-hanko"}`}>
                Suman {percentSum.toFixed(2).replace(".", ",")} % de 100 %
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>
      )}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar compra"}
      </button>
    </form>
  );
}
