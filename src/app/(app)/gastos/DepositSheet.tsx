"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { parseAmount } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import { cardLabel } from "@/lib/tarjetas/labels";

type DebitCard = { id: string; name: string; last4: string | null };
type Person = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Solo tarjetas de débito: es donde se guarda dinero. */
  cards: DebitCard[];
  defaultCardId: string | null;
  /** Personas del hogar, por id de usuario. */
  people: Person[];
  meId: string;
  householdId: string;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function DepositSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Ingresar dinero a una tarjeta">
      {props.open && (props.cards.length === 0 ? <NoDebitCards onClose={props.onClose} /> : <DepositForm {...props} />)}
    </BottomSheet>
  );
}

function NoDebitCards({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3 text-sm text-ink-soft">
      <p>
        Los ingresos se guardan en tarjetas de <span className="font-medium text-ink">débito</span>. Todavía no tienes ninguna registrada.
      </p>
      <Link
        href="/gastos/tarjetas"
        onClick={onClose}
        className="flex min-h-12 items-center justify-center rounded-2xl bg-forest px-6 text-base font-medium text-surface shadow-sm transition active:scale-95"
      >
        Registrar una tarjeta de débito
      </Link>
    </div>
  );
}

function DepositForm({ cards, defaultCardId, people, meId, householdId, onSaved }: Props) {
  const [cardId, setCardId] = useState(defaultCardId && cards.some((c) => c.id === defaultCardId) ? defaultCardId : (cards[0]?.id ?? ""));
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(todayISO());
  const [by, setBy] = useState(meId);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { error: insertError } = await createClient().from("card_deposits").insert(row);
      if (insertError) throw new Error(insertError.message);
    },
    meta: { silent: true },
  });
  const saving = save.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseAmount(amountText);
    if (!amount || amount <= 0) return setError("Escribe un importe válido, por ejemplo 100,00.");

    try {
      await save.mutateAsync({
        household_id: householdId,
        card_id: cardId,
        amount,
        deposit_date: date,
        deposited_by: by,
        note: note.trim() || null,
      });
    } catch {
      return setError("No se pudo registrar el ingreso. Inténtalo de nuevo.");
    }
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="d-card">Tarjeta</label>
        <select id="d-card" className={field} value={cardId} onChange={(e) => setCardId(e.target.value)}>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>{cardLabel(c)}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="d-amount">Importe (€)</label>
          <input id="d-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" autoFocus />
        </div>
        <div>
          <label className={label} htmlFor="d-date">Fecha</label>
          <input id="d-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {people.length > 1 && (
        <div>
          <label className={label} htmlFor="d-by">¿Quién puso el dinero?</label>
          <select id="d-by" className={field} value={by} onChange={(e) => setBy(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (tú)` : p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={label} htmlFor="d-note">Nota (opcional)</label>
        <input id="d-note" className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sueldo, ahorro del mes…" maxLength={60} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : "Registrar ingreso"}
      </button>
    </form>
  );
}
