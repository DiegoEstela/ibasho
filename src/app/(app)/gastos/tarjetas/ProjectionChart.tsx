import { formatEUR } from "@/lib/gastos/money";

type Props = {
  months: { month: string; cents: number }[];
  currentMonth: string;
  selected: string | null;
  onSelect: (month: string | null) => void;
};

const SHORT = new Intl.DateTimeFormat("es-ES", { month: "short" });
const monthShort = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return SHORT.format(new Date(y, m - 1, 1)).replace(".", "");
};

/** Barras con lo que se pagará cada mes. Tocar una barra muestra qué cuotas vencen ese mes. */
export function ProjectionChart({ months, currentMonth, selected, onSelect }: Props) {
  const max = Math.max(...months.map((m) => m.cents), 1);

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-max items-end gap-1.5" role="list" aria-label="Próximos pagos por mes">
        {months.map(({ month, cents }) => {
          const active = selected === month;
          const isCurrent = month === currentMonth;
          const height = cents === 0 ? 4 : Math.max(10, Math.round((cents / max) * 96));
          return (
            <li key={month}>
              <button
                onClick={() => onSelect(active ? null : month)}
                aria-pressed={active}
                aria-label={`${monthShort(month)} ${month.slice(0, 4)}: ${formatEUR(cents)}`}
                className="flex w-11 flex-col items-center gap-1 lg:w-12"
              >
                <span className={`h-3.5 text-[10px] font-medium leading-none ${active ? "text-forest" : "text-ink-soft"}`}>
                  {cents > 0 ? (cents >= 100000 ? `${Math.round(cents / 100000)}k` : Math.round(cents / 100)) : ""}
                </span>
                <span className="flex h-24 w-full items-end">
                  <span
                    className="w-full rounded-t-lg transition-all"
                    style={{
                      height,
                      background: active ? "var(--forest)" : cents === 0 ? "var(--line)" : "color-mix(in srgb, var(--forest) 45%, transparent)",
                    }}
                  />
                </span>
                <span className={`text-[11px] ${isCurrent ? "font-bold text-ink" : "text-ink-soft"}`}>{monthShort(month)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
