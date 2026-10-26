"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

export type IngredientRow = { name: string; quantity: string; unit: string };

const UNIT_OPTIONS = ["", "g", "kg", "ml", "l", "ud", "cda", "cdta", "taza", "pizca", "diente", "loncha", "rama", "hoja", "lata", "paquete"];

const key = (s: string) => s.trim().toLowerCase();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

/**
 * Ingredientes de una receta: se eligen de la lista de productos y, si no existe, se crea al momento.
 * Viaja al servidor como JSON en un campo oculto.
 */
export function IngredientsEditor({ products, initial }: { products: string[]; initial: IngredientRow[] }) {
  const [rows, setRows] = useState<IngredientRow[]>(initial);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const known = useMemo(() => new Set(products.map(key)), [products]);
  const used = useMemo(() => new Set(rows.map((r) => key(r.name))), [rows]);

  const q = key(text);
  const options = useMemo(() => {
    if (!q) return [];
    const starts = products.filter((p) => key(p).startsWith(q));
    const contains = products.filter((p) => !key(p).startsWith(q) && key(p).includes(q));
    return [...starts, ...contains].filter((p) => !used.has(key(p))).slice(0, 6);
  }, [q, products, used]);
  const exact = products.some((p) => key(p) === q);
  const canCreate = !!q && !exact && !used.has(q);
  const total = options.length + (canCreate ? 1 : 0);

  function add(name: string) {
    const clean = name.trim();
    if (!clean) return;
    setText("");
    setActive(0);
    if (used.has(key(clean))) return;
    setRows((prev) => [...prev, { name: clean, quantity: "", unit: "" }]);
    // Tras elegir, se pasa a la cantidad.
    setTimeout(() => qtyRefs.current[key(clean)]?.focus(), 0);
  }

  function choose(index: number) {
    if (index < options.length) add(options[index]);
    else if (canCreate) add(capitalize(text.trim()));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (total ? (i + 1) % total : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (total ? (i - 1 + total) % total : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (total) choose(Math.min(active, total - 1));
    }
  }

  const update = (name: string, patch: Partial<IngredientRow>) =>
    setRows((prev) => prev.map((r) => (key(r.name) === key(name) ? { ...r, ...patch } : r)));

  const payload = JSON.stringify(rows.filter((r) => r.name.trim()));

  return (
    <div>
      <input type="hidden" name="ingredients_json" value={payload} />

      {rows.length > 0 && (
        <ul className="mb-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map((r) => (
            <li key={key(r.name)} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 basis-32">
                <span className="block truncate text-[15px]">{capitalize(r.name)}</span>
                {!known.has(key(r.name)) && <span className="block text-[11px] text-forest">Producto nuevo: se añade a la lista de productos</span>}
              </span>
              <input
                ref={(el) => {
                  qtyRefs.current[key(r.name)] = el;
                }}
                value={r.quantity}
                onChange={(e) => update(r.name, { quantity: e.target.value })}
                inputMode="decimal"
                placeholder="Cant."
                aria-label={`Cantidad de ${r.name}`}
                className={`${field} !w-20`}
              />
              <select
                value={r.unit}
                onChange={(e) => update(r.name, { unit: e.target.value })}
                aria-label={`Unidad de ${r.name}`}
                className={`${field} !w-24`}
              >
                {(UNIT_OPTIONS.includes(r.unit) ? UNIT_OPTIONS : [...UNIT_OPTIONS, r.unit]).map((u) => (
                  <option key={u} value={u}>
                    {u || "—"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => key(x.name) !== key(r.name)))}
                aria-label={`Quitar ${r.name}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition active:scale-90"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Busca un producto o escribe uno nuevo…"
          autoComplete="off"
          role="combobox"
          aria-expanded={focused && total > 0}
          aria-controls="ingredient-options"
          aria-label="Añadir ingrediente"
          className={field}
        />
        {focused && total > 0 && (
          <ul
            id="ingredient-options"
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            {options.map((name, i) => (
              <li key={name} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(name)}
                  className={`flex min-h-11 w-full items-center px-4 text-left text-[15px] ${i === active ? "bg-forest/10" : ""}`}
                >
                  {capitalize(name)}
                </button>
              </li>
            ))}
            {canCreate && (
              <li role="option" aria-selected={active === options.length}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(capitalize(text.trim()))}
                  className={`flex min-h-11 w-full items-center gap-2 border-t border-line px-4 text-left text-[15px] text-forest ${
                    active === options.length ? "bg-forest/10" : ""
                  }`}
                >
                  <Plus size={16} /> Crear «{capitalize(text.trim())}»
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">Los productos nuevos quedan guardados en la lista de productos de Compras.</p>
    </div>
  );
}
