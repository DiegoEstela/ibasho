"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { parseAmount } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import { cardLabel } from "@/lib/tarjetas/labels";
import type { CardRef, EntryKind, PersonalEntry } from "@/lib/personal/types";

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

const KINDS: { value: EntryKind; text: string; hint: string }[] = [
  { value: "expense", text: "Gasto", hint: "Algo que pagaste solo tú" },
  { value: "income", text: "Ingreso", hint: "Dinero extra que te entró" },
  { value: "saving", text: "Ahorro", hint: "Dinero que apartaste" },
];

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type Props = {
  open: boolean;
  onClose: () => void;
  entry: PersonalEntry | null;
  userId: string;
  cards: CardRef[];
};

/** Anotar un movimiento propio: solo lo ves tú. Los gastos compartidos se anotan en Gastos y aparecen aquí solos. */
export function EntrySheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.entry ? "Editar movimiento" : "Nuevo movimiento"}>
      {props.open && <EntryForm key={props.entry?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function EntryForm({ onClose, entry, userId, cards }: Props) {
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? "expense");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [amountText, setAmountText] = useState(entry ? String(entry.amount).replace(".", ",") : "");
  const [date, setDate] = useState(entry?.entry_date ?? todayISO());
  const [category, setCategory] = useState(entry?.category ?? "Otros");
  const [cardId, setCardId] = useState(entry?.card_id ?? "");
  const [error, setError] = useState("");

  const write = useMutation({
    mutationFn: async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error: writeError } = await run();
      if (writeError) throw new Error(writeError.message);
    },
    meta: { silent: true },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseAmount(amountText);
    if (!description.trim()) return setError("Escribe un concepto.");
    if (!amount || amount <= 0) return setError("Escribe un importe válido, por ejemplo 12,50.");
    if (!date) return setError("Elige la fecha.");

    const row = {
      kind,
      description: description.trim(),
      amount,
      entry_date: date,
      category: kind === "expense" ? category : "Otros",
      card_id: kind === "expense" && cardId ? cardId : null,
    };
    const supabase = createClient();
    try {
      await write.mutateAsync(() =>
        entry ? supabase.from("personal_entries").update(row).eq("id", entry.id) : supabase.from("personal_entries").insert({ ...row, user_id: userId }),
      );
    } catch {
      return setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    }
    onClose();
  }

  async function remove() {
    if (!entry) return;
    try {
      await write.mutateAsync(() => createClient().from("personal_entries").delete().eq("id", entry.id));
    } catch {
      return setError("No se pudo borrar.");
    }
    onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-xl bg-washi-deep p-1" role="group" aria-label="Tipo de movimiento">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            aria-pressed={kind === k.value}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium transition ${kind === k.value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"}`}
          >
            {k.text}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-ink-soft">{KINDS.find((k) => k.value === kind)?.hint}. Solo lo ves tú.</p>

      <div>
        <label className={label} htmlFor="m-desc">Concepto</label>
        <input
          id="m-desc"
          className={field}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === "expense" ? "Peluquería" : kind === "income" ? "Trabajo extra" : "Fondo de emergencia"}
          maxLength={120}
          autoFocus={!entry}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="m-amount">Importe (€)</label>
          <input id="m-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className={label} htmlFor="m-date">Fecha</label>
          <input id="m-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {kind === "expense" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="m-cat">Categoría</label>
            <select id="m-cat" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="m-card">Pagado con</label>
            <select id="m-card" className={field} value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">Efectivo</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {cardLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
          {error}
        </p>
      )}

      <button
        disabled={write.isPending}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {write.isPending ? "Guardando…" : entry ? "Guardar cambios" : "Guardar"}
      </button>
      {entry && (
        <button type="button" onClick={remove} disabled={write.isPending} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
          <Trash2 size={16} /> Eliminar movimiento
        </button>
      )}
    </form>
  );
}
