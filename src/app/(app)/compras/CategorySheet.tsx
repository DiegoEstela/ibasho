"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CatIcon } from "@/components/ui/CatIcon";
import { COLOR_KEYS, PICKABLE_ICONS, colorFor } from "@/lib/compras/icons";
import type { Cat } from "./categoryTypes";

type Value = { name: string; icon: string; color: string };

type Props = {
  open: boolean;
  /** Categoría que se edita; null para crear una nueva. */
  category: Cat | null;
  taken: string[];
  onClose: () => void;
  onSave: (value: Value) => void;
  onDelete: (category: Cat) => void;
};

const field =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

export function CategorySheet({ open, category, taken, onClose, onSave, onDelete }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title={category ? "Editar categoría" : "Nueva categoría"}>
      {open && (
        <CategoryForm
          key={category?.id ?? "new"}
          category={category}
          taken={taken}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </BottomSheet>
  );
}

function CategoryForm({
  category,
  taken,
  onSave,
  onDelete,
}: Pick<Props, "category" | "taken" | "onSave" | "onDelete">) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "PawPrint");
  const [color, setColor] = useState(category?.color ?? "forest");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Ponle un nombre a la categoría.");
    const duplicate = taken.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase() && t.toLowerCase() !== category?.name.toLowerCase(),
    );
    if (duplicate) return setError("Ya existe una categoría con ese nombre.");
    onSave({ name: trimmed, icon, color });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `color-mix(in srgb, ${colorFor(color)} 22%, transparent)`, color: colorFor(color) }}
        >
          <CatIcon name={icon} size={28} strokeWidth={1.75} />
        </span>
        <input
          className={field}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          placeholder="Ej. Mascotas, Bebé, Farmacia"
          maxLength={30}
          aria-label="Nombre de la categoría"
          autoFocus
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-soft">Icono</p>
        <div className="grid grid-cols-6 gap-2">
          {PICKABLE_ICONS.map((key) => {
            const selected = key === icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-label={key}
                aria-pressed={selected}
                className={`flex size-11 items-center justify-center rounded-xl border transition active:scale-90 ${
                  selected ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <CatIcon name={key} size={20} strokeWidth={1.75} />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-soft">Color</p>
        <div className="flex gap-3">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setColor(key)}
              aria-label={key}
              aria-pressed={key === color}
              className={`size-11 rounded-full border-2 transition active:scale-90 ${
                key === color ? "border-ink" : "border-transparent"
              }`}
              style={{ background: colorFor(key) }}
            />
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
          {error}
        </p>
      )}

      <button className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95">
        {category ? "Guardar cambios" : "Crear categoría"}
      </button>

      {category && (
        <button
          type="button"
          onClick={() => onDelete(category)}
          className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko"
        >
          <Trash2 size={16} /> Eliminar categoría (sus productos pasan a «Otros»)
        </button>
      )}
    </form>
  );
}
