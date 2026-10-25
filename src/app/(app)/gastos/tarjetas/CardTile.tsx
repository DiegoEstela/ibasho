import { Plus, Wifi } from "lucide-react";
import { colorFor } from "@/lib/compras/icons";
import { formatEUR } from "@/lib/gastos/money";
import { formatDate } from "../types";
import type { Card } from "./types";

// Los colores claros llevan texto oscuro para que se lea bien.
const LIGHT_COLORS = ["sakura", "sky"];

type Props = {
  card: Card;
  pendingCents: number;
  nextDue: string | null;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
};

/** Tarjeta de crédito dibujada: color, chip, últimos dígitos, lo que queda por pagar y el próximo pago. */
export function CardTile({ card, pendingCents, nextDue, selected, onSelect, onEdit }: Props) {
  const base = colorFor(card.color);
  const text = LIGHT_COLORS.includes(card.color) ? "#2b2620" : "#fffaf0";

  return (
    <div className="relative snap-start">
      <button
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Tarjeta ${card.name}${selected ? ", seleccionada" : ""}`}
        className={`flex h-36 w-60 flex-col justify-between rounded-2xl p-3.5 text-left shadow-md transition active:scale-[0.98] lg:h-40 lg:w-72 lg:p-4 ${
          selected ? "ring-2 ring-forest ring-offset-2 ring-offset-background" : ""
        }`}
        style={{
          color: text,
          background: `linear-gradient(135deg, ${base} 0%, color-mix(in srgb, ${base} 60%, black) 100%)`,
        }}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate font-display text-base font-bold">{card.name}</span>
          <Wifi size={18} className="shrink-0 rotate-90 opacity-80" />
        </span>

        <span className="flex items-center gap-3">
          <span className="h-6 w-8 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 opacity-90" aria-hidden />
          <span className="font-mono text-sm tracking-[0.2em] opacity-90">•••• {card.last4 ?? "····"}</span>
        </span>

        <span className="flex items-end justify-between gap-2">
          <span>
            <span className="block text-[10px] uppercase tracking-wider opacity-75">Por pagar</span>
            <span className="block font-display text-lg font-bold leading-tight lg:text-xl">{formatEUR(pendingCents)}</span>
          </span>
          <span className="text-right text-[11px] leading-tight opacity-90">
            {nextDue ? (
              <>
                Próximo pago
                <span className="block font-medium">{formatDate(nextDue).slice(0, 5)}</span>
              </>
            ) : (
              <>Vence el día<span className="block font-medium">{card.due_day}</span></>
            )}
          </span>
        </span>
      </button>

      <button
        onClick={onEdit}
        aria-label={`Editar ${card.name}`}
        className="absolute right-2 top-9 flex size-8 items-center justify-center rounded-full bg-black/20 text-[11px] font-bold backdrop-blur-sm"
        style={{ color: text }}
      >
        ⋯
      </button>
    </div>
  );
}

export function AddCardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-36 w-40 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-soft/40 text-ink-soft transition active:scale-[0.98] lg:h-40 lg:w-48"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-washi-deep">
        <Plus size={20} />
      </span>
      <span className="text-sm font-medium">Nueva tarjeta</span>
    </button>
  );
}
