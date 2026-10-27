"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ListPlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { PurchaseStat } from "@/lib/compras/suggestions";
import type { Template, TemplateItem } from "@/lib/compras/templates";
import { PickRow } from "./PickRow";
import type { Item, Product } from "./ShoppingList";

export type TemplateInput = { id?: string; name: string; items: TemplateItem[] };

type Props = {
  products: Product[];
  pending: Item[];
  stats: Map<string, PurchaseStat>;
  templates: Template[];
  templatesUnavailable: boolean;
  onAdd: (picks: { name: string; quantity: string | null }[]) => void;
  /** Marcar como comprados, sin pasar por la lista. */
  onBought: (picks: { name: string; quantity: string | null }[]) => void;
  onSaveTemplate: (template: TemplateInput) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<boolean>;
  onClose: () => void;
};

type Mode = { kind: "list" } | { kind: "detail"; id: string } | { kind: "edit"; draft: TemplateInput };

const key = (s: string) => s.trim().toLowerCase();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const primary =
  "min-h-12 w-full rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-40";

export function TemplatePane(props: Props) {
  const { products, pending, templates, templatesUnavailable } = props;
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const pendingKeys = useMemo(() => new Set(pending.map((i) => key(i.name))), [pending]);

  if (mode.kind === "edit") {
    return (
      <TemplateEditor
        key={mode.draft.id ?? "new"}
        draft={mode.draft}
        products={products}
        stats={props.stats}
        onCancel={() => setMode({ kind: "list" })}
        onSave={async (t) => {
          const ok = await props.onSaveTemplate(t);
          if (ok) setMode({ kind: "list" });
          return ok;
        }}
        onDelete={
          mode.draft.id
            ? async () => {
                const ok = await props.onDeleteTemplate(mode.draft.id!);
                if (ok) setMode({ kind: "list" });
                return ok;
              }
            : undefined
        }
      />
    );
  }

  if (mode.kind === "detail") {
    const template = templates.find((t) => t.id === mode.id);
    if (template) {
      return (
        <TemplateDetail
          key={template.id}
          template={template}
          byId={byId}
          pendingKeys={pendingKeys}
          onBack={() => setMode({ kind: "list" })}
          onEdit={() => setMode({ kind: "edit", draft: { id: template.id, name: template.name, items: template.items } })}
          onAdd={(picks) => {
            props.onAdd(picks);
            props.onClose();
          }}
          onBought={(picks) => {
            props.onBought(picks);
            props.onClose();
          }}
        />
      );
    }
  }

  // Lo que ya está en la lista pasa a ser el borrador de una plantilla nueva.
  function fromCurrentList() {
    const seen = new Set<string>();
    const items: TemplateItem[] = [];
    for (const i of pending) {
      const id = i.product_id ?? products.find((p) => key(p.name) === key(i.name))?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push({ product_id: id, quantity: i.quantity });
    }
    setMode({ kind: "edit", draft: { name: "", items } });
  }

  return (
    <div className="flex flex-col gap-3">
      {templatesUnavailable && (
        <p className="rounded-2xl border border-hanko/40 bg-hanko/10 p-3 text-sm text-hanko" role="alert">
          No se pudieron cargar las plantillas. Falta ejecutar la migración 0026 en Supabase.
        </p>
      )}

      {templates.length === 0 && !templatesUnavailable ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
          Aún no hay plantillas. Crea una con lo que compran siempre junto (por ejemplo, «Desayuno») y la añaden de un toque.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {templates.map((t) => {
            const known = t.items.filter((i) => byId.has(i.product_id));
            const home = known.filter((i) => byId.get(i.product_id)!.in_stock).length;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setMode({ kind: "detail", id: t.id })}
                  className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition active:bg-washi-deep"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{t.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {known.length === 1 ? "1 producto" : `${known.length} productos`}
                      {home > 0 && ` · ${home} en casa`}
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-ink-soft" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setMode({ kind: "edit", draft: { name: "", items: [] } })}
        disabled={templatesUnavailable}
        className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium text-forest transition active:scale-95 disabled:opacity-40"
      >
        <Plus size={16} /> Nueva plantilla
      </button>
      {pending.length > 0 && (
        <button
          type="button"
          onClick={fromCurrentList}
          disabled={templatesUnavailable}
          className="flex min-h-11 items-center justify-center gap-2 text-sm text-ink-soft disabled:opacity-40"
        >
          <ListPlus size={16} /> Guardar la lista actual como plantilla
        </button>
      )}
    </div>
  );
}

/** Los productos de una plantilla, avisando de los que ya tienen en casa o ya están en la lista. */
function TemplateDetail({
  template,
  byId,
  pendingKeys,
  onBack,
  onEdit,
  onAdd,
  onBought,
}: {
  template: Template;
  byId: Map<string, Product>;
  pendingKeys: Set<string>;
  onBack: () => void;
  onEdit: () => void;
  onAdd: (picks: { name: string; quantity: string | null }[]) => void;
  onBought: (picks: { name: string; quantity: string | null }[]) => void;
}) {
  const rows = useMemo(
    () =>
      template.items
        .map((i) => ({ item: i, product: byId.get(i.product_id) }))
        .filter((r): r is { item: TemplateItem; product: Product } => !!r.product)
        .map((r) => {
          const inList = pendingKeys.has(key(r.product.name));
          return { ...r, inList, atHome: !inList && r.product.in_stock };
        }),
    [template.items, byId, pendingKeys],
  );

  // Lo que ya tienen en casa o ya está en la lista empieza sin marcar.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.inList && !r.atHome).map((r) => r.product.id)),
  );

  const atHome = rows.filter((r) => r.atHome);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const picked = rows.filter((r) => selected.has(r.product.id));
  const toAdd = picked.filter((r) => !r.inList);
  const asPick = (r: (typeof rows)[number]) => ({ name: capitalize(r.product.name), quantity: r.item.quantity });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label="Volver" className="flex size-11 items-center justify-center rounded-full text-ink-soft">
          <ChevronLeft size={20} />
        </button>
        <h3 className="flex-1 truncate font-display text-lg font-bold">{template.name}</h3>
        <button type="button" onClick={onEdit} aria-label="Editar plantilla" className="flex size-11 items-center justify-center rounded-full text-forest">
          <Pencil size={18} />
        </button>
      </div>

      {atHome.length > 0 && (
        <p className="rounded-2xl bg-terracotta/10 p-3 text-sm text-terracotta" role="status">
          Ya tienes en casa {atHome.length === rows.length ? "todo" : atHome.length === 1 ? "1 producto" : `${atHome.length} productos`}:{" "}
          {atHome.map((r) => capitalize(r.product.name)).join(", ")}. Los dejé sin marcar.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
          Esta plantilla no tiene productos. Pulsa el lápiz para añadir.
        </p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map(({ item, product, inList, atHome: home }) => (
            <PickRow
              key={product.id}
              name={item.quantity ? `${capitalize(product.name)} · ${item.quantity}` : capitalize(product.name)}
              selected={selected.has(product.id)}
              onToggle={() => toggle(product.id)}
              hint={inList ? "En la lista" : home ? "Lo tienes en casa" : undefined}
              tone={home ? "warn" : "muted"}
            />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 grid grid-cols-2 gap-2 bg-background/95 px-1 pb-1 pt-2 backdrop-blur">
        <button type="button" onClick={() => onAdd(toAdd.map(asPick))} disabled={toAdd.length === 0} className={primary}>
          {toAdd.length === 0 ? "A la lista" : `A la lista (${toAdd.length})`}
        </button>
        <button
          type="button"
          onClick={() => onBought(picked.map(asPick))}
          disabled={picked.length === 0}
          className="min-h-12 w-full rounded-2xl border border-forest bg-surface px-4 text-base font-medium text-forest shadow-sm transition active:scale-95 disabled:opacity-40"
        >
          {picked.length === 0 ? "Ya lo compré" : `Ya lo compré (${picked.length})`}
        </button>
      </div>
    </div>
  );
}

function TemplateEditor({
  draft,
  products,
  stats,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: TemplateInput;
  products: Product[];
  stats: Map<string, PurchaseStat>;
  onCancel: () => void;
  onSave: (template: TemplateInput) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [name, setName] = useState(draft.name);
  const [items, setItems] = useState<TemplateItem[]>(() => draft.items.filter((i) => byId.has(i.product_id)));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = key(query);
  const inTemplate = useMemo(() => new Set(items.map((i) => i.product_id)), [items]);
  const results = useMemo(
    () =>
      products
        .filter((p) => !inTemplate.has(p.id) && (!q || key(p.name).includes(q)))
        .sort((a, b) => (stats.get(b.id)?.count ?? 0) - (stats.get(a.id)?.count ?? 0) || a.name.localeCompare(b.name, "es"))
        .slice(0, 30),
    [products, inTemplate, q, stats],
  );

  function setQuantity(id: string, quantity: string) {
    setItems((prev) => prev.map((i) => (i.product_id === id ? { ...i, quantity } : i)));
  }

  async function run(action: () => Promise<boolean>) {
    setSaving(true);
    setError(false);
    const ok = await action();
    // Si todo fue bien el panel se cierra; solo se vuelve a habilitar si falló.
    if (!ok) {
      setSaving(false);
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onCancel} aria-label="Volver" className="flex size-11 items-center justify-center rounded-full text-ink-soft">
          <ChevronLeft size={20} />
        </button>
        <h3 className="font-display text-lg font-bold">{draft.id ? "Editar plantilla" : "Nueva plantilla"}</h3>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre (ej. Desayuno)"
        maxLength={60}
        aria-label="Nombre de la plantilla"
        className={field}
      />

      {items.length > 0 && (
        <div>
          <h4 className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft">En la plantilla · {items.length}</h4>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {items.map((i) => (
              <li key={i.product_id} className="flex min-h-12 items-center gap-2 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate text-[15px]">{capitalize(byId.get(i.product_id)!.name)}</span>
                <input
                  value={i.quantity ?? ""}
                  onChange={(e) => setQuantity(i.product_id, e.target.value)}
                  placeholder="Cantidad"
                  aria-label="Cantidad"
                  className="min-h-9 w-24 rounded-lg border border-line bg-background px-2 text-sm outline-none focus:border-forest"
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((x) => x.product_id !== i.product_id))}
                  aria-label="Quitar de la plantilla"
                  className="flex size-10 items-center justify-center text-ink-soft"
                >
                  <X size={18} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft">Añadir productos</h4>
        <div className="relative mb-2">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            autoComplete="off"
            aria-label="Buscar productos"
            className={`${field} pl-10`}
          />
        </div>
        {results.length === 0 ? (
          <p className="px-2 text-sm text-ink-soft">No hay más productos que coincidan.</p>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {results.map((p) => (
              <PickRow
                key={p.id}
                name={capitalize(p.name)}
                selected={false}
                onToggle={() => setItems((prev) => [...prev, { product_id: p.id, quantity: null }])}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-hanko" role="alert">
          No se pudo guardar. Revisa tu conexión.
        </p>
      )}

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-1 bg-background/95 px-1 pb-1 pt-2 backdrop-blur">
        <button
          type="button"
          disabled={saving || !name.trim() || items.length === 0}
          onClick={() =>
            run(() =>
              onSave({
                id: draft.id,
                name: name.trim(),
                items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity?.trim() || null })),
              }),
            )
          }
          className={primary}
        >
          Guardar plantilla
        </button>
        {onDelete && (
          <button
            type="button"
            disabled={saving}
            onClick={() => (confirmDelete ? run(onDelete) : setConfirmDelete(true))}
            className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko"
          >
            <Trash2 size={16} /> {confirmDelete ? "Toca otra vez para borrarla" : "Borrar plantilla"}
          </button>
        )}
      </div>
    </div>
  );
}
