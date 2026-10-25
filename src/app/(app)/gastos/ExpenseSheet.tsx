"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import type { Participant } from "@/lib/gastos/balance";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { formatEUR, parseAmount, splitByPercent, splitEqual, toCents } from "@/lib/gastos/money";
import type { Expense, Split } from "./types";

type Mode = "equal" | "percent" | "exact";

type Props = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  participants: Participant[];
  meId: string | null;
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

/** Porcentajes iguales que suman exactamente 100 (el último absorbe el redondeo). */
function evenPercents(ids: string[]): Record<string, string> {
  const base = Math.floor((10000 / ids.length)) / 100;
  const result: Record<string, string> = {};
  let used = 0;
  ids.forEach((id, i) => {
    const value = i === ids.length - 1 ? Math.round((100 - used) * 100) / 100 : base;
    used += value;
    result[id] = String(value);
  });
  return result;
}

export function ExpenseSheet(props: Props) {
  const { open, onClose, expense } = props;
  return (
    <BottomSheet open={open} onClose={onClose} title={expense ? "Editar gasto" : "Nuevo gasto"}>
      {open && <ExpenseForm key={expense?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function ExpenseForm({ groupId, participants, meId, expense, splits, onSaved, onDelete }: Props) {
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
  const [amountText, setAmountText] = useState(expense ? String(expense.amount).replace(".", ",") : "");
  const [date, setDate] = useState(expense?.expense_date ?? todayISO());
  const [category, setCategory] = useState(expense?.category ?? "Supermercado");
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? meId ?? ids[0] ?? "");
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [included, setIncluded] = useState<Set<string>>(initial.included);
  const [percents, setPercents] = useState<Record<string, string>>(() => evenPercents(ids));
  const [exacts, setExacts] = useState<Record<string, string>>(initial.exacts);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);
  const totalCents = amount ? toCents(amount) : 0;

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
    if (!amount || amount <= 0) return setError("Escribe un importe válido, por ejemplo 12,50.");

    const result = buildSplits();
    if (typeof result === "string") return setError(result);

    setSaving(true);
    const { error: rpcError } = await createClient().rpc("save_expense", {
      p_id: expense?.id ?? null,
      p_group: groupId,
      p_description: description.trim(),
      p_amount: amount,
      p_date: date,
      p_category: category,
      p_paid_by: paidBy,
      p_splits: Object.entries(result).map(([participant_id, cents]) => ({ participant_id, amount: cents / 100 })),
    });
    setSaving(false);
    if (rpcError) return setError("No se pudo guardar el gasto. Revisa tu conexión e inténtalo de nuevo.");
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
      <div>
        <label className={label} htmlFor="g-desc">Concepto</label>
        <input id="g-desc" className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Compra semanal, luz, cena…" maxLength={80} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="g-amount">Importe (€)</label>
          <input id="g-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className={label} htmlFor="g-date">Fecha</label>
          <input id="g-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

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
        <label className={label} htmlFor="g-paid">¿Quién pagó?</label>
        <select id="g-paid" className={field} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.user_id && p.id === meId ? `${p.name} (tú)` : p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className={label}>Dividir</p>
        <div className="flex gap-1 rounded-xl bg-washi-deep p-1" role="tablist" aria-label="Forma de dividir">
          {segment("equal", "Iguales")}
          {segment("percent", "Porcentaje")}
          {segment("exact", "Importes")}
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
