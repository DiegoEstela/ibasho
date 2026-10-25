"use client";

import { useState } from "react";
import { Check, Receipt, RotateCcw, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { isInstallmentPaid } from "@/lib/tarjetas/installments";
import { purchaseStats } from "@/lib/tarjetas/summary";
import { formatDate } from "../types";
import type { Card, Installment, Person, Purchase, Share } from "./types";

type Props = {
  purchase: Purchase | null;
  card: Card | undefined;
  people: Person[];
  shares: Share[];
  installments: Installment[];
  today: string;
  /** El hogar tiene una sola persona: los gastos compartidos aún no están disponibles. */
  alone: boolean;
  /** Aviso a mostrar junto a las cuotas (por ejemplo, por qué no se pudo enviar una). */
  notice: string;
  onClose: () => void;
  onToggle: (installment: Installment, paid: boolean) => void;
  onAuto: (installment: Installment) => void;
  onDelete: (purchase: Purchase) => void;
  onRequestSend: (installment: Installment) => void;
};

export function PurchaseDetail(props: Props) {
  const { purchase, onClose } = props;
  return (
    <BottomSheet open={!!purchase} onClose={onClose} title={purchase?.description ?? "Compra"}>
      {purchase && <Detail key={purchase.id} {...props} purchase={purchase} />}
    </BottomSheet>
  );
}

function Detail({
  purchase,
  card,
  people,
  shares,
  installments,
  today,
  alone,
  notice,
  onToggle,
  onAuto,
  onDelete,
  onRequestSend,
}: Props & { purchase: Purchase }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sorted = [...installments].sort((a, b) => a.number - b.number);
  const stats = purchaseStats(sorted, today);
  const total = toCents(purchase.total_amount * (1 + purchase.interest_percent / 100));
  const progress = stats.total === 0 ? 0 : (stats.paid / stats.total) * 100;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Alguien";

  return (
    <div className="flex flex-col gap-4">
      <p className="-mt-2 text-sm text-ink-soft">
        {[purchase.merchant, card?.name, formatDate(purchase.purchase_date)].filter(Boolean).join(" · ")}
      </p>

      <div className="rounded-2xl bg-forest/10 p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-lg font-bold text-forest">
            {stats.paid} de {stats.total} {stats.total === 1 ? "pago" : "cuotas"}
          </p>
          <p className="text-sm text-ink-soft">
            Quedan <span className="font-medium text-ink">{formatEUR(stats.pendingCents)}</span>
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Total {formatEUR(total)}
          {purchase.interest_percent > 0 && ` (con ${String(purchase.interest_percent).replace(".", ",")} % de interés)`}
          {stats.lastDue && ` · Última cuota: ${formatDate(stats.lastDue)}`}
        </p>
      </div>

      {shares.length > 0 && (
        <p className="text-sm text-ink-soft">
          Corresponde a{" "}
          {shares
            .filter((s) => s.percent > 0)
            .map((s) => `${nameOf(s.user_id)} ${String(s.percent).replace(".", ",")} %`)
            .join(" · ")}
        </p>
      )}

      <div>
        <h3 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wider text-ink-soft">Calendario de cuotas</h3>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {sorted.map((inst) => {
            const paid = isInstallmentPaid(inst.manual_paid, inst.due_date, today);
            const overdue = !paid && inst.due_date < today;
            return (
              <li key={inst.id} className="flex min-h-12 items-center gap-1 pr-2">
                <button
                  onClick={() => onToggle(inst, !paid)}
                  aria-label={paid ? `Marcar la cuota ${inst.number} como pendiente` : `Marcar la cuota ${inst.number} como pagada`}
                  aria-pressed={paid}
                  className="flex size-12 shrink-0 items-center justify-center"
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded-full border-2 transition ${
                      paid ? "border-forest bg-forest text-surface" : "border-ink-soft/50"
                    }`}
                  >
                    {paid && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
                <div className="min-w-0 flex-1 py-1.5">
                  <p className={`text-[15px] ${paid ? "text-ink-soft line-through" : ""}`}>
                    Cuota {inst.number} · {formatDate(inst.due_date)}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {overdue ? <span className="text-hanko">Atrasada</span> : paid ? "Pagada" : "Pendiente"}
                    {inst.manual_paid !== null && " · ajustada a mano"}
                  </p>
                </div>
                {inst.manual_paid !== null && (
                  <button
                    onClick={() => onAuto(inst)}
                    aria-label="Volver al estado automático según la fecha"
                    title="Volver a automático"
                    className="flex size-9 items-center justify-center rounded-full text-ink-soft"
                  >
                    <RotateCcw size={15} />
                  </button>
                )}
                <span className="text-[15px] font-medium">{formatEUR(toCents(inst.amount))}</span>
                {inst.expense_id ? (
                  <span className="ml-1 flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-forest" title="Ya está en Gastos compartidos">
                    <Check size={13} /> En gastos
                  </span>
                ) : (
                  <button
                    onClick={() => onRequestSend(inst)}
                    aria-label={`Agregar la cuota ${inst.number} a Gastos compartidos`}
                    aria-disabled={alone}
                    className={`ml-1 flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium transition active:scale-95 ${
                      alone ? "bg-washi-deep text-ink-soft" : "bg-forest/10 text-forest"
                    }`}
                  >
                    <Receipt size={13} /> Gastos
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {notice && (
          <p role="alert" className="mt-2 rounded-xl bg-hanko/10 px-3 py-2.5 text-sm text-hanko">{notice}</p>
        )}
        <p className="mt-1.5 px-1 text-xs text-ink-soft">
          Las cuotas se marcan como pagadas solas cuando llega su fecha; toca el círculo para corregirlo. Con «Gastos» registras esa cuota en Gastos compartidos.
        </p>
      </div>

      {confirmDelete ? (
        <button onClick={() => onDelete(purchase)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
          <Trash2 size={16} /> Sí, eliminar la compra y sus cuotas
        </button>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
          <Trash2 size={16} /> Eliminar compra
        </button>
      )}
    </div>
  );
}
