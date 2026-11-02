"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { parseAmount } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import { cardLabel } from "@/lib/tarjetas/labels";
import type { CardRef, PersonalCard, PersonalFixed } from "@/lib/personal/types";

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

const EVERY: [number, string][] = [
  [1, "Cada mes"],
  [2, "Cada 2 meses"],
  [3, "Cada 3 meses"],
  [6, "Cada 6 meses"],
  [12, "Una vez al año"],
];

function useWrite() {
  return useMutation({
    mutationFn: async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await run();
      if (error) throw new Error(error.message);
    },
    meta: { silent: true },
  });
}

type FixedProps = {
  open: boolean;
  onClose: () => void;
  fixed: PersonalFixed | null;
  userId: string;
  currentMonth: string;
  cards: CardRef[];
  personalCards: PersonalCard[];
};

/** Un gasto fijo individual (gimnasio, móvil, seguro…): solo lo ves tú. */
export function PersonalFixedSheet(props: FixedProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.fixed ? "Editar gasto fijo" : "Nuevo gasto fijo"}>
      {props.open && <FixedForm key={props.fixed?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function FixedForm({ onClose, fixed, userId, currentMonth, cards, personalCards }: FixedProps) {
  const [name, setName] = useState(fixed?.name ?? "");
  const [amountText, setAmountText] = useState(fixed ? String(fixed.amount).replace(".", ",") : "");
  const [category, setCategory] = useState(fixed?.category ?? "Facturas");
  const [every, setEvery] = useState(fixed?.every_months ?? 1);
  const [start, setStart] = useState(fixed?.start_month.slice(0, 7) ?? currentMonth);
  const [dueDay, setDueDay] = useState(fixed?.due_day ? String(fixed.due_day) : "");
  const [method, setMethod] = useState(fixed?.personal_card_id ? `p:${fixed.personal_card_id}` : fixed?.card_id ? `c:${fixed.card_id}` : "");
  const [error, setError] = useState("");
  const write = useWrite();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseAmount(amountText);
    if (!name.trim()) return setError("Ponle un nombre, por ejemplo «Gimnasio».");
    if (amount === null || amount <= 0) return setError("Escribe un importe válido, por ejemplo 29,90.");
    const day = dueDay.trim() ? Number(dueDay) : null;
    if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return setError("El día de cobro debe estar entre 1 y 31.");

    const row = {
      name: name.trim(),
      amount,
      category,
      every_months: every,
      start_month: `${start}-01`,
      due_day: day,
      card_id: method.startsWith("c:") ? method.slice(2) : null,
      personal_card_id: method.startsWith("p:") ? method.slice(2) : null,
    };
    const supabase = createClient();
    try {
      await write.mutateAsync(() =>
        fixed ? supabase.from("personal_fixed").update(row).eq("id", fixed.id) : supabase.from("personal_fixed").insert({ ...row, user_id: userId }),
      );
    } catch {
      return setError("No se pudo guardar. Inténtalo de nuevo.");
    }
    onClose();
  }

  async function remove() {
    if (!fixed) return;
    try {
      await write.mutateAsync(() => createClient().from("personal_fixed").delete().eq("id", fixed.id));
    } catch {
      return setError("No se pudo borrar.");
    }
    onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="pf-name">Nombre</label>
        <input id="pf-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Gimnasio" maxLength={80} autoFocus={!fixed} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="pf-amount">Importe (€)</label>
          <input id="pf-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className={label} htmlFor="pf-cat">Categoría</label>
          <select id="pf-cat" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="pf-every">Cada cuánto</label>
          <select id="pf-every" className={field} value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            {EVERY.map(([n, text]) => (
              <option key={n} value={n}>{text}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="pf-day">Día de cobro</label>
          <input id="pf-day" className={field} inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Opcional" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="pf-start">Desde</label>
          <input id="pf-start" type="month" className={field} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="pf-method">Pagado con</label>
          <select id="pf-method" className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Efectivo / cuenta</option>
            {personalCards.length > 0 && (
              <optgroup label="Mis tarjetas (privadas)">
                {personalCards.map((c) => (
                  <option key={c.id} value={`p:${c.id}`}>{cardLabel(c)}</option>
                ))}
              </optgroup>
            )}
            {cards.length > 0 && (
              <optgroup label="Tarjetas del hogar">
                {cards.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>{cardLabel(c)}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={write.isPending} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {write.isPending ? "Guardando…" : fixed ? "Guardar cambios" : "Guardar"}
      </button>
      {fixed && (
        <button type="button" onClick={remove} disabled={write.isPending} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
          <Trash2 size={16} /> Eliminar gasto fijo
        </button>
      )}
    </form>
  );
}

const PERCENTS = [0, 25, 50, 75, 100];

type ShareProps = {
  open: boolean;
  onClose: () => void;
  name: string;
  fixedId: string;
  userId: string;
  percent: number;
  /** Lo que cuesta el fijo del hogar este mes, en texto («89,00 €»). */
  amountLabel: string;
};

/** Qué parte de un gasto fijo del hogar cuenta en tu presupuesto. */
export function ShareSheet(props: ShareProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.name}>
      {props.open && <ShareForm key={props.fixedId} {...props} />}
    </BottomSheet>
  );
}

function ShareForm({ onClose, fixedId, userId, percent, amountLabel }: ShareProps) {
  const [value, setValue] = useState(String(percent));
  const [error, setError] = useState("");
  const write = useWrite();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return setError("Escribe un porcentaje entre 0 y 100.");
    try {
      await write.mutateAsync(() => createClient().from("personal_fixed_shares").upsert({ user_id: userId, fixed_id: fixedId, percent: n }, { onConflict: "user_id,fixed_id" }));
    } catch {
      return setError("No se pudo guardar. Inténtalo de nuevo.");
    }
    onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">Este gasto del hogar cuesta {amountLabel}. ¿Qué parte cuenta en tu presupuesto?</p>
      <div className="flex gap-2 chip-row" role="group" aria-label="Porcentaje">
        {PERCENTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setValue(String(p))}
            aria-pressed={Number(value) === p}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm transition ${Number(value) === p ? "border-forest bg-forest text-surface" : "border-line bg-surface text-ink"}`}
          >
            {p === 0 ? "Nada" : p === 100 ? "Todo" : p === 50 ? "La mitad" : `${p}%`}
          </button>
        ))}
      </div>
      <div>
        <label className={label} htmlFor="sh-pct">Otro porcentaje (%)</label>
        <input id="sh-pct" className={field} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}
      <button disabled={write.isPending} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {write.isPending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

type LimitsProps = {
  open: boolean;
  onClose: () => void;
  userId: string;
  limits: { category: string; monthly_limit: number }[];
};

/** Tope mensual por categoría (opcional). Dejar vacío = sin tope. */
export function LimitsSheet(props: LimitsProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Topes por categoría">
      {props.open && <LimitsForm {...props} />}
    </BottomSheet>
  );
}

function LimitsForm({ onClose, userId, limits }: LimitsProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(limits.map((l) => [l.category, String(l.monthly_limit).replace(".", ",")])),
  );
  const [error, setError] = useState("");
  const write = useWrite();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const rows: { user_id: string; category: string; monthly_limit: number }[] = [];
    const clear: string[] = [];
    for (const c of EXPENSE_CATEGORIES) {
      const text = (values[c.name] ?? "").trim();
      if (!text) {
        clear.push(c.name);
        continue;
      }
      const amount = parseAmount(text);
      if (amount === null || amount <= 0) return setError(`Revisa el importe de «${c.name}».`);
      rows.push({ user_id: userId, category: c.name, monthly_limit: amount });
    }
    const supabase = createClient();
    try {
      await write.mutateAsync(async () => {
        if (rows.length) {
          const up = await supabase.from("personal_budgets").upsert(rows, { onConflict: "user_id,category" });
          if (up.error) return up;
        }
        return supabase.from("personal_budgets").delete().eq("user_id", userId).in("category", clear);
      });
    } catch {
      return setError("No se pudo guardar. Inténtalo de nuevo.");
    }
    onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">Pon cuánto quieres gastar como máximo al mes en cada categoría. Déjalo vacío si no quieres tope.</p>
      {EXPENSE_CATEGORIES.map((c) => (
        <div key={c.name} className="flex items-center gap-3">
          <label htmlFor={`lim-${c.name}`} className="min-w-0 flex-1 truncate text-sm">{c.name}</label>
          <input
            id={`lim-${c.name}`}
            className={`${field} !w-32 text-right`}
            inputMode="decimal"
            value={values[c.name] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
            placeholder="Sin tope"
          />
        </div>
      ))}
      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}
      <button disabled={write.isPending} className="mt-1 min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {write.isPending ? "Guardando…" : "Guardar topes"}
      </button>
    </form>
  );
}
