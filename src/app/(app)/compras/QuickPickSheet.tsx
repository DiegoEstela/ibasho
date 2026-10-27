"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { colorFor, iconFor } from "@/lib/compras/icons";
import { sinceLabel, suggestIds, type PurchaseStat } from "@/lib/compras/suggestions";
import type { Template } from "@/lib/compras/templates";
import type { Cat } from "./categoryTypes";
import { PickRow } from "./PickRow";
import type { Item, Product } from "./ShoppingList";
import { TemplatePane, type TemplateInput } from "./TemplatePane";

export type QuickPick = { name: string; quantity: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  products: Product[];
  pending: Item[];
  allCats: Cat[];
  stats: Map<string, PurchaseStat>;
  today: number;
  templates: Template[];
  templatesUnavailable: boolean;
  onAdd: (picks: QuickPick[]) => void;
  onSaveTemplate: (template: TemplateInput) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<boolean>;
};

const key = (s: string) => s.trim().toLowerCase();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TABS = [
  ["productos", "Productos"],
  ["plantillas", "Plantillas"],
] as const;

/** «Voy a comprar»: elegir de golpe varios productos (o una plantilla) para pasarlos a la lista. */
export function QuickPickSheet(props: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("productos");

  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Voy a comprar">
      <div className="mb-3 flex gap-1 rounded-xl bg-washi-deep p-1" role="tablist" aria-label="Qué añadir">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium transition ${
              tab === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "productos" ? <ProductsPane {...props} /> : <TemplatePane {...props} />}
    </BottomSheet>
  );
}

function ProductsPane({ products, pending, allCats, stats, today, onAdd, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const pendingKeys = useMemo(() => new Set(pending.map((i) => key(i.name))), [pending]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const q = key(query);

  // Lo que tiene sentido proponer: no está ya en la lista ni en casa.
  const suggested = useMemo(() => {
    const ids = suggestIds(
      products.filter((p) => !p.in_stock && !pendingKeys.has(key(p.name))),
      stats,
      today,
    );
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  }, [products, pendingKeys, stats, today, byId]);

  // Por categoría: primero lo que falta en casa y lo que más se compra.
  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      if (q && !key(p.name).includes(q)) continue;
      const c = p.category ?? "Otros";
      map.set(c, [...(map.get(c) ?? []), p]);
    }
    const order = (c: string) => {
      const n = allCats.findIndex((x) => x.name === c);
      return n === -1 ? allCats.length : n;
    };
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          Number(a.in_stock) - Number(b.in_stock) ||
          (stats.get(b.id)?.count ?? 0) - (stats.get(a.id)?.count ?? 0) ||
          a.name.localeCompare(b.name, "es"),
      );
    }
    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [products, q, allCats, stats]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleCat(name: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  function row(p: Product, hint?: string) {
    const inList = pendingKeys.has(key(p.name));
    return (
      <PickRow
        key={p.id}
        name={capitalize(p.name)}
        selected={selected.has(p.id)}
        onToggle={() => toggle(p.id)}
        disabled={inList}
        hint={inList ? "En la lista" : p.in_stock ? "En casa" : hint}
      />
    );
  }

  function submit() {
    const picks = [...selected].map((id) => byId.get(id)).filter(Boolean) as Product[];
    onAdd(picks.map((p) => ({ name: capitalize(p.name), quantity: null })));
    onClose();
  }

  const catMeta = (name: string) => allCats.find((c) => c.name === name) ?? allCats[allCats.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pb-1">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en tus productos…"
            autoComplete="off"
            aria-label="Buscar productos"
            className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest"
          />
        </div>
      </div>

      {!q && suggested.length > 0 && (
        <div>
          <h3 className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft">Te suele hacer falta</h3>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {suggested.map((p) => {
              const s = stats.get(p.id);
              return row(p, s ? `Compraste ${sinceLabel(s.lastDay, today)}` : undefined);
            })}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
          {products.length === 0 ? "Todavía no hay productos. Añade algo a la lista y quedará guardado." : "No hay nada que coincida."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map(([category, list]) => {
            const meta = catMeta(category);
            const Icon = iconFor(meta.icon);
            const isOpen = !!q || openCats.has(category);
            const picked = list.filter((p) => selected.has(p.id)).length;
            return (
              <div key={category} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <button
                  type="button"
                  onClick={() => toggleCat(category)}
                  aria-expanded={isOpen}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
                >
                  <Icon size={16} style={{ color: colorFor(meta.color) }} />
                  <span className="flex-1 text-sm font-medium">{category}</span>
                  {picked > 0 && <span className="rounded-full bg-forest/15 px-1.5 text-xs text-forest">{picked}</span>}
                  <span className="text-xs text-ink-soft">{list.length}</span>
                  <ChevronDown size={16} className={`text-ink-soft transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <div className="divide-y divide-line border-t border-line">{list.map((p) => row(p))}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 bg-background/95 px-1 pb-1 pt-2 backdrop-blur">
        <button
          type="button"
          onClick={submit}
          disabled={selected.size === 0}
          className="min-h-12 w-full rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-40"
        >
          {selected.size === 0 ? "Elige lo que falta" : `Añadir ${selected.size} a la lista`}
        </button>
      </div>
    </div>
  );
}
