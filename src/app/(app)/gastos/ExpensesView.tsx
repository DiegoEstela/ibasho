"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Download, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { netBalances, simplifyDebts, type Participant, type Transfer } from "@/lib/gastos/balance";
import { expenseCategory, EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { formatEUR, toCents } from "@/lib/gastos/money";
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
};

type HistoryRow =
  | { kind: "expense"; key: string; date: string; created: string; expense: Expense }
  | { kind: "settlement"; key: string; date: string; created: string; settlement: Settlement };

const select =
  "min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-forest";

const monthOf = (iso: string) => iso.slice(0, 7);
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
}: Props) {
  const [supabase] = useState(() => createClient());
  const [currentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [expenses, setExpenses] = useState(initialExpenses);
  const [splits, setSplits] = useState(initialSplits);
  const [settlements, setSettlements] = useState(initialSettlements);

  const [monthFilter, setMonthFilter] = useState<string>(currentMonth);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");

  const [expenseSheet, setExpenseSheet] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [settleSheet, setSettleSheet] = useState<{ open: boolean; suggestion: Transfer | null }>({ open: false, suggestion: null });
  const [settlementDetail, setSettlementDetail] = useState<Settlement | null>(null);

  const me = participants.find((p) => p.user_id === userId) ?? null;
  const person = useCallback((id: string) => participants.find((p) => p.id === id), [participants]);
  const nameOf = useCallback(
    (id: string) => (id === me?.id ? "Tú" : (person(id)?.name ?? "Alguien")),
    [me, person],
  );

  // ---------- Sincronización ----------
  const refetch = useCallback(async () => {
    const [e, s, st] = await Promise.all([
      supabase.from("expenses").select("*").eq("group_id", groupId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
      supabase.from("expense_splits").select("expense_id, participant_id, amount, expenses!inner(group_id)").eq("expenses.group_id", groupId).limit(10000),
      supabase.from("settlements").select("*").eq("group_id", groupId).order("settled_on", { ascending: false }).limit(500),
    ]);
    if (e.data) setExpenses(e.data as Expense[]);
    if (s.data) setSplits((s.data as unknown as Split[]).map(({ expense_id, participant_id, amount }) => ({ expense_id, participant_id, amount })));
    if (st.data) setSettlements(st.data as Settlement[]);
  }, [supabase, groupId]);

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
    return [...set].sort().reverse();
  }, [expenses, settlements, currentMonth]);

  const visibleExpenses = useMemo(
    () =>
      expenses.filter(
        (e) =>
          (!monthFilter || monthOf(e.expense_date) === monthFilter) &&
          (!categoryFilter || e.category === categoryFilter) &&
          (!personFilter || e.paid_by === personFilter),
      ),
    [expenses, monthFilter, categoryFilter, personFilter],
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
        rows.push({ kind: "settlement", key: `s-${settlement.id}`, date: settlement.settled_on, created: settlement.created_at, settlement });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  }, [visibleExpenses, settlements, monthFilter, categoryFilter, personFilter]);

  const summary = useMemo(() => {
    const scope = expenses.filter((e) => !monthFilter || monthOf(e.expense_date) === monthFilter);
    const total = scope.reduce((s, e) => s + toCents(e.amount), 0);
    const byCategory = new Map<string, number>();
    const byPerson = new Map<string, number>();
    for (const e of scope) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + toCents(e.amount));
      byPerson.set(e.paid_by, (byPerson.get(e.paid_by) ?? 0) + toCents(e.amount));
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
  async function removeExpense(expense: Expense) {
    setExpenseSheet({ open: false, expense: null });
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) refetch();
  }

  async function removeSettlement(settlement: Settlement) {
    setSettlementDetail(null);
    setSettlements((prev) => prev.filter((s) => s.id !== settlement.id));
    const { error } = await supabase.from("settlements").delete().eq("id", settlement.id);
    if (error) refetch();
  }

  function exportCsv() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["Fecha", "Concepto", "Categoría", "Importe", "Pagó"].join(";"),
      ...visibleExpenses.map((e) =>
        [
          formatDate(e.expense_date),
          escape(e.description),
          escape(e.category),
          e.amount.toFixed(2).replace(".", ","),
          escape(person(e.paid_by)?.name ?? ""),
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
    refetch();
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

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Gastos"
        subtitle={monthFilter ? monthLabel(monthFilter) : "Todos los meses"}
        actions={
          <>
            <button
              onClick={exportCsv}
              aria-label="Exportar a CSV"
              className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90"
            >
              <Download size={18} />
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

      <div className="mt-1 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:gap-x-10">
        {/* Balance */}
        <div className="rounded-2xl border border-line bg-surface p-4 lg:col-start-2 lg:row-start-1 lg:p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Balance</p>
          <p className={`mt-1 font-display text-xl font-bold leading-snug lg:text-2xl ${toneClass}`}>{headline}</p>

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
        </div>

        {/* Resumen del mes */}
        <div className="rounded-2xl border border-line bg-surface p-4 lg:col-start-2 lg:row-start-2 lg:self-start lg:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              {monthFilter ? "Gastado en el mes" : "Total gastado"}
            </p>
            <p className="text-xs text-ink-soft">
              {summary.count} {summary.count === 1 ? "gasto" : "gastos"}
            </p>
          </div>
          <p className="mt-1 font-display text-2xl font-bold">{formatEUR(summary.total)}</p>

          {summary.categories.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
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

          {summary.people.length > 1 && (
            <p className="mt-3 text-xs text-ink-soft">
              Pagó {summary.people.map(([id, cents]) => `${nameOf(id)} ${formatEUR(cents)}`).join(" · ")}
            </p>
          )}
        </div>

        {/* Historial */}
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <select className={select} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Mes">
              <option value="">Todos los meses</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <select className={select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
            <select className={select} value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} aria-label="Persona">
              <option value="">Todas las personas</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.id === me.id ? "Yo" : p.name}</option>
              ))}
            </select>
          </div>

          {history.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center">
              <p className="font-display text-lg font-bold">Sin movimientos</p>
              <p className="mt-1 text-sm text-ink-soft">
                {expenses.length === 0
                  ? "Apunta el primer gasto y la app calcula quién le debe a quién."
                  : "No hay nada con estos filtros."}
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {history.map((row) =>
                row.kind === "expense" ? (
                  <ExpenseItem
                    key={row.key}
                    expense={row.expense}
                    payer={nameOf(row.expense.paid_by)}
                    mine={mySplit(row.expense.id)}
                    onOpen={() => setExpenseSheet({ open: true, expense: row.expense })}
                  />
                ) : (
                  <li key={row.key}>
                    <button
                      onClick={() => setSettlementDetail(row.settlement)}
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-forest/15 text-forest">
                        <Banknote size={18} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">
                          {nameOf(row.settlement.from_participant)} pagó a {nameOf(row.settlement.to_participant)}
                        </span>
                        <span className="block text-xs text-ink-soft">Pago · {formatDate(row.settlement.settled_on)}</span>
                      </span>
                      <span className="text-[15px] font-medium text-forest">{formatEUR(toCents(row.settlement.amount))}</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}

          <button
            onClick={() => setSettleSheet({ open: true, suggestion: null })}
            className="mt-3 flex min-h-11 items-center gap-2 px-2 text-sm text-forest"
          >
            <Banknote size={16} /> Registrar un pago
          </button>
        </div>
      </div>

      <ExpenseSheet
        open={expenseSheet.open}
        onClose={() => setExpenseSheet({ open: false, expense: null })}
        groupId={groupId}
        participants={participants}
        meId={me.id}
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

      <BottomSheet open={!!settlementDetail} onClose={() => setSettlementDetail(null)} title="Pago registrado">
        {settlementDetail && (
          <div className="flex flex-col gap-4">
            <p className="text-[15px]">
              {nameOf(settlementDetail.from_participant)} pagó{" "}
              <span className="font-medium">{formatEUR(toCents(settlementDetail.amount))}</span> a{" "}
              {nameOf(settlementDetail.to_participant)} el {formatDate(settlementDetail.settled_on)}.
            </p>
            <button
              onClick={() => removeSettlement(settlementDetail)}
              className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko"
            >
              <Trash2 size={16} /> Eliminar este pago
            </button>
          </div>
        )}
      </BottomSheet>
    </section>
  );
}

function ExpenseItem({
  expense,
  payer,
  mine,
  onOpen,
}: {
  expense: Expense;
  payer: string;
  mine: number;
  onOpen: () => void;
}) {
  const cat = expenseCategory(expense.category);
  const color = colorFor(cat.color);
  return (
    <li>
      <button onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
        >
          <CatIcon name={cat.icon} size={18} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{expense.description}</span>
          <span className="block text-xs text-ink-soft">
            Pagó {payer} · {formatDate(expense.expense_date)}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[15px] font-medium">{formatEUR(toCents(expense.amount))}</span>
          <span className="block text-[11px] text-ink-soft">{mine > 0 ? `Tu parte ${formatEUR(toCents(mine))}` : "No participas"}</span>
        </span>
      </button>
    </li>
  );
}
