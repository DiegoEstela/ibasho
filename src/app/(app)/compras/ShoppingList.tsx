"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, House, LayoutGrid, List, ListChecks, Package, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { SwipeRow } from "@/components/ui/SwipeRow";
import { CATEGORIES, DEFAULT_CATEGORY_STYLE, classify, type Category } from "@/lib/compras/categories";
import { colorFor, iconFor } from "@/lib/compras/icons";
import { madridDay, purchaseStats, type PurchaseRow } from "@/lib/compras/suggestions";
import { deleteTemplate, loadTemplates, saveTemplate, type Template } from "@/lib/compras/templates";
import { formatQuantity, parseIngredient } from "@/lib/cocina/parse";
import { useProfile } from "@/components/profile/ProfileProvider";
import { createClient } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push/client";
import { timeAgo } from "@/lib/utils/time";
import { CategorySheet } from "./CategorySheet";
import { CategoryTiles } from "./CategoryTiles";
import { QuickPickSheet, type QuickPick } from "./QuickPickSheet";
import type { TemplateInput } from "./TemplatePane";
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
export type Product = { id: string; name: string; category: string | null; in_stock: boolean };

type Props = {
  householdId: string;
  userId: string;
  initialItems: Item[];
  initialProducts: Product[];
  initialCategories: CustomCategoryRow[];
  initialTemplates: Template[];
  templatesUnavailable: boolean;
  /** Compras ya hechas, para saber qué toca comprar. */
  history: PurchaseRow[];
  members: Member[];
};

type Toast = { text: string; undo?: () => void; actionLabel?: string };

const STORES = ["Mercadona", "Consum", "Dia", "Carrefour", "Lidl", "Aldi"];
const RECENT_DONE_DAYS = 3;
const VIEW_KEY = "ibasho.compras.vista";

type View = "lista" | "categorias";

// Las tres partes del módulo.
type Tab = "alacena" | "casa" | "compra";
const TABS = [
  ["compra", "Lista de compras", "Lo que falta comprar", ShoppingBasket],
  ["casa", "Casa", "Lo que tienen ahora en casa", House],
  ["alacena", "Lista de productos", "Todos los productos que conocen", Package],
] as const;

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
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

export function ShoppingList({ householdId, userId, initialItems, initialProducts, initialCategories, initialTemplates, templatesUnavailable, history, members }: Props) {
  const profile = useProfile();
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
  const [tab, setTab] = useState<Tab>("compra");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [catSheet, setCatSheet] = useState<{ open: boolean; cat: Cat | null }>({ open: false, cat: null });
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [quickOpen, setQuickOpen] = useState(false);
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

  function changeTab(next: Tab) {
    setTab(next);
    setSelectedCat(null);
    setText("");
  }

  const stats = useMemo(() => purchaseStats(history), [history]);
  const today = useMemo(() => madridDay(now), [now]);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `household_id=eq.${householdId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setProducts((prev) => Object.fromEntries(Object.entries(prev).filter(([, p]) => p.id !== id)));
            return;
          }
          const row = payload.new as Product;
          setProducts((prev) => ({ ...prev, [key(row.name)]: { id: row.id, name: row.name, category: row.category, in_stock: row.in_stock } }));
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

  // Las plantillas se vuelven a pedir enteras cuando cambia cualquiera de sus dos tablas.
  useEffect(() => {
    if (templatesUnavailable) return;
    const reload = async () => {
      const next = await loadTemplates(supabase);
      if (next) setTemplates(next);
    };
    const channel = supabase
      .channel(`shopping-templates-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_templates", filter: `household_id=eq.${householdId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_template_items", filter: `household_id=eq.${householdId}` }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, householdId, templatesUnavailable]);

  // ---------- Acciones ----------
  function patchProduct(p: Product, patch: Partial<Product>) {
    setProducts((prev) => ({ ...prev, [key(p.name)]: { ...p, ...patch } }));
  }

  /** Crea el producto si no existía (si ya estaba, queda como está) y lo devuelve. */
  async function ensureProduct(name: string, category: string, extra: Partial<Pick<Product, "in_stock">> = {}) {
    const k = key(name);
    await supabase
      .from("products")
      .upsert({ household_id: householdId, name, category, ...extra }, { onConflict: "household_id,name_key", ignoreDuplicates: true });
    const { data: product } = await supabase
      .from("products")
      .select("id, name, category, in_stock")
      .eq("household_id", householdId)
      .eq("name_key", k)
      .maybeSingle();
    if (product) setProducts((prev) => ({ ...prev, [k]: product as Product }));
    return (product as Product | null) ?? null;
  }

  /** Pone un producto en la lista de la próxima compra; lo que está en la lista es lo que falta en casa. */
  async function addToList(name: string, quantity: string | null, forcedCategory?: string | null, silent = false, notify = true) {
    const k = key(name);

    if (items.some((i) => !i.done && key(i.name) === k)) {
      if (!silent) flash({ text: `«${name}» ya está en la lista` });
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

    let productId: string | null = known?.id ?? null;
    if (!known) {
      const product = await ensureProduct(name, category, { in_stock: false });
      productId = product?.id ?? null;
    } else {
      const patch: Partial<Product> = {};
      if (known.in_stock) patch.in_stock = false;
      // Si se eligió una categoría a mano, el producto la recuerda para la próxima vez.
      if (forcedCategory && known.category !== forcedCategory) patch.category = forcedCategory;
      if (Object.keys(patch).length) {
        patchProduct(known, patch);
        await supabase.from("products").update(patch).eq("id", known.id);
      }
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
    if (notify) notifyPartner({ kind: "compras", title: "Lista de compras", body: `${profile.name || "Tu pareja"} agregó «${name}»`, url: "/compras" });
  }

  /** Añade varios de golpe desde «Voy a comprar»; la pareja recibe un solo aviso. */
  async function addMany(picks: QuickPick[]) {
    const inList = new Set(items.filter((i) => !i.done).map((i) => key(i.name)));
    const fresh = picks.filter((p) => !inList.has(key(p.name)));
    if (fresh.length === 0) return;
    await Promise.all(fresh.map((p) => addToList(p.name, p.quantity, null, true, false)));
    flash({ text: fresh.length === 1 ? `Añadido «${fresh[0].name}»` : `Añadidos ${fresh.length} productos` });
    notifyPartner({
      kind: "compras",
      title: "Lista de compras",
      body: fresh.length === 1 ? `${profile.name || "Tu pareja"} agregó «${fresh[0].name}»` : `${profile.name || "Tu pareja"} agregó ${fresh.length} productos`,
      url: "/compras",
    });
  }

  async function saveTemplateFromSheet(template: TemplateInput) {
    const ok = await saveTemplate(supabase, householdId, template);
    if (ok) {
      const next = await loadTemplates(supabase);
      if (next) setTemplates(next);
    }
    return ok;
  }

  async function deleteTemplateFromSheet(id: string) {
    const ok = await deleteTemplate(supabase, id);
    if (ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
    return ok;
  }

  async function addByName(raw: string, forcedCategory?: string | null) {
    const parsed = parseIngredient(raw);
    if (!parsed) return;
    await addToList(capitalize(parsed.name), formatQuantity(parsed.quantity, parsed.unit) || null, forcedCategory);
  }

  /** Marca si un producto está en casa o falta. Lo que falta pasa a la lista; lo que ya hay sale de ella. */
  async function setStock(product: Product, inStock: boolean) {
    if (product.in_stock === inStock) return;
    patchProduct(product, { in_stock: inStock });
    const { error } = await supabase.from("products").update({ in_stock: inStock }).eq("id", product.id);
    if (error) {
      patchProduct(product, { in_stock: product.in_stock });
      flash({ text: "No se pudo actualizar. Revisa tu conexión." });
      return;
    }
    if (!inStock) {
      await addToList(capitalize(product.name), null, null, true);
      return;
    }
    const pendingOnes = items.filter((i) => !i.done && !i.id.startsWith("tmp-") && (i.product_id === product.id || key(i.name) === key(product.name)));
    if (pendingOnes.length === 0) return;
    setItems((prev) => prev.filter((i) => !pendingOnes.some((p) => p.id === i.id)));
    await supabase.from("shopping_items").delete().in("id", pendingOnes.map((i) => i.id));
  }

  /** Añade un producto nuevo: a la alacena (solo se conoce) o a casa (ya lo tienen). */
  async function addProduct(raw: string, mode: "alacena" | "casa") {
    const name = capitalize(raw.trim());
    if (!name) return;
    const known = products[key(name)];
    if (known) {
      if (mode === "casa" && !known.in_stock) {
        await setStock(known, true);
        flash({ text: `«${capitalize(known.name)}» está en casa` });
      } else {
        flash({ text: `«${capitalize(known.name)}» ya está` });
      }
      return;
    }
    const category = selectedCat ?? classify(name);
    const created = await ensureProduct(name, category, { in_stock: mode === "casa" });
    if (!created) flash({ text: "No se pudo añadir. Revisa tu conexión." });
  }

  /** «Se acabó»: sale de casa y se ofrece comprarlo de nuevo. */
  async function finish(product: Product) {
    patchProduct(product, { in_stock: false });
    const { error } = await supabase.from("products").update({ in_stock: false }).eq("id", product.id);
    if (error) {
      patchProduct(product, { in_stock: product.in_stock });
      flash({ text: "No se pudo actualizar. Revisa tu conexión." });
      return;
    }
    flash({
      text: `Se acabó «${capitalize(product.name)}»`,
      actionLabel: "Comprar de nuevo",
      undo: () => {
        setToast(null);
        addToList(capitalize(product.name), null, null, true);
      },
    });
  }

  async function saveProduct(product: Product, patch: { category: string }) {
    setEditingProduct(null);
    patchProduct(product, patch);
    const { error } = await supabase.from("products").update(patch).eq("id", product.id);
    if (error) {
      patchProduct(product, product);
      flash({ text: "No se pudo guardar." });
    }
  }

  async function deleteProduct(product: Product) {
    setEditingProduct(null);
    setProducts((prev) => Object.fromEntries(Object.entries(prev).filter(([, p]) => p.id !== product.id)));
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      patchProduct(product, product);
      flash({ text: "No se pudo quitar." });
    }
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
      return;
    }
    // Lo comprado ya está en casa; si se devuelve a la lista, vuelve a faltar.
    const product = Object.values(products).find((p) => p.id === item.product_id);
    if (product && product.in_stock === done) return;
    if (product) {
      patchProduct(product, { in_stock: done });
      await supabase.from("products").update({ in_stock: done }).eq("id", product.id);
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
  const pendingKeys = useMemo(() => new Set(pending.map((i) => key(i.name))), [pending]);
  const productList = useMemo(() => Object.values(products).sort((a, b) => a.name.localeCompare(b.name, "es")), [products]);
  const atHome = useMemo(() => productList.filter((p) => p.in_stock), [productList]);
  const catOrder = useCallback(
    (c: string) => {
      const n = allCats.findIndex((x) => x.name === c);
      return n === -1 ? allCats.length : n;
    },
    [allCats],
  );

  /** Productos de la alacena o de casa, filtrados por lo escrito y por la categoría elegida, y agrupados por categoría. */
  const groupedProducts = useMemo(() => {
    const q = key(text);
    const source = tab === "casa" ? atHome : productList;
    const groups = new Map<string, Product[]>();
    for (const p of source) {
      const category = p.category ?? "Otros";
      if (selectedCat && category !== selectedCat) continue;
      if (q && !key(p.name).includes(q)) continue;
      groups.set(category, [...(groups.get(category) ?? []), p]);
    }
    return [...groups.entries()].sort((a, b) => catOrder(a[0]) - catOrder(b[0]));
  }, [tab, atHome, productList, selectedCat, text, catOrder]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of pending) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    // Dentro de cada categoría, arriba lo que más se compra (el orden previo, lo más reciente, desempata).
    const rank = (i: Item) => (i.product_id ? (stats.get(i.product_id)?.count ?? 0) : 0);
    for (const list of groups.values()) list.sort((a, b) => rank(b) - rank(a));
    return [...groups.entries()].sort((a, b) => catOrder(a[0]) - catOrder(b[0]));
  }, [pending, catOrder, stats]);

  const visibleGroups = useMemo(
    () => (selectedCat ? grouped.filter(([c]) => c === selectedCat) : grouped),
    [grouped, selectedCat],
  );

  // El número de cada categoría cuenta lo que falta (compra), lo que hay en casa (casa) o todo lo conocido (alacena).
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    if (tab === "compra") {
      for (const i of pending) result[i.category] = (result[i.category] ?? 0) + 1;
    } else {
      for (const p of tab === "casa" ? atHome : productList) {
        const c = p.category ?? "Otros";
        result[c] = (result[c] ?? 0) + 1;
      }
    }
    return result;
  }, [tab, pending, atHome, productList]);

  const recentDone = useMemo(() => {
    const limit = now - RECENT_DONE_DAYS * 86400_000;
    return items
      .filter((i) => i.done && i.done_at && new Date(i.done_at).getTime() > limit)
      .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  }, [items, now]);

  const suggestions = useMemo(() => {
    const q = key(text);

    // En «Casa», al escribir se ofrecen los productos conocidos que aún no están en casa.
    if (tab === "casa") {
      if (!q) return [];
      return productList.filter((p) => !p.in_stock && key(p.name).includes(q)).slice(0, 6).map((p) => capitalize(p.name));
    }
    if (tab === "alacena") return [];

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
  }, [tab, text, products, productList, items, pendingKeys]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    if (tab === "compra") addByName(value, view === "categorias" ? selectedCat : null);
    else addProduct(value, tab);
    inputRef.current?.focus();
  }

  function pick(name: string) {
    setText("");
    if (tab === "compra") addByName(name, view === "categorias" ? selectedCat : null);
    else addProduct(name, tab);
  }

  const tabInfo = TABS.find(([value]) => value === tab)!;
  const subtitle =
    tab === "compra"
      ? pending.length === 0
        ? "Todo comprado"
        : pending.length === 1
          ? "Falta 1 producto"
          : `Faltan ${pending.length} productos`
      : tab === "alacena"
        ? productList.length === 1
          ? "1 producto"
          : `${productList.length} productos`
        : atHome.length === 1
          ? "1 producto en casa"
          : `${atHome.length} productos en casa`;

  const placeholder =
    tab === "alacena"
      ? "Buscar o añadir un producto…"
      : tab === "casa"
        ? "Buscar o añadir a lo que hay en casa…"
        : view === "categorias" && selectedCat
          ? `Añadir a ${selectedCat}…`
          : "Añadir… (ej. 2 yogures)";

  const pantryActive = tab !== "compra";

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Compras"
        subtitle={
          <span aria-live="polite">{subtitle}</span>
        }
        actions={
          tab === "compra" ? (
            <div className="flex gap-0.5 rounded-xl bg-washi-deep p-1 lg:hidden" role="tablist" aria-label="Vista">
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
                  aria-label={label}
                  onClick={() => changeView(value)}
                  className={`flex size-9 items-center justify-center rounded-lg transition ${
                    view === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
                  }`}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      {/* Las tres partes del módulo */}
      <div className="mb-2 flex w-full gap-1 rounded-xl bg-washi-deep p-1 lg:mb-3 lg:w-fit" role="tablist" aria-label="Secciones de compras">
        {TABS.map(([value, name, , Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => changeTab(value)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 text-center text-[13px] leading-tight font-medium transition lg:flex-none lg:gap-2 lg:px-5 lg:text-sm ${
              tab === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
            }`}
          >
            <Icon size={16} />
            {name}
            {value === "compra" && pending.length > 0 && (
              <span className="rounded-full bg-forest/15 px-1.5 text-xs text-forest">{pending.length}</span>
            )}
          </button>
        ))}
      </div>
      <p className="mb-1 hidden text-sm text-ink-soft lg:block">{tabInfo[2]}</p>

      {/* Campo siempre visible */}
      <div className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 bg-background/90 px-4 pb-2 pt-1 backdrop-blur lg:-mx-10 lg:px-10 lg:pb-3 lg:pt-4">
        <form onSubmit={submit} className="relative flex gap-2 lg:max-w-3xl">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={placeholder}
            enterKeyHint="done"
            autoComplete="off"
            className={field}
            aria-label={tab === "alacena" ? "Buscar o añadir un producto" : "Añadir producto"}
          />
          <button
            aria-label="Añadir"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest text-surface shadow-sm transition active:scale-95"
          >
            <Plus size={22} />
          </button>
          {tab === "compra" && (
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              aria-label="Voy a comprar"
              className="flex size-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-forest shadow-sm transition active:scale-95 lg:w-auto lg:px-4"
            >
              <ListChecks size={20} />
              <span className="hidden text-sm font-medium lg:inline">Voy a comprar</span>
            </button>
          )}
        </form>

        {(focused || text) && suggestions.length > 0 && (
          <div className="mt-2 flex gap-2 chip-row lg:max-w-3xl" role="listbox" aria-label="Sugerencias">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[13px] text-ink transition active:scale-95"
              >
                <Plus size={14} className="text-forest" /> {s}
              </button>
            ))}
          </div>
        )}

        {/* Filtro por categoría en el teléfono (productos y casa) */}
        {pantryActive && (
          <div className="mt-2 flex gap-2 chip-row lg:hidden" role="group" aria-label="Categorías">
            {[{ name: null as string | null, label: "Todas" }, ...allCats.filter((c) => (counts[c.name] ?? 0) > 0 || c.name === selectedCat).map((c) => ({ name: c.name as string | null, label: c.name }))].map((c) => (
              <button
                key={c.label}
                onClick={() => setSelectedCat(c.name)}
                aria-pressed={selectedCat === c.name}
                className={`flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[13px] transition active:scale-95 ${
                  selectedCat === c.name ? "border-forest bg-forest text-surface" : "border-line bg-surface text-ink"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* Categorías: en escritorio quedan fijas a la derecha y solo se desplaza la lista */}
        <div
          className={`${tab === "compra" && view === "categorias" ? "" : "hidden"} lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pb-4`}
        >
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
        {tab === "compra" && view === "categorias" && (
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

        {/* Zona principal: lo único que se desplaza en escritorio */}
        <div className={`${tab === "compra" && view === "categorias" ? "hidden lg:block" : ""} lg:col-start-1 lg:row-start-1`}>
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

          {tab === "alacena" && (
            <ProductGroups
              groups={groupedProducts}
              metaOf={metaOf}
              empty={
                productList.length === 0
                  ? { title: "No hay productos todavía", text: "Escribe arriba los productos que compran y quedarán guardados para la próxima vez." }
                  : { title: "No hay nada que coincida", text: "Prueba con otra palabra o escribe el nombre y pulsa + para añadirlo." }
              }
            >
              {(p) => (
                <button onClick={() => setEditingProduct(p)} className="flex min-h-12 w-full items-center px-3 py-1.5 text-left">
                  <span className="truncate text-[15px] leading-snug">{capitalize(p.name)}</span>
                </button>
              )}
            </ProductGroups>
          )}

          {tab === "casa" && (
            <ProductGroups
              groups={groupedProducts}
              metaOf={metaOf}
              empty={
                atHome.length === 0
                  ? { title: "No hay nada en casa", text: "Lo que marques como comprado llega aquí solo. También puedes escribir arriba lo que ya tienen." }
                  : { title: "No hay nada que coincida", text: "Prueba con otra palabra." }
              }
            >
              {(p) => (
                <HomeRow
                  product={p}
                  onFinish={() => finish(p)}
                  onEdit={() => setEditingProduct(p)}
                />
              )}
            </ProductGroups>
          )}

          {tab === "compra" && (
            <>
              {visibleGroups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
                  <ShoppingBasket className="mx-auto text-forest" size={36} strokeWidth={1.5} />
                  <p className="mt-3 font-display text-lg font-bold">
                    {selectedCat ? "No falta nada de esta categoría" : "La lista está vacía"}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Escribe arriba lo que falta y aparecerá en el teléfono de tu pareja al instante.
                  </p>
                  <button
                    onClick={() => setQuickOpen(true)}
                    className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-forest px-5 text-sm font-medium text-surface shadow-sm transition active:scale-95"
                  >
                    <ListChecks size={18} /> Voy a comprar
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 lg:block lg:columns-2 lg:gap-6 2xl:columns-3">
                  {visibleGroups.map(([category, list]) => {
                    const meta = metaOf(category);
                    const Icon = iconFor(meta.icon);
                    return (
                      <div key={category} className="lg:mb-6 lg:break-inside-avoid">
                        <h2 className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft lg:mb-1.5 lg:gap-2 lg:text-xs">
                          <Icon size={14} style={{ color: colorFor(meta.color) }} />
                          {category}
                        </h2>
                        <ItemRows list={list} onToggle={toggle} onRemove={remove} onEdit={setEditing} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Comprado recientemente */}
              {recentDone.length > 0 && (
                <div className="mt-4 lg:mt-8 lg:max-w-xl">
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    aria-expanded={showDone}
                    className="flex min-h-11 w-full items-center justify-between px-2 text-sm text-ink-soft"
                  >
                    <span>Comprado recientemente ({recentDone.length})</span>
                    <ChevronDown size={18} className={`transition ${showDone ? "rotate-180" : ""}`} />
                  </button>
                  <ul className={`${showDone ? "" : "hidden"} divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface`}>
                    {recentDone.map((item) => (
                      <li key={item.id} className="flex min-h-12 items-center">
                        <button
                          onClick={() => toggle(item)}
                          aria-label={`Devolver «${item.name}» a la lista`}
                          className="flex size-12 shrink-0 items-center justify-center"
                        >
                          <span className="check-pop flex size-5 items-center justify-center rounded-full bg-forest text-surface">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        </button>
                        <div className="flex-1 py-1.5 pr-3">
                          <span className="block text-[15px] text-ink-soft line-through">{item.name}</span>
                          <span className="block text-[11px] text-ink-soft" suppressHydrationWarning>
                            {memberName(item.done_by)} · {item.done_at ? timeAgo(item.done_at, now) : ""}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Aviso con opción de deshacer */}
      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-background shadow-lg lg:bottom-8"
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={toast.undo} className="min-h-9 shrink-0 font-medium text-sakura">
              {toast.actionLabel ?? "Deshacer"}
            </button>
          )}
        </div>
      )}

      <QuickPickSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        products={productList}
        pending={pending}
        allCats={allCats}
        stats={stats}
        today={today}
        templates={templates}
        templatesUnavailable={templatesUnavailable}
        onAdd={addMany}
        onSaveTemplate={saveTemplateFromSheet}
        onDeleteTemplate={deleteTemplateFromSheet}
      />

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

      <ProductSheet
        categories={allCats.map((c) => c.name)}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSave={saveProduct}
        onDelete={deleteProduct}
      />
    </section>
  );
}

/** Productos agrupados por categoría; cada fila la dibuja quien lo usa. */
function ProductGroups({
  groups,
  metaOf,
  empty,
  children,
}: {
  groups: [string, Product[]][];
  metaOf: (name: string) => Cat;
  empty: { title: string; text: string };
  children: (product: Product) => React.ReactNode;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
        <ShoppingBasket className="mx-auto text-forest" size={36} strokeWidth={1.5} />
        <p className="mt-3 font-display text-lg font-bold">{empty.title}</p>
        <p className="mt-1 text-sm text-ink-soft">{empty.text}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 lg:block lg:columns-2 lg:gap-6 2xl:columns-3">
      {groups.map(([category, list]) => {
        const meta = metaOf(category);
        const Icon = iconFor(meta.icon);
        return (
          <div key={category} className="lg:mb-6 lg:break-inside-avoid">
            <h2 className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft lg:mb-1.5 lg:gap-2 lg:text-xs">
              <Icon size={14} style={{ color: colorFor(meta.color) }} />
              {category}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {list.map((p) => (
                <li key={p.id}>{children(p)}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Un producto que hay en casa, con un botón para avisar que se acabó. */
function HomeRow({ product, onFinish, onEdit }: { product: Product; onFinish: () => void; onEdit: () => void }) {
  return (
    <div className="flex min-h-12 items-center gap-2 pl-3 pr-2">
      <button onClick={onEdit} className="min-h-12 min-w-0 flex-1 py-1.5 text-left">
        <span className="block truncate text-[15px] leading-snug">{capitalize(product.name)}</span>
      </button>
      <button onClick={onFinish} className="min-h-9 shrink-0 rounded-lg px-3 text-[13px] font-medium text-hanko transition active:scale-95">
        Se acabó
      </button>
    </div>
  );
}

function ProductSheet({
  categories,
  product,
  onClose,
  onSave,
  onDelete,
}: {
  categories: string[];
  product: Product | null;
  onClose: () => void;
  onSave: (product: Product, patch: { category: string }) => void;
  onDelete: (product: Product) => void;
}) {
  return (
    <BottomSheet open={!!product} onClose={onClose} title={product ? capitalize(product.name) : "Producto"}>
      {product && <ProductForm key={product.id} product={product} categories={categories} onSave={onSave} onDelete={onDelete} />}
    </BottomSheet>
  );
}

function ProductForm({
  product,
  categories,
  onSave,
  onDelete,
}: {
  product: Product;
  categories: string[];
  onSave: (product: Product, patch: { category: string }) => void;
  onDelete: (product: Product) => void;
}) {
  const current = product.category ?? "Otros";
  const [category, setCategory] = useState(current);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(product, { category });
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-soft" htmlFor="p-cat">Categoría</label>
        <select id="p-cat" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          {(categories.includes(category) ? categories : [...categories, category]).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <button className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95">
        Guardar
      </button>
      <button
        type="button"
        onClick={() => onDelete(product)}
        className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko"
      >
        <Trash2 size={16} /> Quitar de la lista de productos
      </button>
    </form>
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
            <div className="flex min-h-12 items-center">
              <button
                onClick={() => onToggle(item)}
                aria-label={`Marcar «${item.name}» como comprado`}
                className="flex size-12 shrink-0 items-center justify-center"
              >
                <span className="size-5 rounded-full border-2 border-ink-soft/50" />
              </button>
              <button onClick={() => onEdit(item)} className="min-h-12 flex-1 py-1.5 pr-3 text-left">
                <span className="block text-[15px] leading-snug">
                  {item.name}
                  {item.quantity && <span className="ml-2 text-xs text-forest">{item.quantity}</span>}
                </span>
                {(item.note || item.store) && (
                  <span className="block text-xs text-ink-soft">{[item.store, item.note].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            </div>
          </SwipeRow>
        </li>
      ))}
    </ul>
  );
}
