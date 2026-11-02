"use client";

import { useState } from "react";
import { CreditCard, Home, Lock, Plus, Repeat, Wallet } from "lucide-react";
import { colorFor } from "@/lib/compras/icons";
import { amountCents, dueDateIn, isDueIn, nextDueMonth } from "@/lib/fijos/schedule";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { sharePercent } from "@/lib/personal/fijos";
import { monthName } from "@/lib/personal/compute";
import type { CardTile } from "@/lib/personal/presupuesto";
import type { MisCuentasData, PersonalCard, PersonalFixed } from "@/lib/personal/types";
import { cardLabel } from "@/lib/tarjetas/labels";

type Props = {
  data: MisCuentasData;
  tiles: CardTile[];
  currentMonth: string;
  onAddCard: () => void;
  onEditCard: (card: PersonalCard) => void;
  onAddFixed: () => void;
  onEditFixed: (fixed: PersonalFixed) => void;
  onEditShare: (fixedId: string) => void;
};

const everyText = (n: number) => (n === 1 ? "cada mes" : n === 12 ? "cada año" : `cada ${n} meses`);

/** Tus tarjetas (privadas y del hogar) y tus gastos fijos (propios y la parte de los del hogar). */
export function TarjetasFijosTab({ data, tiles, currentMonth, onAddCard, onEditCard, onAddFixed, onEditFixed, onEditShare }: Props) {
  const [showAllHousehold, setShowAllHousehold] = useState(false);
  const household = data.householdFixed;
  const visibleHousehold = showAllHousehold ? household : household.filter((f) => sharePercent(data, f.id) > 0);

  return (
    <div className="mt-4 flex flex-col gap-8">
      {/* Tarjetas */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <h2 className="font-display text-lg font-bold lg:text-xl">Mis tarjetas</h2>
          <button onClick={onAddCard} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95">
            <Plus size={16} /> Tarjeta privada
          </button>
        </div>
        {tiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center">
            <CreditCard className="mx-auto text-forest" size={32} strokeWidth={1.5} />
            <p className="mt-2 font-display text-lg font-bold">Aún no tienes tarjetas</p>
            <p className="mt-1 text-sm text-ink-soft">Crea una tarjeta privada de débito o crédito: solo la ves tú.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => {
              const card = data.personalCards.find((c) => c.id === t.id);
              const body = (
                <>
                  <span className="flex items-center gap-3">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `color-mix(in srgb, ${colorFor(t.color)} 22%, transparent)`, color: colorFor(t.color) }}
                    >
                      {t.kind === "debit" ? <Wallet size={19} strokeWidth={1.75} /> : <CreditCard size={19} strokeWidth={1.75} />}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[15px] font-medium">{cardLabel(t)}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-ink-soft">
                        {t.isPrivate ? <Lock size={11} /> : <Home size={11} />}
                        {t.isPrivate ? "Privada" : "Del hogar"} · {t.kind === "debit" ? "Débito" : "Crédito"}
                      </span>
                    </span>
                  </span>
                  <span className="mt-3 flex items-end justify-between gap-2">
                    <span>
                      <span className="block text-[11px] uppercase tracking-wider text-ink-soft">{t.balanceCents != null ? "Saldo" : "Este mes"}</span>
                      <span className={`block font-display text-xl font-bold ${t.balanceCents != null && t.balanceCents < 0 ? "text-hanko" : ""}`}>
                        {formatEUR(t.balanceCents ?? t.monthCents)}
                      </span>
                    </span>
                    <span className="text-right text-xs text-ink-soft">
                      {t.balanceCents != null ? `${formatEUR(t.monthCents)} gastados este mes` : t.dueDay ? `Pagas el día ${t.dueDay}` : t.isPrivate ? "" : "Gastos tuyos con ella"}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={t.key}>
                  {card ? (
                    <button onClick={() => onEditCard(card)} className="block w-full rounded-2xl border border-line bg-surface p-4 text-left transition active:scale-[0.99]">
                      {body}
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-line bg-surface p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 px-1 text-xs text-ink-soft">Las del hogar se editan en Gastos → Tarjetas. Aquí solo ves lo tuyo con ellas.</p>
      </section>

      {/* Fijos propios */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <h2 className="font-display text-lg font-bold lg:text-xl">Mis gastos fijos</h2>
          <button onClick={onAddFixed} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95">
            <Plus size={16} /> Gasto fijo
          </button>
        </div>
        {data.personalFixed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center">
            <Repeat className="mx-auto text-forest" size={32} strokeWidth={1.5} />
            <p className="mt-2 font-display text-lg font-bold">Sin gastos fijos propios</p>
            <p className="mt-1 text-sm text-ink-soft">Gimnasio, móvil, seguro… se suman solos a tu presupuesto cada mes.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {data.personalFixed.map((f) => {
              const next = nextDueMonth(f, currentMonth);
              return (
                <li key={f.id}>
                  <button onClick={() => onEditFixed(f)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition active:bg-washi-deep/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{f.name}</span>
                      <span className="block truncate text-xs text-ink-soft">
                        {f.category} · {everyText(f.every_months)} · próximo {monthName(next, false).toLowerCase()}
                      </span>
                    </span>
                    <span className="text-[15px] font-medium">{formatEUR(toCents(f.amount))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Fijos del hogar */}
      <section>
        <h2 className="mb-1 font-display text-lg font-bold lg:text-xl">Fijos del hogar · tu parte</h2>
        <p className="mb-2 px-1 text-xs text-ink-soft">Luz, internet, alquiler… Por defecto cuenta la mitad de cada uno. Toca uno para cambiarlo.</p>
        {household.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
            Cuando agreguen gastos fijos en Gastos → Fijos, aparecerán aquí.
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {visibleHousehold.map((f) => {
                const percent = sharePercent(data, f.id);
                const month = isDueIn(f, currentMonth) ? currentMonth : nextDueMonth(f, currentMonth);
                const full = amountCents(f, data.fixedEntries, month);
                return (
                  <li key={f.id}>
                    <button onClick={() => onEditShare(f.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition active:bg-washi-deep/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{f.name}</span>
                        <span className="block truncate text-xs text-ink-soft">
                          {everyText(f.every_months)} · {formatEUR(full)} en total · día {dueDateIn(month, f.due_day).slice(8)} de {monthName(month, false).toLowerCase()}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[15px] font-medium">{formatEUR(Math.round((full * percent) / 100))}</span>
                        <span className="block text-[11px] text-ink-soft">{percent === 50 ? "la mitad" : percent === 0 ? "no cuenta" : `${percent}%`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {household.some((f) => sharePercent(data, f.id) <= 0) && (
              <button onClick={() => setShowAllHousehold((v) => !v)} className="mt-2 min-h-10 px-1 text-sm font-medium text-forest">
                {showAllHousehold ? "Ocultar los que no cuentan" : "Mostrar también los que no cuentan"}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
