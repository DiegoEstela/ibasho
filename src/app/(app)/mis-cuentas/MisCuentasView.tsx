"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Download, Lock, PiggyBank, Plus, Search, SlidersHorizontal, TrendingUp, Wallet } from "lucide-react";
import { QueryErrorBanner } from "@/components/query/QueryErrorBanner";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { colorFor } from "@/lib/compras/icons";
import { expenseCategory } from "@/lib/gastos/categories";
import { formatEUR } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import {
  accountBalanceCents, addMonths, breakdown, buckets, buildPeriod, inPeriod, monthName, monthOf, movementsCsv, PERIODS, summarize, toMovements, topSlices, totalSavedCents,
  type PeriodMode,
} from "@/lib/personal/compute";
import { useMisCuentas } from "@/lib/personal/queries";
import type { EntryKind, MisCuentasData, Movement, PersonalEntry } from "@/lib/personal/types";
import { BarList, Meter, SpendChart } from "./Charts";
import { EntrySheet } from "./EntrySheet";
import { PlanSheet } from "./PlanSheet";

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const KIND_FILTERS: { value: "" | EntryKind; label: string }[] = [
  { value: "", label: "Todo" },
  { value: "expense", label: "Gastos" },
  { value: "income", label: "Ingresos" },
  { value: "saving", label: "Ahorros" },
];

const SOURCE_BADGE = { compartido: "Compartido", cuota: "Cuota", personal: "Personal" } as const;

const dayLabel = (iso: string, today: string) => {
  if (iso === today) return "Hoy";
  const [y, m, d] = iso.split("-").map(Number);
  const text = new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Icono y color de un movimiento según su tipo o categoría. */
function visual(m: Movement) {
  if (m.kind === "income") return { Icon: TrendingUp, color: "forest" };
  if (m.kind === "saving") return { Icon: PiggyBank, color: "sky" };
  if (m.source === "cuota") return { Icon: CreditCard, color: "sky" };
  const c = expenseCategory(m.category);
  return { Icon: null, color: c.color, icon: c.icon };
}

export function MisCuentasView({ userId, initialData }: { userId: string; initialData: MisCuentasData }) {
  const [supabase] = useState(() => createClient());
  const { data, isError, isFetching, refetch } = useMisCuentas(supabase, userId, initialData);
  const [today] = useState(todayISO);
  const currentMonth = today.slice(0, 7);

  const [mode, setMode] = useState<PeriodMode>("mes");
  const [anchor, setAnchor] = useState(currentMonth);
  const [kindFilter, setKindFilter] = useState<"" | EntryKind>("");
  const [methodFilter, setMethodFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [query, setQuery] = useState("");

  const [entrySheet, setEntrySheet] = useState<{ open: boolean; entry: PersonalEntry | null }>({ open: false, entry: null });
  const [planOpen, setPlanOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const all = useMemo(() => toMovements(data, today), [data, today]);
  const firstMonth = useMemo(() => (all.length ? monthOf(all[all.length - 1].date) : currentMonth), [all, currentMonth]);
  const period = useMemo(() => buildPeriod(mode, anchor, firstMonth, currentMonth), [mode, anchor, firstMonth, currentMonth]);
  const inRange = useMemo(() => inPeriod(all, period), [all, period]);
  const summary = useMemo(() => summarize(inRange, data.plan, period, today), [inRange, data.plan, period, today]);
  const savedTotal = totalSavedCents(data.plan, data);
  const accountNow = accountBalanceCents(data.plan, data, today);
  const savingsTarget = Math.round((data.plan?.saving_target ?? 0) * 100);

  const bars = useMemo(() => buckets(inRange, data.plan, period), [inRange, data.plan, period]);
  const byCategory = useMemo(() => topSlices(breakdown(inRange, (m) => m.category), 6), [inRange]);
  const byMethod = useMemo(() => topSlices(breakdown(inRange, (m) => m.method), 6), [inRange]);

  const methods = useMemo(() => [...new Set(inRange.filter((m) => m.kind === "expense").map((m) => m.method))].sort(), [inRange]);
  const categories = useMemo(() => [...new Set(inRange.filter((m) => m.kind === "expense").map((m) => m.category))].sort(), [inRange]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter(
      (m) =>
        (!kindFilter || m.kind === kindFilter) &&
        (!methodFilter || m.method === methodFilter) &&
        (!categoryFilter || m.category === categoryFilter) &&
        (!q || m.description.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)),
    );
  }, [inRange, kindFilter, methodFilter, categoryFilter, query]);

  const days = useMemo(() => {
    const groups = new Map<string, Movement[]>();
    for (const m of visible) groups.set(m.date, [...(groups.get(m.date) ?? []), m]);
    return [...groups.entries()];
  }, [visible]);

  const step = mode === "mes" ? 1 : mode === "3m" ? 3 : mode === "6m" ? 6 : 12;
  const canGoNext = mode !== "todo" && period.months[period.months.length - 1] < currentMonth && (mode !== "anio" || period.months[0].slice(0, 4) < currentMonth.slice(0, 4));

  function changeMode(next: PeriodMode) {
    setMode(next);
    setAnchor(currentMonth);
    setMethodFilter("");
    setCategoryFilter("");
  }

  function download(list: Movement[], name: string) {
    const blob = new Blob([movementsCsv(list)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mis-cuentas-${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadOpen(false);
  }

  const openEntry = (m: Movement) => {
    const entry = m.entryId ? data.entries.find((e) => e.id === m.entryId) : null;
    if (entry) setEntrySheet({ open: true, entry });
  };

  const hasPlan = !!data.plan && (data.plan.monthly_income > 0 || data.plan.monthly_saving_goal > 0 || data.plan.savings_amount > 0);
  const left = summary.leftCents;
  const iconButton =
    "flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90";

  return (
    <section className="max-w-[1200px]">
      <PageHeader
        title="Mis cuentas"
        back="/inicio"
        subtitle={
          <span className="flex items-center gap-1">
            <Lock size={12} /> Solo lo ves tú
          </span>
        }
        actions={
          <>
            <button onClick={() => setDownloadOpen(true)} aria-label="Descargar" className={iconButton}>
              <Download size={18} />
            </button>
            <button onClick={() => setPlanOpen(true)} aria-label="Mi plan" className={iconButton}>
              <SlidersHorizontal size={18} />
            </button>
            <button
              onClick={() => setEntrySheet({ open: true, entry: null })}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
            >
              <Plus size={16} /> Movimiento
            </button>
          </>
        }
      />

      {isError && <QueryErrorBanner onRetry={() => refetch()} retrying={isFetching} />}

      {/* Período */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 no-scrollbar overflow-x-auto rounded-xl bg-washi-deep p-1" role="tablist" aria-label="Período">
          {PERIODS.map((p) => (
            <button
              key={p.mode}
              role="tab"
              aria-selected={mode === p.mode}
              onClick={() => changeMode(p.mode)}
              className={`min-h-9 flex-1 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition lg:flex-none ${mode === p.mode ? "bg-surface text-forest shadow-sm" : "text-ink-soft"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <button
            onClick={() => setAnchor(addMonths(anchor, -step))}
            disabled={mode === "todo"}
            aria-label="Período anterior"
            className={`${iconButton} disabled:opacity-30`}
          >
            <ChevronLeft size={18} />
          </button>
          <p className="min-w-0 flex-1 text-center font-display text-base font-bold lg:min-w-56 lg:flex-none lg:text-lg">{period.title}</p>
          <button
            onClick={() => setAnchor(addMonths(anchor, step))}
            disabled={!canGoNext}
            aria-label="Período siguiente"
            className={`${iconButton} disabled:opacity-30`}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Hoy: lo que hay en la cuenta y en la caja de ahorro (no dependen del período) */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => setPlanOpen(true)}
          className="min-w-0 rounded-2xl border border-line bg-surface p-4 text-left transition active:scale-[0.99] lg:p-5"
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-ink-soft">
            <Wallet size={14} /> En la cuenta hoy
          </p>
          <p className={`mt-1 truncate font-display text-2xl font-bold lg:text-4xl ${accountNow != null && accountNow < 0 ? "text-hanko" : ""}`}>
            {accountNow == null ? "—" : formatEUR(accountNow)}
          </p>
          <p className="mt-1 truncate text-xs text-ink-soft">
            {accountNow == null ? "Toca para indicar cuánto tienes" : data.plan && data.plan.monthly_income > 0 ? `Cobras ${formatEUR(Math.round(data.plan.monthly_income * 100))} al mes` : "Se ajusta con tus movimientos"}
          </p>
        </button>
        <button
          onClick={() => setPlanOpen(true)}
          className="min-w-0 rounded-2xl border border-line bg-surface p-4 text-left transition active:scale-[0.99] lg:p-5"
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-ink-soft">
            <PiggyBank size={14} /> Caja de ahorro
          </p>
          <p className="mt-1 truncate font-display text-2xl font-bold text-forest lg:text-4xl">{formatEUR(savedTotal)}</p>
          <p className="mt-1 truncate text-xs text-ink-soft">
            {savingsTarget > 0 ? `${Math.min(100, Math.round((savedTotal / savingsTarget) * 100))}% de tu meta de ${formatEUR(savingsTarget)}` : "Pon una meta en «Mi plan»"}
          </p>
        </button>
      </div>

      {/* Resumen del período */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-line bg-surface p-4 lg:col-span-1 lg:p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{hasPlan ? "Te sobra del período" : "Balance"}</p>
          <p className={`mt-1 font-display text-3xl font-bold lg:text-4xl ${left < 0 ? "text-hanko" : "text-ink"}`}>{formatEUR(left)}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {summary.incomeCents > 0 ? `de ${formatEUR(summary.incomeCents)} de ingresos` : "Añade tu sueldo en «Mi plan» para ver cuánto te queda"}
          </p>
        </div>
        <Stat label="Gastos" value={formatEUR(summary.spentCents)} hint={summary.count ? `${summary.count} movimientos · ${formatEUR(summary.avgPerDayCents)}/día` : "Sin gastos"} />
        <Stat label="Ahorrado" value={formatEUR(summary.savedCents)} hint={summary.goalCents > 0 ? `meta ${formatEUR(summary.goalCents)}` : "en este período"} />
        <Stat
          label="Mayor gasto"
          value={summary.biggest ? formatEUR(summary.biggest.cents) : "—"}
          hint={summary.biggest ? summary.biggest.description : "Aún no hay gastos"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={period.months.length > 1 ? "Gasto mes a mes" : "Gasto día a día"}>
          <SpendChart buckets={bars} totalCents={summary.spentCents} />
        </Card>

        <Card title="Mis ahorros">
          {hasPlan ? (
            <div className="flex flex-col gap-4">
              <Meter label="Ahorrado en el período" valueCents={summary.savedCents} goalCents={summary.goalCents} hint="Pon una meta mensual en «Mi plan»" />
              <Meter
                label="Ahorro total"
                valueCents={savedTotal}
                goalCents={savingsTarget}
                hint="Pon una meta total en «Mi plan» si quieres ver tu progreso"
              />
              <button onClick={() => setEntrySheet({ open: true, entry: null })} className="min-h-10 self-start text-sm font-medium text-forest">
                + Apartar dinero
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 py-2">
              <PiggyBank className="text-forest" size={28} strokeWidth={1.5} />
              <p className="text-sm text-ink-soft">Cuéntanos cuánto cobras y cuánto quieres ahorrar, y verás aquí tu progreso del mes.</p>
              <button onClick={() => setPlanOpen(true)} className="min-h-10 rounded-xl bg-forest px-4 text-sm font-medium text-surface">
                Configurar mi plan
              </button>
            </div>
          )}
        </Card>

        <Card title="En qué gastas">
          <BarList slices={byCategory} empty="Aún no hay gastos en este período." />
        </Card>
        <Card title="Con qué pagas">
          <BarList slices={byMethod} empty="Aún no hay gastos en este período." />
        </Card>
      </div>

      {/* Movimientos */}
      <div className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-display text-lg font-bold lg:text-xl">Movimientos</h2>
          <p className="text-xs text-ink-soft">{visible.length} en total</p>
        </div>

        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="relative block flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar un movimiento…"
              aria-label="Buscar un movimiento"
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest"
            />
          </label>
          <div className="flex gap-2">
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} aria-label="Forma de pago" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm lg:flex-none">
              <option value="">Todos los pagos</option>
              {methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Categoría" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm lg:flex-none">
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-3 flex gap-2 chip-row" role="group" aria-label="Tipo de movimiento">
          {KIND_FILTERS.map((k) => (
            <button
              key={k.value || "todo"}
              onClick={() => setKindFilter(k.value)}
              aria-pressed={kindFilter === k.value}
              className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm transition ${kindFilter === k.value ? "border-forest bg-forest text-surface" : "border-line bg-surface text-ink"}`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {days.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
            <p className="font-display text-lg font-bold">{inRange.length === 0 ? "Aún no hay movimientos" : "Nada coincide con los filtros"}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {inRange.length === 0
                ? "Aquí aparecen tu parte de los gastos compartidos, tus cuotas y lo que anotes tú."
                : "Prueba con otra búsqueda o quita algún filtro."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {days.map(([date, list]) => {
              const dayTotal = list.filter((m) => m.kind === "expense").reduce((s, m) => s + m.cents, 0);
              return (
                <div key={date}>
                  <div className="mb-1 flex items-baseline justify-between px-2 text-xs text-ink-soft">
                    <span className="font-medium uppercase tracking-wider">{dayLabel(date, today)}</span>
                    {dayTotal > 0 && <span>−{formatEUR(dayTotal)}</span>}
                  </div>
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                    {list.map((m) => (
                      <MovementRow key={m.key} movement={m} onOpen={m.entryId ? () => openEntry(m) : undefined} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-center text-xs text-ink-soft">
          De los gastos compartidos solo se cuenta tu parte. Para anotar o cambiar uno compartido, ve a Gastos.
        </p>
      </div>

      <EntrySheet open={entrySheet.open} onClose={() => setEntrySheet({ open: false, entry: null })} entry={entrySheet.entry} userId={userId} cards={data.cards} />
      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} plan={data.plan} userId={userId} savedNow={savedTotal} accountNow={accountNow} />

      <BottomSheet open={downloadOpen} onClose={() => setDownloadOpen(false)} title="Descargar">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">Se descarga un archivo CSV que abre Excel o Google Sheets.</p>
          <button
            onClick={() => download(visible, `${period.from.slice(0, 7)}${period.months.length > 1 ? `_${period.to.slice(0, 7)}` : ""}`)}
            className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 text-left transition active:scale-[0.99]"
          >
            <span>
              <span className="block font-medium">Lo que estoy viendo</span>
              <span className="block text-sm text-ink-soft">
                {period.title} · {visible.length} movimientos
              </span>
            </span>
            <Download size={18} className="text-forest" />
          </button>
          <button
            onClick={() => download(all, "todo")}
            className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 text-left transition active:scale-[0.99]"
          >
            <span>
              <span className="block font-medium">Todo el historial</span>
              <span className="block text-sm text-ink-soft">{all.length} movimientos desde {monthName(firstMonth)}</span>
            </span>
            <Download size={18} className="text-forest" />
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 lg:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1 truncate font-display text-xl font-bold lg:text-2xl">{value}</p>
      <p className="mt-1 truncate text-xs text-ink-soft">{hint}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 lg:p-5">
      <h2 className="mb-3 font-display text-base font-bold lg:text-lg">{title}</h2>
      {children}
    </div>
  );
}

function MovementRow({ movement: m, onOpen }: { movement: Movement; onOpen?: () => void }) {
  const v = visual(m);
  const sign = m.kind === "expense" ? "−" : "+";
  const body = (
    <>
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${colorFor(v.color)} 20%, transparent)`, color: colorFor(v.color) }}
      >
        {v.Icon ? <v.Icon size={19} strokeWidth={1.75} /> : <CatIcon name={v.icon ?? "Package"} size={19} strokeWidth={1.75} />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[15px]">{m.description}</span>
        <span className="block truncate text-xs text-ink-soft">
          {[m.kind === "expense" ? m.method : null, m.detail, SOURCE_BADGE[m.source], m.pending ? "Pendiente" : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="text-right">
        <span className={`block text-[15px] font-medium ${m.kind === "expense" ? "" : "text-forest"}`}>
          {sign}
          {formatEUR(m.cents)}
        </span>
        <span className="block text-[11px] text-ink-soft">{m.category}</span>
      </span>
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-2.5 transition active:bg-washi-deep/50">
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5">{body}</div>
      )}
    </li>
  );
}
