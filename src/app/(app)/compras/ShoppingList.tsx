"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, LayoutGrid, List, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SwipeRow } from "@/components/ui/SwipeRow";
import { CATEGORIES, DEFAULT_CATEGORY_STYLE, classify, type Category } from "@/lib/compras/categories";
import { colorFor, iconFor } from "@/lib/compras/icons";
import { formatQuantity, parseIngredient } from "@/lib/cocina/parse";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils/time";
import { CategorySheet } from "./CategorySheet";
import { CategoryTiles } from "./CategoryTiles";
import type { Cat, CustomCategoryRow } from "./categoryTypes";

export type Item = {
  id: string;
  product_id: string | null;
  name: string;
  quantity: string | null;
  note: string | null;
  category: string;
  store: string | null;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
};

export type Member = { id: string; name: string; color: string };
export type Product = { id: string; name: string; category: string | null };

type Props = {
  householdId: string;
  userId: string;
  initialItems: Item[];
  initialProducts: Product[];
  initialCategories: CustomCategoryRow[];
  members: Member[];
};

type Toast = { text: string; undo?: () => void };

const STORES = ["Mercadona", "Consum", "Dia", "Carrefour", "Lidl", "Aldi"];
const RECENT_DONE_DAYS = 3;
const VIEW_KEY = "ibasho.compras.vista";

type View = "lista" | "categorias";

// La vista elegida se recuerda en el navegador; sin almacenamiento, solo mientras dure la sesión.
const viewListeners = new Set<() => void>();
let viewInMemory: View | null = null;

function subscribeView(callback: () => void) {
  viewListeners.add(callback);
  return () => viewListeners.delete(callback);
}

function getView(): View {
  if (viewInMemory) return viewInMemory;
  try {
    return localStorage.getItem(VIEW_KEY) === "categorias" ? "categorias" : "lista";
  } catch {
    return "lista";
  }
}

function setStoredView(next: View) {
  viewInMemory = next;
  try {
    localStorage.setItem(VIEW_KEY, next);
  } catch {
    // Ignorar: la preferencia solo es una comodidad.
  }
  viewListeners.forEach((listener) => listener());
}

const key = (s: string) => s.trim().toLowerCase();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const field =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

export function ShoppingList({ householdId, userId, initialItems, initialProducts, initialCategories, members }: Props) {
  const [supabase] = useState(() => createClient());
  const [now] = useState(() => Date.now());
  const [items, setItems] = useState<Item[]>(initialItems);
  const [products, setProducts] = useState<Record<string, Product>>(() =>
    Object.fromEntries(initialProducts.map((p) => [key(p.name), p])),
  );
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [customCats, setCustomCats] = useState<CustomCategoryRow[]>(initialCategories);
  const view = useSyncExternalStore(subscribeView, getView, () => "lista" as View);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [catSheet, setCatSheet] = useState<{ open: boolean; cat: Cat | null }>({ open: false, cat: null });
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const memberName = useCallback(
    (id: string | null) => members.find((m) => m.id === id)?.name ?? "Alguien",
    [members],
  );

  function flash(next: Toast) {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  function changeView(next: View) {
    setStoredView(next);
    setSelectedCat(null);
  }

  // ---------- Tiempo real ----------
  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("shopping_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) setItems(data as Item[]);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`shopping-${householdId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shopping_items", filter: `household_id=eq.${householdId}` },
        (payload) => {
          const row = payload.new as Item;
          setItems((prev) => {
            if (prev.some((i) => i.id === row.id)) return prev;
            const temp = prev.find((i) => i.id.startsWith("tmp-") && key(i.name) === key(row.name));
            return temp ? prev.map((i) => (i.id === temp.id ? row : i)) : [row, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shopping_items", filter: `household_id=eq.${householdId}` },
        (payload) => {
          const row = payload.new as Item;
          setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shopping_categories", filter: `household_id=eq.${householdId}` },
        (payload) => {
          const row = payload.new as CustomCategoryRow;
          setCustomCats((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shopping_categories", filter: `household_id=eq.${householdId}` },
        (payload) => {
          const row = payload.new as CustomCategoryRow;
          setCustomCats((prev) => prev.map((c) => (c.id === row.id ? row : c)));
        },
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "shopping_categories" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setCustomCats((prev) => prev.filter((c) => c.id !== id));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "shopping_items" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setItems((prev) => prev.filter((i) => i.id !== id));
      })
      .subscribe();

    // Al volver a la app (o recuperar conexión) se resincroniza por si se perdió algún evento.
    const onVisible = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [supabase, householdId, refetch]);

  // ---------- Acciones ----------
  async function addByName(raw: string, forcedCategory?: string | null) {
    const parsed = parseIngredient(raw);
    if (!parsed) return;

    const name = capitalize(parsed.name);
    const quantity = formatQuantity(parsed.quantity, parsed.unit) || null;
    const k = key(name);

    if (items.some((i) => !i.done && key(i.name) === k)) {
      flash({ text: `«${name}» ya está en la lista` });
      return;
    }

    const known = products[k];
    const category = forcedCategory ?? known?.category ?? classify(name);
    const tempId = `tmp-${crypto.randomUUID()}`;
    const temp: Item = {
      id: tempId,
      product_id: known?.id ?? null,
      name,
      quantity,
      note: null,
      category,
      store: null,
      done: false,
      done_by: null,
      done_at: null,
      created_at: new Date().toISOString(),
    };
    setItems((prev) => [temp, ...prev]);

    let productId = known?.id ?? null;
    if (!known) {
      await supabase
        .from("products")
        .upsert({ household_id: householdId, name, category }, { onConflict: "household_id,name_key", ignoreDuplicates: true });
      const { data: product } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("household_id", householdId)
        .eq("name_key", k)
        .maybeSingle();
      if (product) {
        productId = product.id;
        setProducts((prev) => ({ ...prev, [k]: product }));
      }
    }

    // Si se eligió una categoría a mano, el producto la recuerda para la próxima vez.
    if (forcedCategory && known && known.category !== forcedCategory) {
      await supabase.from("products").update({ category: forcedCategory }).eq("id", known.id);
      setProducts((prev) => ({ ...prev, [k]: { ...known, category: forcedCategory } }));
    }

    const { data, error } = await supabase
      .from("shopping_items")
      .insert({ household_id: householdId, product_id: productId, name, quantity, category })
      .select()
      .single();

    if (error || !data) {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      flash({ text: "No se pudo añadir. Revisa tu conexión." });
      return;
    }
    setItems((prev) =>
      prev.some((i) => i.id === data.id) ? prev.filter((i) => i.id !== tempId) : prev.map((i) => (i.id === tempId ? (data as Item) : i)),
    );
  }

  async function toggle(item: Item) {
    if (item.id.startsWith("tmp-")) return;
    const done = !item.done;
    const patch = done
      ? { done, done_by: userId, done_at: new Date().toISOString() }
      : { done, done_by: null, done_at: null };

    if (done) navigator.vibrate?.(12);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));

    const { error } = await supabase.from("shopping_items").update(patch).eq("id", item.id);
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      flash({ text: "No se pudo actualizar. Revisa tu conexión." });
    }
  }

  async function remove(item: Item) {
    if (item.id.startsWith("tmp-")) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase.from("shopping_items").delete().eq("id", item.id);
    if (error) {
      setItems((prev) => [item, ...prev]);
      flash({ text: "No se pudo borrar." });
      return;
    }
    flash({
      text: `Se quitó «${item.name}»`,
      undo: async () => {
        setToast(null);
        const { id: _id, created_at: _c, ...rest } = item;
        const { data } = await supabase
          .from("shopping_items")
          .insert({ ...rest, household_id: householdId })
          .select()
          .single();
        if (data) setItems((prev) => (prev.some((i) => i.id === data.id) ? prev : [data as Item, ...prev]));
      },
    });
  }

  async function save(item: Item, patch: Pick<Item, "name" | "quantity" | "note" | "category" | "store">) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    setEditing(null);
    const { error } = await supabase.from("shopping_items").update(patch).eq("id", item.id);
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      flash({ text: "No se pudo guardar." });
      return;
    }
    // La app aprende: la próxima vez este producto cae directo en la categoría corregida.
    if (item.product_id && patch.category !== item.category) {
      await supabase.from("products").update({ category: patch.category }).eq("id", item.product_id);
      setProducts((prev) => {
        const k = key(item.name);
        return prev[k] ? { ...prev, [k]: { ...prev[k], category: patch.category } } : prev;
      });
    }
  }

  async function saveCategory(value: { name: string; icon: string; color: string }) {
    const editingCat = catSheet.cat;
    setCatSheet({ open: false, cat: null });

    if (editingCat?.id) {
      const previous = customCats;
      setCustomCats((prev) => prev.map((c) => (c.id === editingCat.id ? { ...c, ...value } : c)));
      const { error } = await supabase.from("shopping_categories").update(value).eq("id", editingCat.id);
      if (error) {
        setCustomCats(previous);
        flash({ text: "No se pudo guardar la categoría." });
        return;
      }
      if (value.name !== editingCat.name) {
        // Los productos que usaban el nombre anterior se mudan al nuevo.
        setItems((prev) => prev.map((i) => (i.category === editingCat.name ? { ...i, category: value.name } : i)));
        setSelectedCat((c) => (c === editingCat.name ? value.name : c));
        await supabase.from("shopping_items").update({ category: value.name }).eq("household_id", householdId).eq("category", editingCat.name);
        await supabase.from("products").update({ category: value.name }).eq("household_id", householdId).eq("category", editingCat.name);
      }
      return;
    }

    const { data, error } = await supabase
      .from("shopping_categories")
      .insert({ household_id: householdId, ...value, position: customCats.length })
      .select()
      .single();
    if (error || !data) {
      flash({ text: "No se pudo crear la categoría." });
      return;
    }
    setCustomCats((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as CustomCategoryRow]));
    setSelectedCat(value.name);
  }

  async function deleteCategory(cat: Cat) {
    if (!cat.id) return;
    setCatSheet({ open: false, cat: null });
    setCustomCats((prev) => prev.filter((c) => c.id !== cat.id));
    setItems((prev) => prev.map((i) => (i.category === cat.name ? { ...i, category: "Otros" } : i)));
    setSelectedCat(null);
    await supabase.from("shopping_categories").delete().eq("id", cat.id);
    await supabase.from("shopping_items").update({ category: "Otros" }).eq("household_id", householdId).eq("category", cat.name);
    await supabase.from("products").update({ category: "Otros" }).eq("household_id", householdId).eq("category", cat.name);
  }

  // ---------- Datos derivados ----------
  // Predeterminadas (sin «Otros»), luego las propias, y «Otros» siempre al final.
  const allCats = useMemo<Cat[]>(() => {
    const defaults = (CATEGORIES as readonly Category[])
      .filter((c) => c !== "Otros")
      .map((name) => ({ name, ...DEFAULT_CATEGORY_STYLE[name], custom: false }));
    const custom = [...customCats]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ name: c.name, icon: c.icon, color: c.color, custom: true, id: c.id }));
    return [...defaults, ...custom, { name: "Otros", ...DEFAULT_CATEGORY_STYLE.Otros, custom: false }];
  }, [customCats]);

  const catByName = useMemo(() => new Map(allCats.map((c) => [c.name, c])), [allCats]);
  const metaOf = (name: string): Cat => catByName.get(name) ?? allCats[allCats.length - 1];
  const pending = useMemo(() => items.filter((i) => !i.done), [items]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of pending) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    const order = (c: string) => {
      const n = allCats.findIndex((x) => x.name === c);
      return n === -1 ? allCats.length : n;
    };
    return [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [pending, allCats]);

  const visibleGroups = useMemo(
    () => (selectedCat ? grouped.filter(([c]) => c === selectedCat) : grouped),
    [grouped, selectedCat],
  );

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const i of pending) result[i.category] = (result[i.category] ?? 0) + 1;
    return result;
  }, [pending]);

  const recentDone = useMemo(() => {
    const limit = now - RECENT_DONE_DAYS * 86400_000;
    return items
      .filter((i) => i.done && i.done_at && new Date(i.done_at).getTime() > limit)
      .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  }, [items, now]);

  const suggestions = useMemo(() => {
    const pendingKeys = new Set(pending.map((i) => key(i.name)));
    const q = key(text);

    if (q) {
      const names = Object.values(products).map((p) => capitalize(p.name));
      const starts = names.filter((n) => key(n).startsWith(q));
      const contains = names.filter((n) => !key(n).startsWith(q) && key(n).includes(q));
      return [...starts, ...contains].filter((n) => !pendingKeys.has(key(n))).slice(0, 6);
    }

    // Sin texto: lo que más se compra, para añadirlo con un toque.
    const counts = new Map<string, { name: string; n: number }>();
    for (const i of items) {
      const k = key(i.name);
      counts.set(k, { name: i.name, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    return [...counts.entries()]
      .filter(([k]) => !pendingKeys.has(k))
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 8)
      .map(([, v]) => v.name);
  }, [text, products, items, pending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    addByName(value, view === "categorias" ? selectedCat : null);
    inputRef.current?.focus();
  }

  function pick(name: string) {
    setText("");
    addByName(name, view === "categorias" ? selectedCat : null);
  }

  return (
    <section className="max-w-[1500px]">
      <h1 className="font-display text-3xl font-bold lg:text-4xl">Compras</h1>
      <p className="mt-1 text-ink-soft" aria-live="polite">
        {pending.length === 0
          ? "Todo comprado"
          : pending.length === 1
            ? "Falta 1 producto"
            : `Faltan ${pending.length} productos`}
      </p>

      <div className="mt-4 flex w-fit gap-1 rounded-xl bg-washi-deep p-1 lg:hidden" role="tablist" aria-label="Vista">
        {(
          [
            ["lista", "Lista", List],
            ["categorias", "Categorías", LayoutGrid],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={view === value}
            onClick={() => changeView(value)}
            className={`flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${
              view === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Campo siempre visible */}
      <div className="sticky top-0 z-10 -mx-5 bg-background/90 px-5 pb-3 pt-4 backdrop-blur lg:-mx-10 lg:px-10">
        <form onSubmit={submit} className="relative flex gap-2 lg:max-w-3xl">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={view === "categorias" && selectedCat ? `Añadir a ${selectedCat}…` : "Añadir… (ej. 2 yogures)"}
            enterKeyHint="done"
            autoComplete="off"
            className={field}
            aria-label="Añadir producto"
          />
          <button
            aria-label="Añadir"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-forest text-surface shadow-sm transition active:scale-95"
          >
            <Plus size={22} />
          </button>
        </form>

        {(focused || text) && suggestions.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:max-w-3xl" role="listbox" aria-label="Sugerencias">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3.5 text-sm text-ink transition active:scale-95"
              >
                <Plus size={14} className="text-forest" /> {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* Mosaico de categorías: pestaña en teléfono, panel lateral en escritorio */}
        <div className={`${view === "categorias" ? "" : "hidden"} lg:col-start-2 lg:row-start-1 lg:block`}>
          <h2 className="mb-3 hidden font-display text-xl font-bold lg:block">Categorías</h2>
          <CategoryTiles
            categories={allCats}
            counts={counts}
            selected={selectedCat}
            onSelect={setSelectedCat}
            onCreate={() => setCatSheet({ open: true, cat: null })}
          />
        </div>

        {/* Productos de la categoría elegida (solo teléfono) */}
        {view === "categorias" && (
          <div className="lg:hidden">
            {selectedCat ? (
              <>
                <div className="mb-1.5 flex items-center justify-between px-2">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                    {selectedCat} · {counts[selectedCat] ?? 0}
                  </h2>
                  {metaOf(selectedCat).custom && (
                    <button
                      onClick={() => setCatSheet({ open: true, cat: metaOf(selectedCat) })}
                      className="flex min-h-9 items-center gap-1.5 text-sm text-forest"
                    >
                      <Pencil size={14} /> Editar categoría
                    </button>
                  )}
                </div>
                {pending.some((i) => i.category === selectedCat) ? (
                  <ItemRows
                    list={pending.filter((i) => i.category === selectedCat)}
                    onToggle={toggle}
                    onRemove={remove}
                    onEdit={setEditing}
                  />
                ) : (
                  <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
                    No falta nada de esta categoría. Escribe arriba para añadir algo.
                  </p>
                )}
              </>
            ) : (
              <p className="text-center text-sm text-ink-soft">Toca una categoría para ver y añadir sus productos.</p>
            )}
          </div>
        )}

        {/* Lista: pestaña en teléfono, zona principal en escritorio */}
        <div className={`${view === "lista" ? "" : "hidden"} lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block`}>
          {selectedCat && (
            <div className="mb-4 hidden items-center gap-3 lg:flex">
              <span className="rounded-full bg-forest/15 px-3 py-1 text-sm font-medium text-forest">{selectedCat}</span>
              <button onClick={() => setSelectedCat(null)} className="min-h-9 text-sm text-ink-soft underline-offset-4 hover:underline">
                Ver todas
              </button>
              {metaOf(selectedCat).custom && (
                <button
                  onClick={() => setCatSheet({ open: true, cat: metaOf(selectedCat) })}
                  className="flex min-h-9 items-center gap-1.5 text-sm text-forest"
                >
                  <Pencil size={14} /> Editar categoría
                </button>
              )}
            </div>
          )}

          {visibleGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
              <ShoppingBasket className="mx-auto text-forest" size={36} strokeWidth={1.5} />
              <p className="mt-3 font-display text-lg font-bold">
                {selectedCat ? "No falta nada de esta categoría" : "La lista está vacía"}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Escribe arriba lo que falta y aparecerá en el teléfono de tu pareja al instante.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 lg:block lg:columns-2 lg:gap-6 2xl:columns-3">
              {visibleGroups.map(([category, list]) => {
                const meta = metaOf(category);
                const Icon = iconFor(meta.icon);
                return (
                  <div key={category} className="lg:mb-6 lg:break-inside-avoid">
                    <h2 className="mb-1.5 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wider text-ink-soft">
                      <Icon size={14} style={{ color: colorFor(meta.color) }} />
                      {category}
                    </h2>
                    <ItemRows list={list} onToggle={toggle} onRemove={remove} onEdit={setEditing} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Comprado recientemente: siempre visible en escritorio */}
        {recentDone.length > 0 && (
          <div className="lg:col-start-2 lg:row-start-2 lg:self-start">
            <button
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex min-h-11 w-full items-center justify-between px-2 text-sm text-ink-soft lg:pointer-events-none lg:font-display lg:text-xl lg:font-bold lg:text-ink"
            >
              <span>Comprado recientemente ({recentDone.length})</span>
              <ChevronDown size={18} className={`transition lg:hidden ${showDone ? "rotate-180" : ""}`} />
            </button>
            <ul
              className={`${showDone ? "" : "hidden"} divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface lg:block`}
            >
              {recentDone.map((item) => (
                <li key={item.id} className="flex min-h-14 items-center">
                  <button
                    onClick={() => toggle(item)}
                    aria-label={`Devolver «${item.name}» a la lista`}
                    className="flex size-14 shrink-0 items-center justify-center"
                  >
                    <span className="check-pop flex size-6 items-center justify-center rounded-full bg-forest text-surface">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  </button>
                  <div className="flex-1 py-2 pr-4">
                    <span className="block text-ink-soft line-through">{item.name}</span>
                    <span className="block text-xs text-ink-soft" suppressHydrationWarning>
                      {memberName(item.done_by)} · {item.done_at ? timeAgo(item.done_at, now) : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Aviso con opción de deshacer */}
      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-background shadow-lg lg:bottom-8"
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={toast.undo} className="min-h-9 font-medium text-sakura">
              Deshacer
            </button>
          )}
        </div>
      )}

      <CategorySheet
        open={catSheet.open}
        category={catSheet.cat}
        taken={allCats.map((c) => c.name)}
        onClose={() => setCatSheet({ open: false, cat: null })}
        onSave={saveCategory}
        onDelete={deleteCategory}
      />

      <EditSheet
        categories={allCats.map((c) => c.name)}
        item={editing}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={(item) => {
          setEditing(null);
          remove(item);
        }}
      />
    </section>
  );
}

function EditSheet({
  categories,
  item,
  onClose,
  onSave,
  onDelete,
}: {
  categories: string[];
  item: Item | null;
  onClose: () => void;
  onSave: (item: Item, patch: Pick<Item, "name" | "quantity" | "note" | "category" | "store">) => void;
  onDelete: (item: Item) => void;
}) {
  return (
    <BottomSheet open={!!item} onClose={onClose} title="Editar producto">
      {item && <EditForm key={item.id} item={item} categories={categories} onSave={onSave} onDelete={onDelete} />}
    </BottomSheet>
  );
}

function EditForm({
  item,
  categories,
  onSave,
  onDelete,
}: {
  item: Item;
  categories: string[];
  onSave: (item: Item, patch: Pick<Item, "name" | "quantity" | "note" | "category" | "store">) => void;
  onDelete: (item: Item) => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [category, setCategory] = useState(item.category);
  const [store, setStore] = useState(item.store ?? "");

  const label = "mb-1.5 block text-sm font-medium text-ink-soft";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave(item, {
          name: name.trim(),
          quantity: quantity.trim() || null,
          note: note.trim() || null,
          category,
          store: store.trim() || null,
        });
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <label className={label} htmlFor="e-name">Producto</label>
        <input id="e-name" className={field} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="e-qty">Cantidad</label>
          <input id="e-qty" className={field} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="2, 500 g…" />
        </div>
        <div>
          <label className={label} htmlFor="e-cat">Categoría</label>
          <select id="e-cat" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            {(categories.includes(category) ? categories : [...categories, category]).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="e-note">Nota</label>
        <input id="e-note" className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Marca, tamaño…" />
      </div>
      <div>
        <label className={label} htmlFor="e-store">Supermercado preferido</label>
        <input id="e-store" className={field} value={store} onChange={(e) => setStore(e.target.value)} list="stores" placeholder="Opcional" />
        <datalist id="stores">
          {STORES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <button className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95">
        Guardar
      </button>
      <button
        type="button"
        onClick={() => onDelete(item)}
        className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko"
      >
        <Trash2 size={16} /> Quitar de la lista
      </button>
    </form>
  );
}

function ItemRows({
  list,
  onToggle,
  onRemove,
  onEdit,
}: {
  list: Item[];
  onToggle: (item: Item) => void;
  onRemove: (item: Item) => void;
  onEdit: (item: Item) => void;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {list.map((item) => (
        <li key={item.id}>
          <SwipeRow onSwipeRight={() => onToggle(item)} onSwipeLeft={() => onRemove(item)} rightLabel="Comprado">
            <div className="flex min-h-14 items-center">
              <button
                onClick={() => onToggle(item)}
                aria-label={`Marcar «${item.name}» como comprado`}
                className="flex size-14 shrink-0 items-center justify-center"
              >
                <span className="size-6 rounded-full border-2 border-ink-soft/50" />
              </button>
              <button onClick={() => onEdit(item)} className="min-h-14 flex-1 py-2 pr-4 text-left">
                <span className="block text-base">
                  {item.name}
                  {item.quantity && <span className="ml-2 text-sm text-forest">{item.quantity}</span>}
                </span>
                {(item.note || item.store) && (
                  <span className="block text-sm text-ink-soft">{[item.store, item.note].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            </div>
          </SwipeRow>
        </li>
      ))}
    </ul>
  );
}
