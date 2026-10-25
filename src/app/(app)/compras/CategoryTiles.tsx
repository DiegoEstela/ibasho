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
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-3 lg:gap-3">
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
            className={`relative flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border p-1.5 text-center lg:min-h-28 lg:gap-2 lg:rounded-3xl lg:p-3 transition active:scale-95 ${
              active ? "border-forest ring-2 ring-forest/40" : "border-line"
            } ${count === 0 ? "opacity-70" : ""}`}
            style={{ background: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
          >
            {count > 0 && (
              <span
                className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-surface lg:right-2 lg:top-2 lg:min-w-6 lg:px-1.5 lg:py-0.5 lg:text-xs"
                style={{ background: color }}
              >
                {count}
              </span>
            )}
            <span
              className="flex size-9 items-center justify-center rounded-xl lg:size-12 lg:rounded-2xl"
              style={{ background: `color-mix(in srgb, ${color} 24%, transparent)`, color }}
            >
              <Icon className="size-5 lg:size-6" strokeWidth={1.75} />
            </span>
            <span className="text-[10px] font-medium leading-tight text-ink lg:text-xs">{cat.name}</span>
          </button>
        );
      })}

      <button
        onClick={onCreate}
        className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink-soft/40 p-1.5 text-ink-soft lg:min-h-28 lg:gap-2 lg:rounded-3xl lg:p-3 transition active:scale-95"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-washi-deep lg:size-12 lg:rounded-2xl">
          <Plus className="size-5 lg:size-6" />
        </span>
        <span className="text-[10px] font-medium lg:text-xs">Nueva</span>
      </button>
    </div>
  );
}
