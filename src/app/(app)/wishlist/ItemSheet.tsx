"use client";

import { useState } from "react";
import { Heart, Link2, Loader2, Trash2, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { parseAmount } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import { extractUrl, normalizeUrl } from "@/lib/viajes/maps";
import { fetchLinkPreview } from "./actions";
import { ProductImage } from "./ProductImage";
import { PRIORITIES, siteName, type Person, type WishItem, type Wishlist } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  item: WishItem | null;
  lists: Wishlist[];
  defaultListId: string;
  people: Person[];
  meId: string;
  householdId: string;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";
const BOTH = "both";

export function ItemSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.item ? "Editar deseo" : "Nuevo deseo"}>
      {props.open && <ItemForm key={props.item?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function ItemForm({ item, lists, defaultListId, people, meId, householdId, onSaved }: Props) {
  const [url, setUrl] = useState(item?.url ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [priceText, setPriceText] = useState(item?.price != null ? String(item.price).replace(".", ",") : "");
  const [image, setImage] = useState<string | null>(item?.image_url ?? null);
  const [priority, setPriority] = useState<number>(item?.priority ?? 2);
  const [owner, setOwner] = useState(item ? (item.owner_user_id ?? BOTH) : meId);
  const [note, setNote] = useState(item?.note ?? "");
  const [listId, setListId] = useState(item?.wishlist_id ?? defaultListId);

  const [lookup, setLookup] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [lookupNote, setLookupNote] = useState("");
  const [lastLooked, setLastLooked] = useState(item?.url ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Trae la foto, el título y el precio de la tienda, sin pisar lo que ya se escribió. */
  async function lookupLink(text: string) {
    const clean = extractUrl(text) ?? text.trim();
    if (!clean || clean === lastLooked || !normalizeUrl(clean)) return;
    setLastLooked(clean);
    setLookup("loading");
    setLookupNote("");

    const result = await fetchLinkPreview(clean);
    if (!result.ok) {
      setLookup("error");
      return setLookupNote(result.message);
    }
    setUrl(result.url);
    if (result.title) setTitle((t) => t || result.title!);
    if (result.price !== null) setPriceText((p) => p || String(result.price).replace(".", ","));
    if (result.image) setImage(result.image);
    setLookup("done");
    setLookupNote("Datos del producto cargados. Revísalos antes de guardar.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Ponle un nombre al deseo.");

    let cleanUrl: string | null = null;
    if (url.trim()) {
      cleanUrl = normalizeUrl(extractUrl(url) ?? url);
      if (!cleanUrl) return setError("El enlace no parece válido. Pégalo completo, como lo copiaste de la tienda.");
    }
    let price: number | null = null;
    if (priceText.trim()) {
      price = parseAmount(priceText);
      if (price === null) return setError("Escribe el precio con números, por ejemplo 49,90.");
    }

    const payload = {
      wishlist_id: listId,
      title: title.trim(),
      url: cleanUrl,
      image_url: image,
      price,
      priority,
      owner_user_id: owner === BOTH ? null : owner,
      note: note.trim() || null,
    };

    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = item
      ? await supabase.from("wishlist_items").update(payload).eq("id", item.id)
      : await supabase.from("wishlist_items").insert({ ...payload, household_id: householdId });
    setSaving(false);
    if (saveError) return setError("No se pudo guardar el deseo. Inténtalo de nuevo.");
    onSaved();
  }

  async function remove() {
    if (!item) return;
    setSaving(true);
    const { error: deleteError } = await createClient().from("wishlist_items").delete().eq("id", item.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar el deseo.");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="i-url">Enlace del producto (opcional)</label>
        <div className="relative">
          <Link2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            id="i-url"
            className={`${field} pl-10 pr-10`}
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              // Al pegar, se busca enseguida con lo pegado (el campo aún no se actualizó).
              const pasted = e.clipboardData.getData("text");
              if (pasted) setTimeout(() => lookupLink(pasted), 0);
            }}
            onBlur={(e) => lookupLink(e.target.value)}
            placeholder="Pega aquí el enlace de la tienda"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus={!item}
          />
          {lookup === "loading" && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-forest" />}
        </div>
        {lookup === "loading" && <p className="mt-1.5 px-1 text-xs text-ink-soft">Buscando la foto, el nombre y el precio…</p>}
        {lookupNote && <p className={`mt-1.5 px-1 text-xs ${lookup === "error" ? "text-hanko" : "text-forest"}`}>{lookupNote}</p>}
      </div>

      {image && (
        <div className="relative flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
          <ProductImage src={image} alt="Foto del producto" className="size-20 shrink-0 rounded-xl" />
          <p className="min-w-0 flex-1 text-sm text-ink-soft">Foto de {siteName(url) ?? "la tienda"}</p>
          <button type="button" onClick={() => setImage(null)} aria-label="Quitar la foto" className="flex size-9 items-center justify-center rounded-full text-ink-soft">
            <X size={16} />
          </button>
        </div>
      )}

      <div>
        <label className={label} htmlFor="i-title">Nombre</label>
        <input id="i-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auriculares con cancelación de ruido" maxLength={120} autoFocus={!!item} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="i-price">Precio aprox. (€)</label>
          <input id="i-price" className={field} inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="Opcional" />
        </div>
        <div>
          <label className={label} htmlFor="i-list">Lista</label>
          <select id="i-list" className={field} value={listId} onChange={(e) => setListId(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className={label}>¿Cuántas ganas hay?</p>
        <div className="flex gap-1 rounded-xl bg-washi-deep p-1">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              aria-pressed={priority === p.value}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 transition ${priority === p.value ? "bg-surface shadow-sm" : ""}`}
            >
              <span className="flex gap-0.5">
                {Array.from({ length: p.hearts }, (_, i) => (
                  <Heart key={i} size={12} className={priority === p.value ? "fill-hanko text-hanko" : "fill-ink-soft/40 text-ink-soft/40"} />
                ))}
              </span>
              <span className={`text-[11px] font-medium ${priority === p.value ? "text-forest" : "text-ink-soft"}`}>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {people.length > 1 && (
        <div>
          <label className={label} htmlFor="i-owner">¿De quién es el deseo?</label>
          <select id="i-owner" className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value={BOTH}>De los dos</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (tú)` : p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={label} htmlFor="i-note">Nota</label>
        <textarea id="i-note" className={`${field} min-h-16 py-3`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Color, talla, dónde está más barato…" rows={2} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : item ? "Guardar cambios" : "Guardar deseo"}
      </button>

      {item &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar este deseo
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar deseo
          </button>
        ))}
    </form>
  );
}
