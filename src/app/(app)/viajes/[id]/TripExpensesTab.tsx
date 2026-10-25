"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Download, Plus, Trash2, Users } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { netBalances, simplifyDebts, type Participant, type Transfer } from "@/lib/gastos/balance";
import { expenseCategory } from "@/lib/gastos/categories";
import { formatMoney } from "@/lib/gastos/currency";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { ensureTripGroup, syncParticipants } from "@/lib/gastos/setup";
import { cardLabel } from "@/lib/tarjetas/labels";
import { ExpenseSheet, type PayCard } from "../../gastos/ExpenseSheet";
import { SettleSheet } from "../../gastos/SettleSheet";
import type { Expense, Settlement, Split } from "../../gastos/types";
import { formatDate, type Trip } from "../types";
import { PeopleSheet } from "./PeopleSheet";

type Props = {
  trip: Trip;
  householdId: string;
  userId: string;
  userEmail: string;
};

type Loaded = {
  groupId: string;
  cards: PayCard[];
  participants: Participant[];
  expenses: Expense[];
  splits: Split[];
  settlements: Settlement[];
};

type HistoryRow =
  | { kind: "expense"; key: string; date: string; created: string; expense: Expense }
  | { kind: "settlement"; key: string; date: string; created: string; settlement: Settlement };

const card = "rounded-2xl border border-line bg-surface p-4 lg:p-5";

/** Gastos del viaje: el mismo motor que Gastos del hogar, con su propio balance, amigos sin cuenta y varias monedas. */
export function TripExpensesTab({ trip, householdId, userId, userEmail }: Props) {
  const [supabase] = useState(() => createClient());
  const [data, setData] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<{ step: string; detail: string } | null>(null);

  const [expenseSheet, setExpenseSheet] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [settleSheet, setSettleSheet] = useState<{ open: boolean; suggestion: Transfer | null }>({ open: false, suggestion: null });
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [settlementDetail, setSettlementDetail] = useState<Settlement | null>(null);

  // ---------- Carga: grupo del viaje, personas y movimientos ----------
  const loadMovements = useCallback(
    async (groupId: string) => {
      const [participants, expenses, splits, settlements, cards] = await Promise.all([
        supabase.from("expense_participants").select("id, user_id, name, color").eq("group_id", groupId).order("created_at"),
        supabase.from("expenses").select("*").eq("group_id", groupId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
        supabase.from("expense_splits").select("expense_id, participant_id, amount, expenses!inner(group_id)").eq("expenses.group_id", groupId).limit(10000),
        supabase.from("settlements").select("*").eq("group_id", groupId).order("settled_on", { ascending: false }).limit(500),
        supabase.from("cards").select("id, name, last4, kind, owner_user_id").eq("archived", false).order("created_at"),
      ]);
      const failed = [participants, expenses, splits, settlements, cards].find((r) => r.error);
      if (failed?.error) return { error: `${failed.error.code}: ${failed.error.message}` } as const;
      return {
        participants: (participants.data ?? []) as Participant[],
        expenses: (expenses.data ?? []) as Expense[],
        splits: ((splits.data ?? []) as unknown as Split[]).map(({ expense_id, participant_id, amount }) => ({ expense_id, participant_id, amount })),
        settlements: (settlements.data ?? []) as Settlement[],
        cards: (cards.data ?? []) as PayCard[],
      } as const;
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ensured = await ensureTripGroup(supabase, { householdId, tripId: trip.id, name: trip.name });
      if ("error" in ensured) return !cancelled && setProblem(ensured.error);

      const [{ data: members }, { data: profiles }] = await Promise.all([
        supabase.from("household_members").select("user_id").order("joined_at"),
        supabase.from("profiles").select("id, display_name, color"),
      ]);
      // Las personas del hogar se suman solas; los invitados sin cuenta se añaden a mano.
      const synced = await syncParticipants(supabase, {
        householdId,
        groupId: ensured.groupId,
        userId,
        email: userEmail,
        members: members ?? [],
        profiles: profiles ?? [],
      });
      if ("error" in synced) return !cancelled && setProblem(synced.error);

      const loaded = await loadMovements(ensured.groupId);
      if (cancelled) return;
      if ("error" in loaded) return setProblem({ step: "leer los gastos del viaje", detail: loaded.error ?? "error desconocido" });
      setData({ groupId: ensured.groupId, ...loaded });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, householdId, trip.id, trip.name, userId, userEmail, loadMovements]);

  const groupId = data?.groupId;
  const refetch = useCallback(async () => {
    if (!groupId) return;
    const loaded = await loadMovements(groupId);
    if (!("error" in loaded)) setData({ groupId, ...loaded });
  }, [groupId, loadMovements]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!groupId) return;
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const channel = supabase
      .channel(`gastos-viaje-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `group_id=eq.${groupId}` }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter: `group_id=eq.${groupId}` }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_participants", filter: `group_id=eq.${groupId}` }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits", filter: `household_id=eq.${householdId}` }, queue)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [supabase, groupId, householdId, refetch]);

  // ---------- Cálculos ----------
  const participants = useMemo(() => data?.participants ?? [], [data]);
  const expenses = useMemo(() => data?.expenses ?? [], [data]);
  const splits = useMemo(() => data?.splits ?? [], [data]);
  const settlements = useMemo(() => data?.settlements ?? [], [data]);
  const cards = useMemo(() => data?.cards ?? [], [data]);
  const cardName = useCallback((id: string | null) => { const c = cards.find((x) => x.id === id); return c ? cardLabel(c) : null; }, [cards]);

  const me = participants.find((p) => p.user_id === userId) ?? null;
  const nameOf = useCallback(
    (id: string | null) => (id === me?.id ? "Tú" : (participants.find((p) => p.id === id)?.name ?? "Alguien")),
    [participants, me],
  );

  const net = useMemo(() => netBalances(participants, expenses, splits, settlements), [participants, expenses, splits, settlements]);
  const transfers = useMemo(() => simplifyDebts(net), [net]);

  /** Cuánto puso y cuánto le corresponde a cada persona, para ver las cuentas de un vistazo. */
  const perPerson = useMemo(() => {
    const paid = new Map<string, number>();
    const owed = new Map<string, number>();
    for (const e of expenses) if (e.paid_by) paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + toCents(e.amount));
    const payer = new Map(expenses.map((e) => [e.id, e.paid_by]));
    for (const s of splits) if (payer.get(s.expense_id)) owed.set(s.participant_id, (owed.get(s.participant_id) ?? 0) + toCents(s.amount));
    return participants.map((p) => ({ p, paid: paid.get(p.id) ?? 0, owed: owed.get(p.id) ?? 0, net: net[p.id] ?? 0 }));
  }, [participants, expenses, splits, net]);

  const usedIds = useMemo(() => {
    const used = new Set<string>();
    for (const e of expenses) if (e.paid_by) used.add(e.paid_by);
    for (const s of splits) used.add(s.participant_id);
    for (const s of settlements) {
      used.add(s.from_participant);
      used.add(s.to_participant);
    }
    return used;
  }, [expenses, splits, settlements]);

  const total = expenses.reduce((s, e) => s + toCents(e.amount), 0);
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + toCents(e.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [expenses]);

  const history = useMemo<HistoryRow[]>(() => {
    const rows: HistoryRow[] = [
      ...expenses.map<HistoryRow>((expense) => ({ kind: "expense", key: `e-${expense.id}`, date: expense.expense_date, created: expense.created_at, expense })),
      ...settlements.map<HistoryRow>((settlement) => ({ kind: "settlement", key: `s-${settlement.id}`, date: settlement.settled_on, created: settlement.created_at, settlement })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  }, [expenses, settlements]);

  const mySplit = (expenseId: string) => splits.find((s) => s.expense_id === expenseId && s.participant_id === me?.id)?.amount ?? 0;

  // ---------- Acciones ----------
  async function removeExpense(expense: Expense) {
    setExpenseSheet({ open: false, expense: null });
    setData((d) => (d ? { ...d, expenses: d.expenses.filter((e) => e.id !== expense.id) } : d));
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) refetch();
  }

  async function removeSettlement(settlement: Settlement) {
    setSettlementDetail(null);
    setData((d) => (d ? { ...d, settlements: d.settlements.filter((s) => s.id !== settlement.id) } : d));
    const { error } = await supabase.from("settlements").delete().eq("id", settlement.id);
    if (error) refetch();
  }

  function exportCsv() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["Fecha", "Concepto", "Categoría", "Importe (€)", "Moneda", "Importe original", "Pagó", "Tarjeta"].join(";"),
      ...expenses.map((e) =>
        [
          formatDate(e.expense_date),
          escape(e.description),
          escape(e.category),
          e.amount.toFixed(2).replace(".", ","),
          e.currency,
          (e.original_amount ?? e.amount).toFixed(2).replace(".", ","),
          escape(e.paid_by ? (participants.find((p) => p.id === e.paid_by)?.name ?? "") : "Cuenta compartida"),
          escape(cardName(e.card_id) ?? ""),
        ].join(";"),
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos-${trip.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const onSaved = () => {
    setExpenseSheet({ open: false, expense: null });
    setSettleSheet({ open: false, suggestion: null });
    refetch();
  };

  // ---------- Pantallas de espera y de error ----------
  if (problem) {
    console.error(`[viajes] ${problem.step}: ${problem.detail}`);
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
        <p className="font-medium text-ink">No pudimos cargar los gastos del viaje.</p>
        <p className="mt-2">Paso que falló: <span className="font-mono">{problem.step}</span></p>
        <p className="mt-1 break-words font-mono text-xs">{problem.detail}</p>
        <p className="mt-2 text-xs">Si dice que falta una columna o una función, ejecuta la migración 0011 en Supabase.</p>
      </div>
    );
  }
  if (!data || !me) {
    return (
      <div aria-busy="true" aria-label="Cargando los gastos del viaje" className="animate-pulse">
        <div className="h-12 rounded-2xl bg-washi-deep" />
        <div className="mt-3 h-28 rounded-2xl bg-washi-deep" />
        <div className="mt-3 h-24 rounded-2xl bg-washi-deep" />
      </div>
    );
  }

  // Frase de balance personal
  const myOwes = transfers.filter((t) => t.from === me.id);
  const myOwed = transfers.filter((t) => t.to === me.id);
  let headline = "Están a mano";
  let tone = "text-ink";
  if (myOwes.length > 0) {
    const sum = myOwes.reduce((s, t) => s + t.cents, 0);
    headline = myOwes.length === 1 ? `Le debes ${formatEUR(sum)} a ${nameOf(myOwes[0].to)}` : `Debes ${formatEUR(sum)} en total`;
    tone = "text-hanko";
  } else if (myOwed.length > 0) {
    const sum = myOwed.reduce((s, t) => s + t.cents, 0);
    headline = myOwed.length === 1 ? `${nameOf(myOwed[0].from)} te debe ${formatEUR(sum)}` : `Te deben ${formatEUR(sum)} en total`;
    tone = "text-forest";
  } else if (transfers.length > 0) {
    headline = "Hay saldos pendientes entre los demás";
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Gastos del viaje</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} aria-label="Exportar a CSV" className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90">
            <Download size={17} />
          </button>
          <button onClick={() => setPeopleOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-forest transition active:scale-95">
            <Users size={15} /> {participants.length}
          </button>
          <button onClick={() => setExpenseSheet({ open: true, expense: null })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95">
            <Plus size={16} /> Gasto
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-8">
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 lg:self-start">
          {/* Balance */}
          <div className={card}>
            <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Balance</p>
            <p className={`mt-1 font-display text-xl font-bold leading-snug lg:text-2xl ${tone}`}>{headline}</p>
            {transfers.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {transfers.map((t) => (
                  <li key={`${t.from}-${t.to}`} className="flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {nameOf(t.from)} → {nameOf(t.to)} · <span className="font-medium">{formatEUR(t.cents)}</span>
                    </span>
                    <button onClick={() => setSettleSheet({ open: true, suggestion: t })} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-forest/15 px-3 text-xs font-medium text-forest transition active:scale-95">
                      <Banknote size={14} /> Saldar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Las cuentas de cada persona */}
          <div className={card}>
            <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Cuentas de cada uno</p>
            <ul className="mt-2 flex flex-col gap-2.5">
              {perPerson.map(({ p, paid, owed, net: balance }) => (
                <li key={p.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="truncate font-medium">{nameOf(p.id)}</span>
                      {!p.user_id && <span className="shrink-0 rounded-full bg-washi-deep px-1.5 text-[10px] text-ink-soft">Invitado</span>}
                    </span>
                    <span className={`shrink-0 font-medium ${balance > 0 ? "text-forest" : balance < 0 ? "text-hanko" : "text-ink-soft"}`}>
                      {balance > 0 ? "+" : balance < 0 ? "−" : ""}
                      {formatEUR(Math.abs(balance))}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-[18px] text-xs text-ink-soft">
                    Puso {formatEUR(paid)} · Le corresponden {formatEUR(owed)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Total y categorías */}
          <div className={card}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Total del viaje</p>
              <p className="text-xs text-ink-soft">{expenses.length} {expenses.length === 1 ? "gasto" : "gastos"}</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold">{formatEUR(total)}</p>
            {categories.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {categories.map(([name, cents]) => {
                  const cat = expenseCategory(name);
                  return (
                    <li key={name} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <CatIcon name={cat.icon} size={14} style={{ color: colorFor(cat.color) }} /> {name}
                        </span>
                        <span className="text-ink-soft">{formatEUR(cents)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-washi-deep">
                        <div className="h-full rounded-full" style={{ width: `${(cents / total) * 100}%`, background: colorFor(cat.color) }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Historial */}
        <div className="lg:col-start-1 lg:row-start-1">
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center">
              <span className="text-4xl" aria-hidden>🧾</span>
              <p className="mt-2 font-display text-lg font-bold">Aún no hay gastos</p>
              <p className="mt-1 text-sm text-ink-soft">
                Apunta lo que se paga en el viaje, aunque sea en otra moneda: la app lo pasa a euros y calcula quién le debe a quién.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {history.map((row) => {
                if (row.kind === "settlement") {
                  return (
                    <li key={row.key}>
                      <button onClick={() => setSettlementDetail(row.settlement)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-forest/15 text-forest">
                          <Banknote size={18} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{nameOf(row.settlement.from_participant)} pagó a {nameOf(row.settlement.to_participant)}</span>
                          <span className="block text-xs text-ink-soft">Pago · {formatDate(row.settlement.settled_on)}</span>
                        </span>
                        <span className="text-[15px] font-medium text-forest">{formatEUR(toCents(row.settlement.amount))}</span>
                      </button>
                    </li>
                  );
                }
                const e = row.expense;
                const cat = expenseCategory(e.category);
                const mine = mySplit(e.id);
                return (
                  <li key={row.key}>
                    <button onClick={() => setExpenseSheet({ open: true, expense: e })} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${colorFor(cat.color)} 20%, transparent)`, color: colorFor(cat.color) }}>
                        <CatIcon name={cat.icon} size={18} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{e.description}</span>
                        <span className="block truncate text-xs text-ink-soft">
                          {[e.paid_by ? `Pagó ${nameOf(e.paid_by)}` : cardName(e.card_id) ? null : "Cuenta compartida", cardName(e.card_id), formatDate(e.expense_date)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[15px] font-medium">{formatEUR(toCents(e.amount))}</span>
                        <span className="block text-[11px] text-ink-soft">
                          {e.currency !== "EUR" && e.original_amount
                            ? formatMoney(e.original_amount, e.currency)
                            : mine > 0
                              ? `Tu parte ${formatEUR(toCents(mine))}`
                              : "No participas"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button onClick={() => setSettleSheet({ open: true, suggestion: null })} className="mt-3 flex min-h-11 items-center gap-2 px-2 text-sm text-forest">
            <Banknote size={16} /> Registrar un pago
          </button>
        </div>
      </div>

      <ExpenseSheet
        open={expenseSheet.open}
        onClose={() => setExpenseSheet({ open: false, expense: null })}
        groupId={data.groupId}
        participants={participants}
        meId={me.id}
        cards={cards}
        trip={{ currency: trip.currency }}
        expense={expenseSheet.expense}
        splits={splits}
        onSaved={onSaved}
        onDelete={removeExpense}
      />

      <SettleSheet
        open={settleSheet.open}
        onClose={() => setSettleSheet({ open: false, suggestion: null })}
        householdId={householdId}
        groupId={data.groupId}
        participants={participants}
        suggestion={settleSheet.suggestion}
        onSaved={onSaved}
      />

      <PeopleSheet
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        householdId={householdId}
        groupId={data.groupId}
        participants={participants}
        usedIds={usedIds}
        onChanged={refetch}
      />

      <BottomSheet open={!!settlementDetail} onClose={() => setSettlementDetail(null)} title="Pago registrado">
        {settlementDetail && (
          <div className="flex flex-col gap-4">
            <p className="text-[15px]">
              {nameOf(settlementDetail.from_participant)} pagó <span className="font-medium">{formatEUR(toCents(settlementDetail.amount))}</span> a{" "}
              {nameOf(settlementDetail.to_participant)} el {formatDate(settlementDetail.settled_on)}.
            </p>
            <button onClick={() => removeSettlement(settlementDetail)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
              <Trash2 size={16} /> Eliminar este pago
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
