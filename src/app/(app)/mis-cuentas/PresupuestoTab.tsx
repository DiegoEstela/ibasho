"use client";

import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { formatEUR } from "@/lib/gastos/money";
import { addMonths, monthName } from "@/lib/personal/compute";
import type { BudgetMonth, CategoryUse } from "@/lib/personal/presupuesto";

type Props = {
  budget: BudgetMonth;
  categories: CategoryUse[];
  month: string;
  currentMonth: string;
  onMonth: (month: string) => void;
  maxMonth: string;
  hasPlan: boolean;
  onPlan: () => void;
  onLimits: () => void;
};

const iconButton =
  "flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90";

/** Presupuesto de un mes (por defecto el que viene): qué entra, qué está comprometido y qué te queda. */
export function PresupuestoTab({ budget: b, categories, month, currentMonth, onMonth, maxMonth, hasPlan, onPlan, onLimits }: Props) {
  const isCurrent = month === currentMonth;
  const isFuture = month > currentMonth;
  const left = b.leftCents;

  const rows: { label: string; hint?: string; cents: number }[] = [
    { label: "Mis gastos fijos", cents: b.ownFixedCents },
    { label: "Mi parte de los fijos del hogar", hint: "Los que aún no se pasaron a Gastos", cents: b.householdFixedCents },
    { label: "Mis cuotas de tarjeta", cents: b.installmentsCents },
    { label: isFuture ? "Otros gastos ya anotados" : "Gastos compartidos y propios", cents: b.otherCents },
  ];

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => onMonth(addMonths(month, -1))} aria-label="Mes anterior" className={iconButton}>
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="font-display text-base font-bold lg:text-lg">{monthName(month)}</p>
          <p className="text-xs text-ink-soft">{isFuture ? (month === addMonths(currentMonth, 1) ? "El mes que viene" : "Previsión") : isCurrent ? "Este mes" : "Mes pasado"}</p>
        </div>
        <button onClick={() => onMonth(addMonths(month, 1))} disabled={month >= maxMonth} aria-label="Mes siguiente" className={`${iconButton} disabled:opacity-30`}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Lo que te queda */}
      <div className="rounded-2xl border border-line bg-surface p-4 lg:p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{isFuture ? "Te quedaría para vivir" : "Te queda para vivir"}</p>
        <p className={`mt-1 font-display text-3xl font-bold lg:text-4xl ${left < 0 ? "text-hanko" : "text-forest"}`}>{formatEUR(left)}</p>
        <p className="mt-1 text-xs text-ink-soft">
          {b.incomeCents > 0 ? `de ${formatEUR(b.incomeCents)} de ingresos, tras gastos${b.savingCents > 0 ? " y ahorro" : ""}` : "Añade tu sueldo en «Mi plan» para ver cuánto te queda"}
        </p>
        {!hasPlan && (
          <button onClick={onPlan} className="mt-3 min-h-10 rounded-xl bg-forest px-4 text-sm font-medium text-surface">
            Configurar mi plan
          </button>
        )}
      </div>

      {/* Cuenta del mes */}
      <div className="rounded-2xl border border-line bg-surface p-4 lg:p-5">
        <h2 className="mb-2 font-display text-base font-bold lg:text-lg">La cuenta de {monthName(month, false).toLowerCase().replace(".", "")}</h2>
        <dl className="flex flex-col divide-y divide-line text-[15px]">
          <Line label="Ingresos" cents={b.incomeCents} tone="plus" />
          {rows.map((r) => (
            <Line key={r.label} label={r.label} hint={r.hint} cents={-r.cents} muted={r.cents === 0} />
          ))}
          <Line label="Ahorro" hint="Tu meta mensual" cents={-b.savingCents} muted={b.savingCents === 0} />
          <div className="flex items-baseline justify-between pt-3 font-medium">
            <dt>Te queda</dt>
            <dd className={left < 0 ? "text-hanko" : "text-forest"}>{formatEUR(left)}</dd>
          </div>
        </dl>
        {!isFuture && (
          <p className="mt-3 text-xs text-ink-soft">
            {isCurrent ? "Ya gastado" : "Gastado"} {formatEUR(b.doneCents)}
            {b.upcomingCents > 0 ? ` · por llegar ${formatEUR(b.upcomingCents)}` : ""}
          </p>
        )}
      </div>

      {/* Topes */}
      <div className="rounded-2xl border border-line bg-surface p-4 lg:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold lg:text-lg">Por categoría</h2>
          <button onClick={onLimits} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-forest transition active:scale-95">
            <SlidersHorizontal size={16} /> Topes
          </button>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-ink-soft">Aún no hay gastos este mes. Pon un tope con «Topes» para controlar cada categoría.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {categories.map((c) => {
              const over = c.limitCents > 0 && c.spentCents > c.limitCents;
              const pct = c.limitCents > 0 ? Math.min(100, (c.spentCents / c.limitCents) * 100) : 0;
              return (
                <li key={c.category}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{c.category}</span>
                    <span className={over ? "font-medium text-hanko" : "text-ink-soft"}>
                      {formatEUR(c.spentCents)}
                      {c.limitCents > 0 ? ` de ${formatEUR(c.limitCents)}` : ""}
                    </span>
                  </div>
                  {c.limitCents > 0 && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-washi-deep">
                      <div className={`h-full rounded-full transition-all ${over ? "bg-hanko" : "bg-forest"}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Line({ label, hint, cents, tone, muted }: { label: string; hint?: string; cents: number; tone?: "plus"; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${muted ? "text-ink-soft" : ""}`}>
      <dt className="min-w-0">
        <span className="block truncate">{label}</span>
        {hint && <span className="block truncate text-xs text-ink-soft">{hint}</span>}
      </dt>
      <dd className={`shrink-0 ${tone === "plus" ? "text-forest" : ""}`}>
        {cents > 0 ? "+" : cents < 0 ? "−" : ""}
        {formatEUR(Math.abs(cents))}
      </dd>
    </div>
  );
}
