"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Heart, Pencil, Plus, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import { ItemSheet } from "./ItemSheet";
import { ProductImage } from "./ProductImage";
import { WishlistSheet } from "./WishlistSheet";
import { PRIORITIES, SUGGESTED_LISTS, siteName, type Person, type WishItem, type Wishlist } from "./types";

type Props = {
  householdId: string;
  userId: string;
  people: Person[];
  initialLists: Wishlist[];
  initialItems: WishItem[];
};

const formatDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES") : "");

export function WishlistView({ householdId, userId, people, initialLists, initialItems }: Props) {
  const [supabase] = useState(() => createClient());
  const [lists, setLists] = useState(initialLists);
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState(initialLists[0]?.id ?? "");
  const [showBought, setShowBought] = useState(false);

  const [itemSheet, setItemSheet] = useState<{ open: boolean; item: WishItem | null }>({ open: false, item: null });
  const [listSheet, setListSheet] = useState<{ open: boolean; list: Wishlist | null }>({ open: false, list: null });
  const [creating, setCreating] = useState(false);

  // ---------- Sincronización ----------
  const refetch = useCallback(async () => {
    const [l, i] = await Promise.all([
      supabase.from("wishlists").select("id, name, emoji, position").order("position").order("created_at"),
      supabase.from("wishlist_items").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    if (l.data) setLists(l.data as Wishlist[]);
    if (i.data) setItems(i.data as WishItem[]);
  }, [supabase]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`wishlist-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wishlists", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "wishlist_items", filter }, queue)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [supabase, householdId, refetch]);

  // ---------- Datos derivados ----------
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const inList = useMemo(() => items.filter((i) => i.wishlist_id === active?.id), [items, active]);
  const wanted = useMemo(
    () => inList.filter((i) => i.status === "deseado").sort((a, b) => a.priority - b.priority || b.created_at.localeCompare(a.created_at)),
    [inList],
  );
  const bought = useMemo(
    () => inList.filter((i) => i.status === "comprado").sort((a, b) => (b.purchased_at ?? "").localeCompare(a.purchased_at ?? "")),
    [inList],
  );
  const wantedCount = (listId: string) => items.filter((i) => i.wishlist_id === listId && i.status === "deseado").length;

  const priced = wanted.filter((i) => i.price !== null);
  const total = priced.reduce((s, i) => s + toCents(i.price!), 0);

  const ownerName = (id: string | null) => (id === null ? "De los dos" : id === userId ? "Tuyo" : (people.find((p) => p.id === id)?.name ?? "Alguien"));

  // ---------- Acciones ----------
  async function setStatus(item: WishItem, status: WishItem["status"]) {
    const patch = { status, purchased_at: status === "comprado" ? new Date().toISOString() : null };
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    if (status === "comprado") navigator.vibrate?.(12);
    const { error } = await supabase.from("wishlist_items").update(patch).eq("id", item.id);
    if (error) setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
  }

  async function createSuggested() {
    setCreating(true);
    const { data } = await supabase
      .from("wishlists")
      .insert(SUGGESTED_LISTS.map((l, position) => ({ ...l, household_id: householdId, position })))
      .select("id, name, emoji, position");
    setCreating(false);
    if (data) {
      const created = data as Wishlist[];
      setLists(created);
      setActiveId(created[0]?.id ?? "");
    }
  }

  // ---------- Pantallas ----------
  const header = (
    <PageHeader
      title="Wishlist"
      subtitle={lists.length ? "Lo que sueñan tener" : "Sus deseos, en un solo lugar"}
      actions={
        active && (
          <button
            onClick={() => setItemSheet({ open: true, item: null })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> Deseo
          </button>
        )
      }
    />
  );

  if (lists.length === 0) {
    return (
      <section className="max-w-[1500px]">
        {header}
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center lg:mt-10">
          <span className="text-5xl" aria-hidden>
            🎁
          </span>
          <div>
            <p className="font-display text-xl font-bold">Todo lo que les gustaría tener</p>
            <p className="mt-1 text-sm text-ink-soft">
              Pegan el enlace de una tienda y la app trae la foto, el nombre y el precio. Los organizan en listas y marcan lo que van consiguiendo.
            </p>
          </div>
          <button
            onClick={createSuggested}
            disabled={creating}
            className="min-h-12 w-full rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
          >
            {creating ? "Creando…" : "Empezar con Casa, Regalos y Tecnología"}
          </button>
          <button onClick={() => setListSheet({ open: true, list: null })} className="min-h-11 text-sm text-forest">
            O crear mi propia lista
          </button>
        </div>
        <WishlistSheet
          open={listSheet.open}
          onClose={() => setListSheet({ open: false, list: null })}
          list={null}
          householdId={householdId}
          position={0}
          itemCount={0}
          onSaved={(id) => {
            setListSheet({ open: false, list: null });
            if (id) setActiveId(id);
            refetch();
          }}
        />
      </section>
    );
  }

  return (
    <section className="max-w-[1500px]">
      {header}

      {/* Listas */}
      <div className="flex items-center gap-2 chip-row" role="tablist" aria-label="Listas">
        {lists.map((l) => {
          const selected = l.id === active?.id;
          return (
            <button
              key={l.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(l.id)}
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
                selected ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
              }`}
            >
              <span aria-hidden>{l.emoji}</span> {l.name}
              {wantedCount(l.id) > 0 && <span className="rounded-full bg-black/5 px-1.5 text-xs">{wantedCount(l.id)}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setListSheet({ open: true, list: null })}
          aria-label="Nueva lista"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-soft/40 text-ink-soft"
        >
          <Plus size={16} />
        </button>
      </div>

      {active && (
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <p className="text-sm text-ink-soft">
            {wanted.length === 0
              ? "Nada pendiente en esta lista"
              : `${wanted.length} ${wanted.length === 1 ? "deseo" : "deseos"}${priced.length > 0 ? ` · aprox. ${formatEUR(total)}` : ""}${priced.length > 0 && priced.length < wanted.length ? ` (${wanted.length - priced.length} sin precio)` : ""}`}
          </p>
          <button
            onClick={() => setListSheet({ open: true, list: active })}
            className="flex min-h-9 items-center gap-1.5 text-sm text-forest"
          >
            <Pencil size={14} /> Editar lista
          </button>
        </div>
      )}

      {/* Deseos */}
      {wanted.length === 0 ? (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            {active?.emoji ?? "🎁"}
          </span>
          <p className="font-display text-lg font-bold">{bought.length > 0 ? "¡Lo consiguieron todo!" : "Aquí irán sus deseos"}</p>
          <p className="text-sm text-ink-soft">Pega el enlace de un producto y la app trae la foto, el nombre y el precio.</p>
          <button
            onClick={() => setItemSheet({ open: true, item: null })}
            className="min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95"
          >
            Añadir un deseo
          </button>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5 2xl:grid-cols-5">
          {wanted.map((item) => {
            const p = PRIORITIES.find((x) => x.value === item.priority)!;
            return (
              <li key={item.id} className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <button onClick={() => setItemSheet({ open: true, item })} className="block text-left" aria-label={`Editar «${item.title}»`}>
                  <div className="relative">
                    <ProductImage src={item.image_url} alt="" className="aspect-[4/3] w-full" />
                    <span className="absolute left-2 top-2 flex gap-0.5 rounded-full bg-black/45 px-2 py-1 backdrop-blur-sm" title={p.label}>
                      {Array.from({ length: p.hearts }, (_, i) => (
                        <Heart key={i} size={11} className="fill-white text-white" />
                      ))}
                    </span>
                    {item.price !== null && (
                      <span className="absolute bottom-2 right-2 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-bold shadow">{formatEUR(toCents(item.price))}</span>
                    )}
                  </div>
                  <div className="px-3 pb-1 pt-2.5">
                    <p className="line-clamp-2 text-[15px] font-medium leading-snug">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-soft">
                      {ownerName(item.owner_user_id)}
                      {siteName(item.url) && ` · ${siteName(item.url)}`}
                    </p>
                    {item.note && <p className="mt-1 line-clamp-1 text-xs text-ink-soft">{item.note}</p>}
                  </div>
                </button>

                <div className="mt-auto flex items-center gap-2 px-3 pb-3 pt-2">
                  <button
                    onClick={() => setStatus(item, "comprado")}
                    className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest/10 text-xs font-medium text-forest transition active:scale-95"
                  >
                    <Check size={14} /> Lo conseguimos
                  </button>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir «${item.title}» en la tienda`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Ya conseguidos */}
      {bought.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowBought((v) => !v)}
            aria-expanded={showBought}
            className="flex min-h-11 w-full items-center justify-between px-2 text-sm text-ink-soft"
          >
            <span>Ya conseguidos ({bought.length})</span>
            <ChevronDown size={18} className={`transition ${showBought ? "rotate-180" : ""}`} />
          </button>
          {showBought && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface lg:max-w-2xl">
              {bought.map((item) => (
                <li key={item.id} className="flex min-h-16 items-center gap-3 px-3 py-2">
                  <ProductImage src={item.image_url} alt="" className="size-11 shrink-0 rounded-xl opacity-70" />
                  <button onClick={() => setItemSheet({ open: true, item })} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[15px] text-ink-soft line-through">{item.title}</span>
                    <span className="block text-xs text-ink-soft">
                      Conseguido el {formatDay(item.purchased_at)}
                      {item.price !== null && ` · ${formatEUR(toCents(item.price))}`}
                    </span>
                  </button>
                  <button
                    onClick={() => setStatus(item, "deseado")}
                    aria-label={`Volver «${item.title}» a deseados`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft"
                  >
                    <Undo2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ItemSheet
        open={itemSheet.open}
        onClose={() => setItemSheet({ open: false, item: null })}
        item={itemSheet.item}
        lists={lists}
        defaultListId={active?.id ?? ""}
        people={people}
        meId={userId}
        householdId={householdId}
        onSaved={() => {
          setItemSheet({ open: false, item: null });
          refetch();
        }}
      />

      <WishlistSheet
        open={listSheet.open}
        onClose={() => setListSheet({ open: false, list: null })}
        list={listSheet.list}
        householdId={householdId}
        position={lists.length}
        itemCount={listSheet.list ? items.filter((i) => i.wishlist_id === listSheet.list!.id).length : 0}
        onSaved={(id) => {
          setListSheet({ open: false, list: null });
          if (id) setActiveId(id);
          else setActiveId("");
          refetch();
        }}
      />
    </section>
  );
}
