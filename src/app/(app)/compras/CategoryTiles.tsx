import { Plus } from "lucide-react";
import { colorFor, iconFor } from "@/lib/compras/icons";
import type { Cat } from "./categoryTypes";

type Props = {
  categories: Cat[];
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onCreate: () => void;
};

/** Mosaico de categorías con icono y contador de productos pendientes. */
export function CategoryTiles({ categories, counts, selected, onSelect, onCreate }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-3">
      {categories.map((cat) => {
        const Icon = iconFor(cat.icon);
        const color = colorFor(cat.color);
        const count = counts[cat.name] ?? 0;
        const active = selected === cat.name;

        return (
          <button
            key={cat.name}
            onClick={() => onSelect(active ? null : cat.name)}
            aria-pressed={active}
            className={`relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border p-3 text-center transition active:scale-95 ${
              active ? "border-forest ring-2 ring-forest/40" : "border-line"
            } ${count === 0 ? "opacity-70" : ""}`}
            style={{ background: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
          >
            {count > 0 && (
              <span
                className="absolute right-2 top-2 flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold text-surface"
                style={{ background: color }}
              >
                {count}
              </span>
            )}
            <span
              className="flex size-12 items-center justify-center rounded-2xl"
              style={{ background: `color-mix(in srgb, ${color} 24%, transparent)`, color }}
            >
              <Icon size={26} strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium leading-tight text-ink">{cat.name}</span>
          </button>
        );
      })}

      <button
        onClick={onCreate}
        className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-ink-soft/40 p-3 text-ink-soft transition active:scale-95"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-washi-deep">
          <Plus size={24} />
        </span>
        <span className="text-xs font-medium">Nueva</span>
      </button>
    </div>
  );
}
