"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Download, PiggyBank, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { GastosTabs } from "@/components/ui/GastosTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryErrorBanner } from "@/components/query/QueryErrorBanner";
import { colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { netBalances, simplifyDebts, type Participant, type Transfer } from "@/lib/gastos/balance";
import { expenseCategory, EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { gastosKey, useGastos } from "@/lib/gastos/queries";
import { formatEUR, toCents } from "@/lib/gastos/money";
import type { DepositRow } from "@/lib/tarjetas/debit";
import { cardLabel } from "@/lib/tarjetas/labels";
import type { Card } from "./tarjetas/types";
import { DepositDetailSheet } from "./DepositDetailSheet";
import { DepositSheet } from "./DepositSheet";
import { ExpenseSheet } from "./ExpenseSheet";
import { SettleSheet } from "./SettleSheet";
import { formatDate, type Expense, type Settlement, type Split } from "./types";

type Props = {
  householdId: string;
  groupId: string;
  userId: string;
  participants: Participant[];
  initialExpenses: Expense[];
  initialSplits: Split[];
  initialSettlements: Settlement[];
  initialCards: Card[];
  initialDeposits: DepositRow[];
};

type HistoryRow =
  | { kind: "expense"; key: string; date: string; created: string; expense: Expense }
  | { kind: "settlement"; key: string; date: string; created: string; settlement: Settlement }
  | { kind: "deposit"; key: string; date: string; created: string; deposit: DepositRow };

/** Clave interna para los gastos pagados desde una tarjeta compartida (no tienen una persona que pague). */
const POOL = "__pool";

const monthOf = (iso: string) => iso.slice(0, 7);

/** «Hoy», «Ayer» o «lunes, 27 de octubre» (con el año si no es el actual). Sin pasar la fecha por zonas horarias. */
function dayLabel(iso: string): string {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  const text = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(y !== ty ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const text = new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function ExpensesView({
  householdId,
  groupId,
  userId,
  participants,
  initialExpenses,
  initialSplits,
  initialSettlements,
  initialCards,
  initialDeposits,
}: Props) {
  const [supabase] = useState(() => createClient());
  const [currentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const queryClient = useQueryClient();
  const {
    data: { expenses, splits, settlements, cards, deposits },
    patch,
    isError,
    isFetching,
  } = useGastos(supabase, groupId, {
    expenses: initialExpenses,
    splits: initialSplits,
    settlements: initialSettlements,
    cards: initialCards,
    deposits: initialDeposits,
  });

  const [monthFilter, setMonthFilter] = useState<string>(currentMonth);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositDetail, setDepositDetail] = useState<DepositRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // En el teléfono: pestaña «Gastos» (movimientos) o «Saldos» (quién debe a quién).
  const [sub, setSub] = useState<"gastos" | "saldos">("gastos");

  const [expenseSheet, setExpenseSheet] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [settleSheet, setSettleSheet] = useState<{ open: boolean; suggestion: Transfer | null }>({ open: false, suggestion: null });
  const [settlementDetail, setSettlementDetail] = useState<Settlement | null>(null);

  const me = participants.find((p) => p.user_id === userId) ?? null;
  const person = useCallback((id: string) => participants.find((p) => p.id === id), [participants]);
  const nameOf = useCallback(
    (id: string) => (id === POOL ? "Cuenta compartida" : id === me?.id ? "Tú" : (person(id)?.name ?? "Alguien")),
    [me, person],
  );
  const cardOf = useCallback((id: string | null) => cards.find((c) => c.id === id), [cards]);
  /** Quién pagó: una persona o, si salió de una tarjeta compartida, el nombre de la tarjeta. */
  const payerOf = (e: Expense) => (e.paid_by ? nameOf(e.paid_by) : (cardOf(e.card_id)?.name ?? "Cuenta compartida"));
  /** Nombre de quien puso un ingreso (viene como id de usuario). */
  const userName = useCallback(
    (userId: string | null) => {
      const p = participants.find((x) => x.user_id === userId);
      return p ? (p.id === me?.id ? "Tú" : p.name) : "Alguien";
    },
    [participants, me],
  );

  // ---------- Sincronización ----------
  const refetch = useCallback(() => queryClient.invalidateQueries({ queryKey: gastosKey(groupId) }), [queryClient, groupId]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    // Cada cambio (el tuyo o el de tu pareja) vuelve a pedir los datos; se agrupan para no repetir peticiones.
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`gastos-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_deposits", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards", filter }, queue)
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
  }, [supabase, householdId, groupId, refetch]);

  // ---------- Saldos ----------
  const net = useMemo(() => netBalances(participants, expenses, splits, settlements), [participants, expenses, splits, settlements]);
  const transfers = useMemo(() => simplifyDebts(net), [net]);
  const myOwes = transfers.filter((t) => t.from === me?.id);
  const myOwed = transfers.filter((t) => t.to === me?.id);

  let headline = "Están a mano";
  let tone: "even" | "owe" | "owed" = "even";
  if (myOwes.length > 0) {
    tone = "owe";
    const total = myOwes.reduce((s, t) => s + t.cents, 0);
    headline = myOwes.length === 1 ? `Le debes ${formatEUR(total)} a ${nameOf(myOwes[0].to)}` : `Debes ${formatEUR(total)} en total`;
  } else if (myOwed.length > 0) {
    tone = "owed";
    const total = myOwed.reduce((s, t) => s + t.cents, 0);
    headline = myOwed.length === 1 ? `${nameOf(myOwed[0].from)} te debe ${formatEUR(total)}` : `Te deben ${formatEUR(total)} en total`;
  } else if (transfers.length > 0) {
    headline = "Hay saldos pendientes entre los demás";
  }

  // ---------- Filtros y resumen ----------
  const months = useMemo(() => {
    const set = new Set<string>([currentMonth]);
    for (const e of expenses) set.add(monthOf(e.expense_date));
    for (const s of settlements) set.add(monthOf(s.settled_on));
    for (const d of deposits) set.add(monthOf(d.deposit_date));
    return [...set].sort().reverse();
  }, [expenses, settlements, deposits, currentMonth]);

  const visibleExpenses = useMemo(
    () =>
      expenses.filter(
        (e) =>
          (!monthFilter || monthOf(e.expense_date) === monthFilter) &&
          (!categoryFilter || e.category === categoryFilter) &&
          (!personFilter || e.paid_by === personFilter) &&
          (!cardFilter || e.card_id === cardFilter),
      ),
    [expenses, monthFilter, categoryFilter, personFilter, cardFilter],
  );

  const history = useMemo<HistoryRow[]>(() => {
    const rows: HistoryRow[] = visibleExpenses.map((expense) => ({
      kind: "expense",
      key: `e-${expense.id}`,
      date: expense.expense_date,
      created: expense.created_at,
      expense,
    }));
    if (!categoryFilter) {
      for (const settlement of settlements) {
        if (monthFilter && monthOf(settlement.settled_on) !== monthFilter) continue;
        if (personFilter && settlement.from_participant !== personFilter && settlement.to_participant !== personFilter) continue;
        if (cardFilter) continue;
        rows.push({ kind: "settlement", key: `s-${settlement.id}`, date: settlement.settled_on, created: settlement.created_at, settlement });
      }
      // Los ingresos a tarjetas también forman parte del historial.
      const personUser = participants.find((p) => p.id === personFilter)?.user_id;
      for (const deposit of deposits) {
        if (monthFilter && monthOf(deposit.deposit_date) !== monthFilter) continue;
        if (personFilter && deposit.deposited_by !== personUser) continue;
        if (cardFilter && deposit.card_id !== cardFilter) continue;
        rows.push({ kind: "deposit", key: `i-${deposit.id}`, date: deposit.deposit_date, created: deposit.created_at, deposit });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  }, [visibleExpenses, settlements, deposits, participants, monthFilter, categoryFilter, personFilter, cardFilter]);

  /** El historial por días (más reciente arriba), con lo gastado cada día en el encabezado. */
  const days = useMemo(() => {
    const out: { date: string; rows: HistoryRow[]; totalCents: number }[] = [];
    for (const row of history) {
      let day = out[out.length - 1];
      if (!day || day.date !== row.date) {
        day = { date: row.date, rows: [], totalCents: 0 };
        out.push(day);
      }
      day.rows.push(row);
      if (row.kind === "expense") day.totalCents += toCents(row.expense.amount);
    }
    return out;
  }, [history]);

  /** Cuánto puso y cuánto le corresponde a cada persona, para ver las cuentas de un vistazo. */
  const perPerson = useMemo(() => {
    const paid = new Map<string, number>();
    const owed = new Map<string, number>();
    for (const e of expenses) if (e.paid_by) paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + toCents(e.amount));
    const payer = new Map(expenses.map((e) => [e.id, e.paid_by]));
    for (const sp of splits) if (payer.get(sp.expense_id)) owed.set(sp.participant_id, (owed.get(sp.participant_id) ?? 0) + toCents(sp.amount));
    return participants.map((p) => ({ p, paid: paid.get(p.id) ?? 0, owed: owed.get(p.id) ?? 0, net: net[p.id] ?? 0 }));
  }, [participants, expenses, splits, net]);

  const summary = useMemo(() => {
    const scope = expenses.filter((e) => !monthFilter || monthOf(e.expense_date) === monthFilter);
    const total = scope.reduce((s, e) => s + toCents(e.amount), 0);
    const byCategory = new Map<string, number>();
    const byPerson = new Map<string, number>();
    for (const e of scope) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + toCents(e.amount));
      const payer = e.paid_by ?? POOL;
      byPerson.set(payer, (byPerson.get(payer) ?? 0) + toCents(e.amount));
    }
    return {
      total,
      count: scope.length,
      categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
      people: [...byPerson.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [expenses, monthFilter]);

  const splitsByExpense = useMemo(() => {
    const map = new Map<string, Split[]>();
    for (const s of splits) map.set(s.expense_id, [...(map.get(s.expense_id) ?? []), s]);
    return map;
  }, [splits]);

  const mySplit = (expenseId: string) => splitsByExpense.get(expenseId)?.find((s) => s.participant_id === me?.id)?.amount ?? 0;

  // ---------- Acciones ----------
  const remove = useMutation({
    mutationFn: async ({ table, id }: { table: "expenses" | "settlements" | "card_deposits"; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    meta: { errorMessage: "No se pudo borrar." },
    // Si falla, se vuelve a pedir lo que había para que la fila reaparezca.
    onError: () => {
      refetch();
    },
  });

  function removeExpense(expense: Expense) {
    setExpenseSheet({ open: false, expense: null });
    patch((d) => ({ expenses: d.expenses.filter((e) => e.id !== expense.id) }));
    remove.mutate({ table: "expenses", id: expense.id });
  }

  function removeSettlement(settlement: Settlement) {
    setSettlementDetail(null);
    patch((d) => ({ settlements: d.settlements.filter((s) => s.id !== settlement.id) }));
    remove.mutate({ table: "settlements", id: settlement.id });
  }

  function removeDeposit(deposit: DepositRow) {
    setDepositDetail(null);
    patch((d) => ({ deposits: d.deposits.filter((x) => x.id !== deposit.id) }));
    remove.mutate({ table: "card_deposits", id: deposit.id });
  }

  function exportCsv() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["Fecha", "Concepto", "Categoría", "Importe", "Pagó", "Tarjeta"].join(";"),
      ...visibleExpenses.map((e) =>
        [
          formatDate(e.expense_date),
          escape(e.description),
          escape(e.category),
          e.amount.toFixed(2).replace(".", ","),
          escape(e.paid_by ? (person(e.paid_by)?.name ?? "") : "Cuenta compartida"),
          escape(cardOf(e.card_id)?.name ?? ""),
        ].join(";"),
      ),
    ];
    // El BOM hace que Excel abra los acentos correctamente.
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos-${monthFilter || "todos"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const onSaved = () => {
    setExpenseSheet({ open: false, expense: null });
    setSettleSheet({ open: false, suggestion: null });
    setDepositOpen(false);
  };

  if (participants.length === 0 || !me) {
    return (
      <section>
        <PageHeader title="Gastos" />
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
          No pudimos preparar los gastos del hogar. Recarga la página; si sigue igual, revisa que se haya ejecutado la migración 0005.
        </p>
      </section>
    );
  }

  const toneClass = tone === "owe" ? "text-hanko" : tone === "owed" ? "text-forest" : "text-ink";

  const activeFilters = [monthFilter !== currentMonth, !!categoryFilter, !!personFilter, !!cardFilter].filter(Boolean).length;
  const filterSummary = [
    monthFilter ? monthLabel(monthFilter) : "Todos los meses",
    categoryFilter,
    personFilter ? (person(personFilter)?.id === me.id ? "Yo" : person(personFilter)?.name) : null,
    cardFilter ? cardOf(cardFilter)?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const visibleTotal = visibleExpenses.reduce((sum, e) => sum + toCents(e.amount), 0);

  function clearFilters() {
    setMonthFilter(currentMonth);
    setCategoryFilter("");
    setPersonFilter("");
    setCardFilter("");
  }

  const iconButton =
    "relative flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90";

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Gastos"
        subtitle={monthFilter ? monthLabel(monthFilter) : "Todos los meses"}
        actions={
          <>
            <button onClick={() => setFilterOpen(true)} aria-label={activeFilters ? `Filtros (${activeFilters} activos)` : "Filtros"} className={iconButton}>
              <SlidersHorizontal size={17} />
              {activeFilters > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-surface">{activeFilters}</span>
              )}
            </button>
            <button onClick={() => setDepositOpen(true)} aria-label="Ingresar dinero a una tarjeta" className={`${iconButton} lg:size-auto lg:min-h-11 lg:gap-1.5 lg:rounded-2xl lg:px-4 lg:text-sm lg:font-medium lg:text-forest`}>
              <PiggyBank size={17} /> <span className="hidden lg:inline">Ingreso</span>
            </button>
            <button
              onClick={() => setExpenseSheet({ open: true, expense: null })}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
            >
              <Plus size={16} /> Gasto
            </button>
          </>
        }
      />

      <GastosTabs active="compartidos" />
      {isError && <QueryErrorBanner onRetry={refetch} retrying={isFetching} />}

      {/* Gastos | Saldos (solo en el teléfono; en pantallas grandes se ven juntos) */}
      <div className="mb-3 flex gap-1 rounded-xl bg-washi-deep p-1 lg:hidden" role="tablist" aria-label="Vista de gastos">
        {(
          [
            ["gastos", "Gastos"],
            ["saldos", "Saldos"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            role="tab"
            aria-selected={sub === value}
            onClick={() => setSub(value)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${sub === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"}`}
          >
            {text}
            {value === "saldos" && tone !== "even" && (
              <span className={`size-2 rounded-full ${tone === "owe" ? "bg-hanko" : "bg-forest"}`} aria-label={tone === "owe" ? "Debes dinero" : "Te deben dinero"} />
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-8">
        {/* ===== Gastos: todos los movimientos ===== */}
        <div className={`${sub === "gastos" ? "" : "hidden"} lg:col-start-1 lg:row-start-1 lg:block`}>
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="min-w-0 truncate text-xs text-ink-soft">{filterSummary}</p>
            <p className="shrink-0 text-sm">
              <span className="font-display font-bold">{formatEUR(visibleTotal)}</span>
              <span className="text-xs text-ink-soft"> · {visibleExpenses.length} {visibleExpenses.length === 1 ? "gasto" : "gastos"}</span>
            </p>
          </div>

          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-5 text-center">
              <p className="font-display text-base font-bold">Sin movimientos</p>
              <p className="mt-1 text-sm text-ink-soft">
                {expenses.length === 0 ? "Apunta el primer gasto y la app calcula quién le debe a quién." : "No hay nada con estos filtros."}
              </p>
              {activeFilters > 0 && expenses.length > 0 && (
                <button onClick={clearFilters} className="mt-2 min-h-10 text-sm font-medium text-forest">Quitar los filtros</button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {days.map((day) => (
            <section key={day.date}>
              <div className="mb-1 flex items-baseline justify-between gap-3 px-1">
                <h3 className="text-xs font-medium uppercase tracking-wider text-ink-soft">{dayLabel(day.date)}</h3>
                {day.totalCents > 0 && <p className="text-xs text-ink-soft">{formatEUR(day.totalCents)}</p>}
              </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {day.rows.map((row) =>
                row.kind === "deposit" ? (
                  <DepositItem
                    key={row.key}
                    deposit={row.deposit}
                    cardName={cardOf(row.deposit.card_id) ? cardLabel(cardOf(row.deposit.card_id)!) : "Tarjeta eliminada"}
                    by={userName(row.deposit.deposited_by)}
                    onOpen={() => setDepositDetail(row.deposit)}
                  />
                ) : row.kind === "expense" ? (
                  <ExpenseItem
                    key={row.key}
                    expense={row.expense}
                    payer={payerOf(row.expense)}
                    cardText={cardOf(row.expense.card_id) ? cardLabel(cardOf(row.expense.card_id)!) : null}
                    mine={mySplit(row.expense.id)}
                    onOpen={() => setExpenseSheet({ open: true, expense: row.expense })}
                  />
                ) : (
                  <SettlementItem
                    key={row.key}
                    text={`${nameOf(row.settlement.from_participant)} pagó a ${nameOf(row.settlement.to_participant)}`}
                    amount={row.settlement.amount}
                    onOpen={() => setSettlementDetail(row.settlement)}
                  />
                ),
              )}
            </ul>
            </section>
              ))}
            </div>
          )}
        </div>

        {/* ===== Saldos: cuánto debo / me deben ===== */}
        <div className={`${sub === "saldos" ? "flex" : "hidden"} flex-col gap-3 lg:col-start-2 lg:row-start-1 lg:flex lg:self-start`}>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Balance</p>
            <p className={`mt-1 font-display text-xl font-bold leading-snug ${toneClass}`}>{headline}</p>

            {transfers.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {transfers.map((t) => (
                  <li key={`${t.from}-${t.to}`} className="flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {nameOf(t.from)} → {nameOf(t.to)} · <span className="font-medium">{formatEUR(t.cents)}</span>
                    </span>
                    <button
                      onClick={() => setSettleSheet({ open: true, suggestion: t })}
                      className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-forest/15 px-3 text-xs font-medium text-forest transition active:scale-95"
                    >
                      <Banknote size={14} /> Saldar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button onClick={() => setSettleSheet({ open: true, suggestion: null })} className="mt-3 flex min-h-10 items-center gap-2 text-sm text-forest">
              <Banknote size={15} /> Registrar un pago
            </button>
          </div>

          {/* Cuentas de cada uno */}
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Cuentas de cada uno</p>
            <ul className="mt-2 flex flex-col gap-2.5">
              {perPerson.map(({ p, paid, owed, net: balance }) => (
                <li key={p.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="truncate font-medium">{nameOf(p.id)}</span>
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

          {/* Resumen del mes */}
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{monthFilter ? "Gastado en el mes" : "Total gastado"}</p>
              <p className="text-xs text-ink-soft">
                {summary.count} {summary.count === 1 ? "gasto" : "gastos"}
              </p>
            </div>
            <p className="mt-1 font-display text-xl font-bold">{formatEUR(summary.total)}</p>

            {summary.categories.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-2">
                {summary.categories.map(([name, cents]) => {
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
                        <div className="h-full rounded-full" style={{ width: `${(cents / summary.total) * 100}%`, background: colorFor(cat.color) }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtrar gastos">
        <div className="flex flex-col gap-4">
          {[
            { id: "f-mes", text: "Mes", value: monthFilter, set: setMonthFilter, options: [["", "Todos los meses"], ...months.map((m) => [m, monthLabel(m)])] },
            { id: "f-cat", text: "Categoría", value: categoryFilter, set: setCategoryFilter, options: [["", "Todas las categorías"], ...EXPENSE_CATEGORIES.map((c) => [c.name, c.name])] },
            { id: "f-per", text: "Quién pagó", value: personFilter, set: setPersonFilter, options: [["", "Todas las personas"], ...participants.map((p) => [p.id, p.id === me.id ? "Yo" : p.name])] },
            ...(cards.length > 0
              ? [{ id: "f-tar", text: "Tarjeta", value: cardFilter, set: setCardFilter, options: [["", "Todas las tarjetas"], ...cards.map((c) => [c.id, cardLabel(c)])] }]
              : []),
          ].map((f) => (
            <div key={f.id}>
              <label className="mb-1.5 block text-sm font-medium text-ink-soft" htmlFor={f.id}>{f.text}</label>
              <select
                id={f.id}
                className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-forest"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
              >
                {f.options.map(([value, text]) => (
                  <option key={value} value={value}>{text}</option>
                ))}
              </select>
            </div>
          ))}

          <div className="flex gap-2">
            <button onClick={clearFilters} className="min-h-11 flex-1 rounded-2xl border border-line bg-surface text-sm font-medium text-ink-soft transition active:scale-95">
              Limpiar
            </button>
            <button onClick={exportCsv} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium text-forest transition active:scale-95">
              <Download size={15} /> Exportar CSV
            </button>
          </div>
          <button onClick={() => setFilterOpen(false)} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95">
            Ver {visibleExpenses.length} {visibleExpenses.length === 1 ? "gasto" : "gastos"}
          </button>
        </div>
      </BottomSheet>

      <ExpenseSheet
        open={expenseSheet.open}
        onClose={() => setExpenseSheet({ open: false, expense: null })}
        groupId={groupId}
        participants={participants}
        meId={me.id}
        cards={cards}
        expense={expenseSheet.expense}
        splits={splits}
        onSaved={onSaved}
        onDelete={removeExpense}
      />

      <SettleSheet
        open={settleSheet.open}
        onClose={() => setSettleSheet({ open: false, suggestion: null })}
        householdId={householdId}
        groupId={groupId}
        participants={participants}
        suggestion={settleSheet.suggestion}
        onSaved={onSaved}
      />

      <DepositSheet
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        cards={cards.filter((c) => c.kind === "debit")}
        defaultCardId={cardFilter || null}
        people={participants.filter((p) => p.user_id).map((p) => ({ id: p.user_id as string, name: p.name }))}
        meId={userId}
        householdId={householdId}
        onSaved={onSaved}
      />

      <DepositDetailSheet
        deposit={depositDetail}
        cardName={depositDetail && cardOf(depositDetail.card_id) ? cardLabel(cardOf(depositDetail.card_id)!) : "una tarjeta"}
        by={userName(depositDetail?.deposited_by ?? null)}
        onClose={() => setDepositDetail(null)}
        onDelete={removeDeposit}
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
    </section>
  );
}

/* ---------- Filas del historial (compactas) ---------- */

const rowButton = "flex min-h-12 w-full items-center gap-2.5 px-3 py-1.5 text-left";

function SettlementItem({ text, amount, onOpen }: { text: string; amount: number; onOpen: () => void }) {
  return (
    <li>
      <button onClick={onOpen} className={rowButton}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-forest/15 text-forest">
          <Banknote size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{text}</span>
          <span className="block text-[11px] text-ink-soft">Pago</span>
        </span>
        <span className="text-sm font-medium text-forest">{formatEUR(toCents(amount))}</span>
      </button>
    </li>
  );
}

function DepositItem({ deposit, cardName, by, onOpen }: { deposit: DepositRow; cardName: string; by: string; onOpen: () => void }) {
  return (
    <li>
      <button onClick={onOpen} className={rowButton}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-forest/15 text-forest">
          <PiggyBank size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{deposit.note?.trim() || "Ingreso"} · {cardName}</span>
          <span className="block text-[11px] text-ink-soft">
            Puso {by}
          </span>
        </span>
        <span className="text-sm font-medium text-forest">+{formatEUR(toCents(deposit.amount))}</span>
      </button>
    </li>
  );
}

function ExpenseItem({
  expense,
  payer,
  cardText,
  mine,
  onOpen,
}: {
  expense: Expense;
  payer: string;
  cardText: string | null;
  mine: number;
  onOpen: () => void;
}) {
  const cat = expenseCategory(expense.category);
  const color = colorFor(cat.color);
  return (
    <li>
      <button onClick={onOpen} className={rowButton}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>
          <CatIcon name={cat.icon} size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{expense.description}</span>
          <span className="block truncate text-[11px] text-ink-soft">
            {[expense.paid_by ? `Pagó ${payer}` : cardText ? null : "Cuenta compartida", cardText]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-sm font-medium">{formatEUR(toCents(expense.amount))}</span>
          <span className="block text-[10px] text-ink-soft">{mine > 0 ? `Tu parte ${formatEUR(toCents(mine))}` : "No participas"}</span>
        </span>
      </button>
    </li>
  );
}
