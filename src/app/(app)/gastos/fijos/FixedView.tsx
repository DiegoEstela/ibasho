"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Plus, Repeat, Send } from "lucide-react";
import { GastosTabs } from "@/components/ui/GastosTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryErrorBanner } from "@/components/query/QueryErrorBanner";
import { CatIcon } from "@/components/ui/CatIcon";
import { colorFor } from "@/lib/compras/icons";
import { expenseCategory } from "@/lib/gastos/categories";
import { formatEUR, parseAmount, toCents } from "@/lib/gastos/money";
import { fijosKey, useFijos } from "@/lib/fijos/queries";
import {
  addMonths, amountCents, dueDateIn, everyLabel, isDueIn, nextDueMonth, type Fixed, type FixedEntry,
} from "@/lib/fijos/schedule";
import { createClient } from "@/lib/supabase/client";
import { removeFiles } from "@/lib/viajes/storage";
import type { Card, Person } from "../tarjetas/types";
import { sendFixedToExpenses } from "./actions";
import { FixedSheet } from "./FixedSheet";

type Props = {
  householdId: string;
  userId: string;
  people: Person[];
  cards: Card[];
  initialFixeds: Fixed[];
  initialEntries: FixedEntry[];
};

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const text = new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const centsText = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function FixedView({ householdId, userId, people, cards, initialFixeds, initialEntries }: Props) {
  const [supabase] = useState(() => createClient());
  const [today] = useState(todayISO);
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);

  const queryClient = useQueryClient();
  const {
    data: { fixeds, entries },
    patch,
    isError,
    isFetching,
  } = useFijos(supabase, householdId, { fixeds: initialFixeds, entries: initialEntries });

  const [sheet, setSheet] = useState<{ open: boolean; fixed: Fixed | null }>({ open: false, fixed: null });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; link: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clearDraft = (id: string) =>
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[id];
      return rest;
    });
  // Cambiar de mes descarta lo que se estaba escribiendo del otro.
  const goTo = (ym: string) => {
    setDrafts({});
    setMonth(ym);
  };

  const refetch = useCallback(() => queryClient.invalidateQueries({ queryKey: fijosKey(householdId) }), [queryClient, householdId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const queue = () => {
      clearTimeout(timer);
      timer = setTimeout(refetch, 350);
    };
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`fijos-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixed_expenses", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixed_expense_entries", filter }, queue)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, householdId, refetch]);

  const write = useMutation({
    mutationFn: async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await run();
      if (error) throw new Error(error.message);
    },
    meta: { errorMessage: "No se pudo guardar el cambio." },
    onError: () => {
      refetch();
    },
    onSuccess: () => {
      refetch();
    },
  });

  const entryOf = (fixedId: string) => entries.find((e) => e.fixed_id === fixedId && e.month.slice(0, 7) === month);

  const dueNow = useMemo(() => fixeds.filter((f) => isDueIn(f, month)), [fixeds, month]);
  const notNow = useMemo(() => fixeds.filter((f) => !isDueIn(f, month)), [fixeds, month]);
  const totalCents = dueNow.reduce((s, f) => s + (drafts[f.id] !== undefined ? toCents(parseAmount(drafts[f.id]) ?? 0) : amountCents(f, entries, month)), 0);
  const sentCents = dueNow.reduce((s, f) => (entryOf(f.id)?.expense_id ? s + amountCents(f, entries, month) : s), 0);

  const nameOf = (id: string | null) => (id ? (id === userId ? "Tú" : (people.find((p) => p.id === id)?.name ?? "Alguien")) : null);

  function showNotice(text: string, link = false) {
    clearTimeout(noticeTimer.current);
    setNotice({ text, link });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }

  /** Guarda el importe de este mes; queda como referencia para el próximo. */
  function saveAmount(fixed: Fixed, text: string) {
    const amount = parseAmount(text);
    if (amount === null) return showNotice("El importe no es válido.");
    clearDraft(fixed.id);
    patch((d) => ({
      entries: [
        ...d.entries.filter((e) => !(e.fixed_id === fixed.id && e.month.slice(0, 7) === month)),
        { id: entryOf(fixed.id)?.id ?? `tmp-${fixed.id}`, fixed_id: fixed.id, month: `${month}-01`, amount, expense_id: entryOf(fixed.id)?.expense_id ?? null },
      ],
    }));
    // Solo se guarda el importe de este mes: los meses anteriores conservan lo que costaron.
    write.mutate(() =>
      supabase
        .from("fixed_expense_entries")
        .upsert({ household_id: householdId, fixed_id: fixed.id, month: `${month}-01`, amount }, { onConflict: "fixed_id,month" }),
    );
  }

  async function sendToExpenses(fixed: Fixed) {
    if (people.length < 2) return showNotice("Esta opción estará disponible cuando tu pareja se una al hogar.");
    const amount = parseAmount(drafts[fixed.id] ?? centsText(amountCents(fixed, entries, month)));
    if (amount === null || amount <= 0) return showNotice("Escribe primero cuánto fue este mes.");
    const due = dueDateIn(month, fixed.due_day);
    setBusy(fixed.id);
    const result = await sendFixedToExpenses(fixed.id, month, amount, due > today ? today : due);
    setBusy(null);
    if (!result.ok) return showNotice(result.message);
    clearDraft(fixed.id);
    queryClient.invalidateQueries();
    showNotice(`Listo: «${fixed.name}» ya está en Gastos compartidos.`, true);
  }

  function removeFixed(fixed: Fixed) {
    setSheet({ open: false, fixed: null });
    const files = entries.filter((e) => e.fixed_id === fixed.id && e.file_path).map((e) => e.file_path!);
    patch((d) => ({ fixeds: d.fixeds.filter((f) => f.id !== fixed.id) }));
    write.mutate(async () => {
      const result = await supabase.from("fixed_expenses").delete().eq("id", fixed.id);
      // Los archivos de las facturas se borran junto con el gasto fijo.
      if (!result.error) await removeFiles(supabase, files);
      return result;
    });
  }

  const meta = (f: Fixed) =>
    [
      everyLabel(f.every_months),
      f.due_day ? `día ${f.due_day}` : null,
      f.card_id ? cards.find((c) => c.id === f.card_id)?.name : null,
      f.paid_by ? `paga ${nameOf(f.paid_by)}` : f.card_id ? "tarjeta compartida" : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Gastos"
        subtitle="Gastos fijos"
        actions={
          <button
            onClick={() => setSheet({ open: true, fixed: null })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> Fijo
          </button>
        }
      />
      <GastosTabs active="fijos" />
      {isError && <QueryErrorBanner onRetry={refetch} retrying={isFetching} />}

      {fixeds.length === 0 ? (
        <div className="mt-2 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-sky/25 text-sky">
            <Repeat size={28} strokeWidth={1.5} />
          </span>
          <div>
            <p className="font-display text-lg font-bold">Apunta lo que se paga siempre</p>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">
              Luz, agua (cada 3 meses), internet, gimnasio, suscripciones… Cada mes cambias el importe, lo guardas y queda de referencia para el siguiente.
            </p>
          </div>
          <button
            onClick={() => setSheet({ open: true, fixed: null })}
            className="min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95"
          >
            Agregar gasto fijo
          </button>
        </div>
      ) : (
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
            <button onClick={() => goTo(addMonths(month, -1))} aria-label="Mes anterior" className="flex size-11 items-center justify-center rounded-xl text-ink-soft">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => goTo(currentMonth)} className="min-h-11 px-3 font-display text-base font-bold">
              {monthName(month)}
            </button>
            <button onClick={() => goTo(addMonths(month, 1))} aria-label="Mes siguiente" className="flex size-11 items-center justify-center rounded-xl text-ink-soft">
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">Toca pagar</p>
              <p className="truncate text-xs text-ink-soft">
                {dueNow.length === 0
                  ? "Ningún gasto este mes"
                  : `${dueNow.length} ${dueNow.length === 1 ? "gasto" : "gastos"}${sentCents > 0 ? ` · ${formatEUR(sentCents)} en gastos` : ""}`}
              </p>
            </div>
            <p className="shrink-0 font-display text-xl font-bold">{formatEUR(totalCents)}</p>
          </div>

          {dueNow.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {dueNow.map((f) => {
                const cat = expenseCategory(f.category);
                const sent = !!entryOf(f.id)?.expense_id;
                const reference = centsText(amountCents(f, entries, month));
                const value = drafts[f.id] ?? reference;
                const changed = drafts[f.id] !== undefined && drafts[f.id] !== reference;
                return (
                  <li key={f.id} className="flex items-center gap-2.5 px-3 py-2">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `color-mix(in srgb, ${colorFor(cat.color)} 22%, transparent)`, color: colorFor(cat.color) }}
                    >
                      <CatIcon name={cat.icon} size={16} />
                    </span>
                    <button onClick={() => setSheet({ open: true, fixed: f })} className="min-w-0 flex-1 text-left" aria-label={`Editar ${f.name}`}>
                      <span className="block truncate text-[15px] font-medium leading-tight">{f.name}</span>
                      <span className="block truncate text-[11px] text-ink-soft">{meta(f)}</span>
                    </button>

                    <div className="relative w-[5.5rem] shrink-0">
                      <input
                        value={value}
                        onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && changed && saveAmount(f, value)}
                        disabled={sent}
                        inputMode="decimal"
                        aria-label={`Importe de ${f.name} en ${monthName(month)}`}
                        className="h-10 w-full rounded-lg border border-line bg-background pl-2.5 pr-6 text-right text-[15px] outline-none focus:border-forest disabled:opacity-60"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft">€</span>
                    </div>

                    {changed && !sent ? (
                      <button
                        onClick={() => saveAmount(f, value)}
                        aria-label="Guardar importe"
                        title="Guardar importe"
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-forest text-surface active:scale-95"
                      >
                        <Check size={18} />
                      </button>
                    ) : sent ? (
                      <Link href="/gastos" aria-label="Ya está en gastos" title="Ya está en gastos" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-forest/15 text-forest">
                        <Check size={18} />
                      </Link>
                    ) : (
                      <button
                        onClick={() => sendToExpenses(f)}
                        disabled={busy === f.id}
                        aria-label={`Pasar ${f.name} a gastos`}
                        title="Pasar a gastos"
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-forest text-forest transition active:scale-95 disabled:opacity-60"
                      >
                        <Send size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {notNow.length > 0 && (
            <>
              <h2 className="mb-2 mt-5 px-1 font-display text-base font-bold">No toca este mes</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {notNow.map((f) => {
                  const next = nextDueMonth(f, month);
                  const future = next > month;
                  return (
                    <li key={f.id}>
                      <button onClick={() => setSheet({ open: true, fixed: f })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{f.name}</span>
                          <span className="block truncate text-xs text-ink-soft">
                            {meta(f)}
                            {future ? ` · llega en ${monthName(next).toLowerCase()}` : " · ya no toca"}
                          </span>
                        </span>
                        <span className="text-sm text-ink-soft">{formatEUR(amountCents(f, entries, month))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 px-1 text-xs text-ink-soft">El importe que ves es el último que guardaste: sirve de referencia para cuando toque.</p>
            </>
          )}
        </div>
      )}

      <FixedSheet
        open={sheet.open}
        onClose={() => setSheet({ open: false, fixed: null })}
        householdId={householdId}
        fixed={sheet.fixed}
        entries={entries}
        people={people}
        meId={userId}
        cards={cards.filter((c) => c.kind === "credit")}
        currentMonth={currentMonth}
        month={month}
        onChanged={refetch}
        onSaved={() => {
          setSheet({ open: false, fixed: null });
          refetch();
        }}
        onDelete={removeFixed}
      />

      {notice && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-background shadow-lg lg:bottom-8"
        >
          <span>{notice.text}</span>
          {notice.link && <Link href="/gastos" className="min-h-9 shrink-0 py-2 font-medium text-sakura">Ver</Link>}
        </div>
      )}
    </section>
  );
}
