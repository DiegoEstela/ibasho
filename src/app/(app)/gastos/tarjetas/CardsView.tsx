"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { GastosTabs } from "@/components/ui/GastosTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { colorFor } from "@/lib/compras/icons";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import { isInstallmentPaid, projectByMonth, type InstallmentRow } from "@/lib/tarjetas/installments";
import { personCents, purchaseStats, type PurchaseStats } from "@/lib/tarjetas/summary";
import { formatDate } from "../types";
import { sendPurchaseToExpenses } from "./actions";
import { CardSheet } from "./CardSheet";
import { AddCardTile, CardTile } from "./CardTile";
import { ProjectionChart } from "./ProjectionChart";
import { PurchaseDetail } from "./PurchaseDetail";
import { PurchaseSheet } from "./PurchaseSheet";
import type { Card, Installment, Person, Purchase, Share } from "./types";

type Props = {
  householdId: string;
  userId: string;
  people: Person[];
  initialCards: Card[];
  initialPurchases: Purchase[];
  initialShares: Share[];
  initialInstallments: Installment[];
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

export function CardsView({
  householdId,
  userId,
  people,
  initialCards,
  initialPurchases,
  initialShares,
  initialInstallments,
}: Props) {
  const [supabase] = useState(() => createClient());
  const [today] = useState(todayISO);
  const currentMonth = today.slice(0, 7);

  const [cards, setCards] = useState(initialCards);
  const [purchases, setPurchases] = useState(initialPurchases);
  const [shares, setShares] = useState(initialShares);
  const [installments, setInstallments] = useState(initialInstallments);

  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [person, setPerson] = useState("");
  const [month, setMonth] = useState<string | null>(null);

  const [cardSheet, setCardSheet] = useState<{ open: boolean; card: Card | null }>({ open: false, card: null });
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState("");

  const me = people.find((p) => p.id === userId);
  const nameOf = useCallback((id: string) => (id === userId ? "Tú" : (people.find((p) => p.id === id)?.name ?? "Alguien")), [people, userId]);

  // ---------- Sincronización ----------
  const refetch = useCallback(async () => {
    const [c, p, s, i] = await Promise.all([
      supabase.from("cards").select("*").eq("archived", false).order("created_at"),
      supabase.from("card_purchases").select("*").order("purchase_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
      supabase.from("card_purchase_shares").select("purchase_id, user_id, percent").limit(5000),
      supabase.from("card_installments").select("id, purchase_id, number, due_date, amount, manual_paid").limit(20000),
    ]);
    if (c.data) setCards(c.data as Card[]);
    if (p.data) setPurchases(p.data as Purchase[]);
    if (s.data) setShares(s.data as Share[]);
    if (i.data) setInstallments(i.data as Installment[]);
  }, [supabase]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`tarjetas-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_purchases", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_installments", filter }, queue)
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
  }, [supabase, householdId, refetch]);

  // ---------- Datos derivados ----------
  const sharesByPurchase = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const s of shares) map.set(s.purchase_id, { ...(map.get(s.purchase_id) ?? {}), [s.user_id]: Number(s.percent) });
    return map;
  }, [shares]);

  const instByPurchase = useMemo(() => {
    const map = new Map<string, Installment[]>();
    for (const i of installments) map.set(i.purchase_id, [...(map.get(i.purchase_id) ?? []), i]);
    return map;
  }, [installments]);

  const statsByPurchase = useMemo(() => {
    const map = new Map<string, PurchaseStats>();
    for (const p of purchases) map.set(p.id, purchaseStats(instByPurchase.get(p.id) ?? [], today));
    return map;
  }, [purchases, instByPurchase, today]);

  /** Lo que queda por pagar de una compra; con una persona elegida, solo su parte. */
  const pendingOf = useCallback(
    (purchaseId: string, personId: string) => {
      const sh = sharesByPurchase.get(purchaseId) ?? {};
      return (instByPurchase.get(purchaseId) ?? []).reduce(
        (sum, i) => (isInstallmentPaid(i.manual_paid, i.due_date, today) ? sum : sum + personCents(toCents(i.amount), sh, personId)),
        0,
      );
    },
    [sharesByPurchase, instByPurchase, today],
  );

  const visiblePurchases = useMemo(
    () =>
      purchases.filter(
        (p) =>
          (!cardFilter || p.card_id === cardFilter) &&
          (!person || (sharesByPurchase.get(p.id)?.[person] ?? 0) > 0),
      ),
    [purchases, cardFilter, person, sharesByPurchase],
  );

  const pendingByCard = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of purchases) map.set(p.card_id, (map.get(p.card_id) ?? 0) + pendingOf(p.id, person));
    return map;
  }, [purchases, pendingOf, person]);

  const nextDueByCard = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of purchases) {
      const next = statsByPurchase.get(p.id)?.nextDue;
      if (next && (!map.has(p.card_id) || next < map.get(p.card_id)!)) map.set(p.card_id, next);
    }
    return map;
  }, [purchases, statsByPurchase]);

  const totalPending = visiblePurchases.reduce((s, p) => s + pendingOf(p.id, person), 0);
  const activePurchases = visiblePurchases.filter((p) => (statsByPurchase.get(p.id)?.remaining ?? 0) > 0).length;

  const pendingByPerson = useMemo(
    () =>
      people.map((p) => ({
        person: p,
        cents: purchases
          .filter((x) => !cardFilter || x.card_id === cardFilter)
          .reduce((s, x) => s + pendingOf(x.id, p.id), 0),
      })),
    [people, purchases, cardFilter, pendingOf],
  );

  const projectionRows = useMemo<InstallmentRow[]>(() => {
    const ids = new Set(visiblePurchases.map((p) => p.id));
    return installments.filter((i) => ids.has(i.purchase_id)).map((i) => ({ ...i, amount: i.amount }));
  }, [installments, visiblePurchases]);

  const amountFor = useCallback(
    (row: InstallmentRow) => personCents(toCents(row.amount), sharesByPurchase.get(row.purchase_id) ?? {}, person),
    [sharesByPurchase, person],
  );

  const months = useMemo(() => projectByMonth(projectionRows, today, amountFor, 12), [projectionRows, today, amountFor]);

  const monthItems = useMemo(() => {
    if (!month) return [];
    return projectionRows
      .filter((r) => {
        if (isInstallmentPaid(r.manual_paid, r.due_date, today)) return false;
        const bucket = r.due_date.slice(0, 7) < currentMonth ? currentMonth : r.due_date.slice(0, 7);
        return bucket === month;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((r) => ({ row: r, purchase: purchases.find((p) => p.id === r.purchase_id), cents: amountFor(r) }))
      .filter((x) => x.purchase && x.cents > 0);
  }, [month, projectionRows, today, currentMonth, purchases, amountFor]);

  const detail = purchases.find((p) => p.id === detailId) ?? null;
  const detailShares = shares.filter((s) => s.purchase_id === detailId);
  const detailCanSend = people.length > 1 && detailShares.filter((s) => Number(s.percent) > 0).length >= 1;

  // ---------- Acciones ----------
  async function setPaid(inst: Installment, value: boolean | null) {
    const previous = installments;
    setInstallments((prev) => prev.map((i) => (i.id === inst.id ? { ...i, manual_paid: value } : i)));
    const { error } = await supabase.from("card_installments").update({ manual_paid: value }).eq("id", inst.id);
    if (error) setInstallments(previous);
  }

  async function removePurchase(purchase: Purchase) {
    setDetailId(null);
    setPurchases((prev) => prev.filter((p) => p.id !== purchase.id));
    const { error } = await supabase.from("card_purchases").delete().eq("id", purchase.id);
    if (error) refetch();
  }

  async function sendToExpenses(purchase: Purchase) {
    setSending(true);
    setSendMessage("");
    const result = await sendPurchaseToExpenses(purchase.id);
    setSending(false);
    if (!result.ok) return setSendMessage(result.message);
    refetch();
  }

  const onCardSaved = () => {
    setCardSheet({ open: false, card: null });
    setCardFilter(null);
    refetch();
  };
  const onPurchaseSaved = () => {
    setPurchaseOpen(false);
    refetch();
  };

  const purchasesOfCard = (id: string) => purchases.filter((p) => p.card_id === id).length;

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Gastos"
        subtitle="Tarjetas y cuotas"
        actions={
          <button
            onClick={() => (cards.length ? setPurchaseOpen(true) : setCardSheet({ open: true, card: null }))}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> {cards.length ? "Compra" : "Tarjeta"}
          </button>
        }
      />
      <GastosTabs active="tarjetas" />

      {/* Tarjetas */}
      {cards.length === 0 ? (
        <div className="mt-2 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-sky/25 text-sky">
            <CreditCard size={28} strokeWidth={1.5} />
          </span>
          <div>
            <p className="font-display text-lg font-bold">Agrega tu primera tarjeta</p>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">
              Apunta tus compras en cuotas y verás cuánto queda por pagar, cuándo vence cada cuota y cuánto te toca cada mes.
            </p>
          </div>
          <button
            onClick={() => setCardSheet({ open: true, card: null })}
            className="min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95"
          >
            Agregar tarjeta
          </button>
        </div>
      ) : (
        <>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 pt-1 lg:mx-0 lg:px-0" role="list" aria-label="Tarjetas">
            {cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                pendingCents={pendingByCard.get(card.id) ?? 0}
                nextDue={nextDueByCard.get(card.id) ?? null}
                selected={cardFilter === card.id}
                onSelect={() => setCardFilter(cardFilter === card.id ? null : card.id)}
                onEdit={() => setCardSheet({ open: true, card })}
              />
            ))}
            <AddCardTile onClick={() => setCardSheet({ open: true, card: null })} />
          </div>

          {people.length > 1 && (
            <div className="mb-3 flex items-center gap-2 overflow-x-auto" role="group" aria-label="Ver la parte de">
              <span className="shrink-0 text-xs text-ink-soft">Ver:</span>
              {[{ id: "", label: "Todo" }, ...(me ? [{ id: me.id, label: "Mi parte" }] : []), ...people.filter((p) => p.id !== userId).map((p) => ({ id: p.id, label: p.name }))].map(
                (opt) => (
                  <button
                    key={opt.id || "todo"}
                    onClick={() => setPerson(opt.id)}
                    aria-pressed={person === opt.id}
                    className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition ${
                      person === opt.id ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                    }`}
                  >
                    {opt.label}
                  </button>
                ),
              )}
            </div>
          )}

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:gap-x-10">
            {/* Resumen */}
            <div className="rounded-2xl border border-line bg-surface p-4 lg:col-start-2 lg:row-start-1 lg:p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                {person ? (person === userId ? "Te queda por pagar" : `Le queda a ${nameOf(person)}`) : "Queda por pagar"}
              </p>
              <p className="mt-1 font-display text-3xl font-bold">{formatEUR(totalPending)}</p>
              <p className="text-xs text-ink-soft">
                {activePurchases === 0
                  ? "No hay compras con cuotas pendientes"
                  : `en ${activePurchases} ${activePurchases === 1 ? "compra" : "compras"} con cuotas pendientes`}
              </p>

              {people.length > 1 && pendingByPerson.some((x) => x.cents > 0) && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {pendingByPerson.map(({ person: p, cents }) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs">
                      <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                      {nameOf(p.id)} <span className="font-medium">{formatEUR(cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Próximos meses */}
            <div className="rounded-2xl border border-line bg-surface p-4 lg:col-start-2 lg:row-start-2 lg:self-start lg:p-5">
              <h2 className="mb-2 font-display text-base font-bold lg:text-lg">Próximos meses</h2>
              <ProjectionChart months={months} currentMonth={currentMonth} selected={month} onSelect={setMonth} />

              {month && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium">{monthName(month)}</p>
                    <p className="text-sm text-ink-soft">{formatEUR(months.find((m) => m.month === month)?.cents ?? 0)}</p>
                  </div>
                  {monthItems.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-soft">No vence ninguna cuota este mes.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {monthItems.map(({ row, purchase, cents }) => (
                        <li key={`${row.purchase_id}-${row.number}`} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">
                            {purchase!.description}{" "}
                            <span className="text-xs text-ink-soft">
                              · cuota {row.number}/{purchase!.installments_count} · {formatDate(row.due_date).slice(0, 5)}
                            </span>
                          </span>
                          <span className="shrink-0 font-medium">{formatEUR(cents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Compras */}
            <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <h2 className="mb-2 px-1 font-display text-base font-bold lg:text-lg">
                Compras{cardFilter && cards.find((c) => c.id === cardFilter) ? ` · ${cards.find((c) => c.id === cardFilter)!.name}` : ""}
              </h2>

              {visiblePurchases.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center">
                  <p className="font-display text-lg font-bold">Aún no hay compras</p>
                  <p className="mt-1 text-sm text-ink-soft">Apunta una compra en cuotas y la app calcula cada vencimiento.</p>
                  <button
                    onClick={() => setPurchaseOpen(true)}
                    className="mt-3 min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95"
                  >
                    Agregar compra
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {visiblePurchases.map((p) => {
                    const stats = statsByPurchase.get(p.id)!;
                    const card = cards.find((c) => c.id === p.card_id);
                    const progress = stats.total === 0 ? 0 : (stats.paid / stats.total) * 100;
                    const done = stats.remaining === 0;
                    const mine = person ? pendingOf(p.id, person) : null;
                    return (
                      <li key={p.id}>
                        <button onClick={() => { setSendMessage(""); setDetailId(p.id); }} className="block w-full px-3 py-2.5 text-left">
                          <span className="flex items-center gap-3">
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                              style={{ background: `color-mix(in srgb, ${colorFor(card?.color ?? "forest")} 22%, transparent)`, color: colorFor(card?.color ?? "forest") }}
                            >
                              <CreditCard size={18} strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px]">{p.description}</span>
                              <span className="block truncate text-xs text-ink-soft">
                                {[card?.name, formatDate(p.purchase_date)].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className="text-right">
                              <span className="block text-[15px] font-medium">{formatEUR(stats.firstCents)}</span>
                              <span className="block text-[11px] text-ink-soft">
                                {p.installments_count === 1 ? "un pago" : `× ${p.installments_count} cuotas`}
                              </span>
                            </span>
                          </span>

                          <span className="mt-2 flex items-center gap-3">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-washi-deep">
                              <span className="block h-full rounded-full bg-forest transition-all" style={{ width: `${progress}%` }} />
                            </span>
                            <span className="shrink-0 text-[11px] text-ink-soft">
                              {done
                                ? "Terminada ✓"
                                : `${stats.paid}/${stats.total} · quedan ${formatEUR(mine ?? stats.pendingCents)}${stats.nextDue ? ` · próxima ${formatDate(stats.nextDue).slice(0, 5)}` : ""}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      <CardSheet
        open={cardSheet.open}
        onClose={() => setCardSheet({ open: false, card: null })}
        card={cardSheet.card}
        people={people}
        meId={userId}
        householdId={householdId}
        purchasesCount={cardSheet.card ? purchasesOfCard(cardSheet.card.id) : 0}
        onSaved={onCardSaved}
      />

      <PurchaseSheet
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        cards={cards}
        defaultCardId={cardFilter}
        people={people}
        meId={userId}
        onSaved={onPurchaseSaved}
      />

      <PurchaseDetail
        purchase={detail}
        card={cards.find((c) => c.id === detail?.card_id)}
        people={people}
        shares={detailShares}
        installments={installments.filter((i) => i.purchase_id === detailId)}
        today={today}
        canSend={detailCanSend}
        sending={sending}
        sendMessage={sendMessage}
        onClose={() => setDetailId(null)}
        onToggle={(inst, paid) => setPaid(inst, paid)}
        onAuto={(inst) => setPaid(inst, null)}
        onDelete={removePurchase}
        onSend={sendToExpenses}
      />
    </section>
  );
}
