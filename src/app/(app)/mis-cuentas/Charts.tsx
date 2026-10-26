"use client";

import { useState } from "react";
import { formatEUR } from "@/lib/gastos/money";
import type { Bucket, Slice } from "@/lib/personal/compute";

const compactEUR = (cents: number) => formatEUR(cents).replace(/\s?€/, " €");

/**
 * Gasto por mes o por día. Una sola serie (lo que gastas) y, si hay sueldo, una marca de «ingresos» en cada mes.
 * Al tocar o pasar por una barra se lee su valor arriba; sin tocar nada, se lee el total.
 */
export function SpendChart({ buckets, totalCents }: { buckets: Bucket[]; totalCents: number }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.cents, b.incomeCents ?? 0)));
  const peak = buckets.reduce((top, b) => (b.cents > top.cents ? b : top), buckets[0]);
  const active = buckets.find((b) => b.key === activeKey) ?? null;
  const monthly = buckets.length <= 12;
  const hasIncome = buckets.some((b) => b.incomeCents != null && b.incomeCents > 0);

  return (
    <div>
      <p className="min-h-10 text-sm" aria-live="polite">
        {active ? (
          <>
            <span className="font-medium">{monthly ? active.label : `Día ${active.label}`}</span> · gastaste{" "}
            <span className="font-medium">{formatEUR(active.cents)}</span>
            {active.incomeCents != null && active.incomeCents > 0 && <span className="text-ink-soft"> · ingresos {formatEUR(active.incomeCents)}</span>}
          </>
        ) : (
          <span className="text-ink-soft">
            Total del período <span className="font-medium text-ink">{formatEUR(totalCents)}</span>
            {peak && peak.cents > 0 && <> · lo más alto: {monthly ? peak.label : `día ${peak.label}`}</>}
          </span>
        )}
      </p>

      <div className="mt-1 flex h-44 items-end gap-[3px] lg:h-52" role="group" aria-label="Gasto por periodo" onMouseLeave={() => setActiveKey(null)}>
        {buckets.map((b) => {
          const height = (b.cents / max) * 100;
          const income = b.incomeCents != null && b.incomeCents > 0 ? (b.incomeCents / max) * 100 : null;
          const dim = activeKey != null && activeKey !== b.key;
          return (
            <button
              key={b.key}
              type="button"
              onMouseEnter={() => setActiveKey(b.key)}
              onFocus={() => setActiveKey(b.key)}
              onClick={() => setActiveKey(activeKey === b.key ? null : b.key)}
              aria-label={`${monthly ? b.label : `Día ${b.label}`}: ${formatEUR(b.cents)}`}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none"
            >
              {income != null && (
                <span aria-hidden className="absolute inset-x-0 z-10 border-t-2 border-dashed border-ink-soft/70" style={{ bottom: `${income}%` }} />
              )}
              <span
                className={`block w-full rounded-t-[4px] bg-terracotta transition-opacity group-focus-visible:ring-2 group-focus-visible:ring-forest ${dim ? "opacity-40" : ""}`}
                style={{ height: b.cents > 0 ? `max(${height}%, 3px)` : "0" }}
              />
              {/* Zona táctil más grande que la barra */}
              <span aria-hidden className="absolute inset-0" />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-ink-soft lg:text-xs" aria-hidden>
        {buckets.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 text-center">
            {monthly || i === 0 || (i + 1) % 5 === 0 ? b.label : ""}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-terracotta" /> Gastos
        </span>
        {hasIncome && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-ink-soft/70" /> Ingresos
          </span>
        )}
      </div>
    </div>
  );
}

/** Barras horizontales ordenadas, con el nombre, el importe y el porcentaje escritos (no solo color). */
export function BarList({ slices, empty }: { slices: Slice[]; empty: string }) {
  const total = slices.reduce((s, x) => s + x.cents, 0);
  const max = Math.max(1, ...slices.map((x) => x.cents));
  if (slices.length === 0 || total === 0) return <p className="py-4 text-center text-sm text-ink-soft">{empty}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {slices.map((s) => (
        <li key={s.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{s.label}</span>
            <span className="shrink-0">
              <span className="font-medium">{compactEUR(s.cents)}</span>
              <span className="ml-2 text-xs text-ink-soft">{Math.round((s.cents / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-washi-deep">
            <div className="h-full rounded-full bg-terracotta" style={{ width: `${Math.max(2, (s.cents / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Medidor de una meta: lo logrado frente a lo que querías. */
export function Meter({ label, valueCents, goalCents, hint }: { label: string; valueCents: number; goalCents: number; hint?: string }) {
  const pct = goalCents > 0 ? Math.min(100, Math.round((valueCents / goalCents) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-soft">{label}</span>
        <span>
          <span className="font-medium">{formatEUR(valueCents)}</span>
          {goalCents > 0 && <span className="text-ink-soft"> de {formatEUR(goalCents)}</span>}
        </span>
      </div>
      <div
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-washi-deep"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${goalCents > 0 ? Math.max(pct, valueCents > 0 ? 2 : 0) : 0}%` }} />
      </div>
      {(goalCents > 0 || hint) && (
        <p className="mt-1 text-xs text-ink-soft">{goalCents > 0 ? `${pct}%${pct >= 100 ? " · ¡meta cumplida! 🎉" : ""}` : hint}</p>
      )}
    </div>
  );
}
