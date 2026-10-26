"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import type { Participant, Transfer } from "@/lib/gastos/balance";
import { parseAmount } from "@/lib/gastos/money";

type Props = {
  open: boolean;
  onClose: () => void;
  householdId: string;
  groupId: string;
  participants: Participant[];
  /** Pago sugerido (de la deuda calculada); null para uno en blanco. */
  suggestion: Transfer | null;
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

export function SettleSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Registrar un pago">
      {props.open && <SettleForm key={props.suggestion ? `${props.suggestion.from}-${props.suggestion.to}` : "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function SettleForm({ householdId, groupId, participants, suggestion, onSaved }: Props) {
  const [from, setFrom] = useState(suggestion?.from ?? participants[0]?.id ?? "");
  const [to, setTo] = useState(suggestion?.to ?? participants[1]?.id ?? "");
  const [amountText, setAmountText] = useState(suggestion ? (suggestion.cents / 100).toFixed(2).replace(".", ",") : "");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { error: insertError } = await createClient().from("settlements").insert(row);
      if (insertError) throw new Error(insertError.message);
    },
    meta: { silent: true },
  });
  const saving = save.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseAmount(amountText);
    if (!amount || amount <= 0) return setError("Escribe un importe válido, por ejemplo 20,00.");
    if (from === to) return setError("Quien paga y quien recibe deben ser personas distintas.");

    try {
      await save.mutateAsync({
        household_id: householdId,
        group_id: groupId,
        from_participant: from,
        to_participant: to,
        amount,
        settled_on: date,
      });
    } catch {
      return setError("No se pudo registrar el pago. Inténtalo de nuevo.");
    }
    onSaved();
  }

  const options = participants.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="s-from">Quién paga</label>
          <select id="s-from" className={field} value={from} onChange={(e) => setFrom(e.target.value)}>
            {options}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="s-to">Quién recibe</label>
          <select id="s-to" className={field} value={to} onChange={(e) => setTo(e.target.value)}>
            {options}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="s-amount">Importe (€)</label>
          <input id="s-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" autoFocus />
        </div>
        <div>
          <label className={label} htmlFor="s-date">Fecha</label>
          <input id="s-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
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
        {saving ? "Guardando…" : "Registrar pago"}
      </button>
    </form>
  );
}
