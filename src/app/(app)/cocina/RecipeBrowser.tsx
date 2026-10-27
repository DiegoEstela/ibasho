"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Heart, X } from "lucide-react";
import { difficultyLabel } from "@/lib/cocina/labels";

export type RecipeCard = {
  id: string;
  name: string;
  prep_minutes: number | null;
  difficulty: string;
  tags: string[];
  is_favorite: boolean;
};

/** Lista de recetas con filtro por etiquetas: al elegir varias se muestran las que las tienen todas. */
export function RecipeBrowser({ recipes }: { recipes: RecipeCard[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  }, [recipes]);

  const visible = useMemo(
    () => (selected.length ? recipes.filter((r) => selected.every((t) => r.tags.includes(t))) : recipes),
    [recipes, selected],
  );

  const toggle = (tag: string) => setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  return (
    <>
      {allTags.length > 0 && (
        <div className="mt-3 flex items-center gap-2 lg:mt-6">
          <div className="flex min-w-0 flex-1 gap-2 chip-row lg:flex-wrap lg:overflow-visible" role="group" aria-label="Filtrar por etiqueta">
            {allTags.map(([tag, count]) => {
              const active = selected.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggle(tag)}
                  aria-pressed={active}
                  className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition active:scale-95 ${
                    active ? "border-forest bg-forest text-surface" : "border-line bg-surface text-ink"
                  }`}
                >
                  {tag}
                  <span className={`text-xs ${active ? "text-surface/80" : "text-ink-soft"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => setSelected([])}
              className="flex min-h-9 shrink-0 items-center gap-1 px-2 text-sm text-forest"
            >
              <X size={14} /> Limpiar
            </button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
          Ninguna receta tiene todas esas etiquetas a la vez.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:mt-5 lg:gap-3 xl:grid-cols-3">
          {visible.map((r) => (
            <li key={r.id}>
              <Link
                href={`/cocina/${r.id}`}
                className="block rounded-2xl border border-line bg-surface p-3 transition active:scale-[0.99] lg:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-base font-bold leading-snug lg:text-lg">{r.name}</h2>
                  {r.is_favorite && <Heart size={18} className="shrink-0 fill-hanko text-hanko" />}
                </div>
                <p className="mt-1.5 flex items-center gap-3 text-xs text-ink-soft lg:mt-2 lg:text-sm">
                  {r.prep_minutes != null && (
                    <span className="flex items-center gap-1">
                      <Clock size={14} /> {r.prep_minutes} min
                    </span>
                  )}
                  <span>{difficultyLabel(r.difficulty)}</span>
                </p>
                {r.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className={`rounded-full px-2.5 py-0.5 text-xs ${selected.includes(t) ? "bg-forest text-surface" : "bg-moss/15 text-forest"}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
