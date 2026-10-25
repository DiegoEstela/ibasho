"use client";

import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatEUR, toCents } from "@/lib/gastos/money";
import type { DepositRow } from "@/lib/tarjetas/debit";
import { formatDate } from "./types";

type Props = {
  deposit: DepositRow | null;
  cardName: string;
  by: string;
  onClose: () => void;
  onDelete: (deposit: DepositRow) => void;
};

/** Detalle de un ingreso, con la opción de eliminarlo si se registró mal. */
export function DepositDetailSheet({ deposit, cardName, by, onClose, onDelete }: Props) {
  return (
    <BottomSheet open={!!deposit} onClose={onClose} title="Ingreso registrado">
      {deposit && (
        <div className="flex flex-col gap-4">
          <p className="text-[15px]">
            {by} puso <span className="font-medium">{formatEUR(toCents(deposit.amount))}</span> en {cardName} el{" "}
            {formatDate(deposit.deposit_date)}.
          </p>
          {deposit.note && <p className="rounded-xl bg-background px-3 py-2.5 text-sm text-ink-soft">{deposit.note}</p>}
          <button
            onClick={() => onDelete(deposit)}
            className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko"
          >
            <Trash2 size={16} /> Eliminar este ingreso
          </button>
          <p className="-mt-2 text-center text-xs text-ink-soft">El saldo de la tarjeta se ajusta solo.</p>
        </div>
      )}
    </BottomSheet>
  );
}
