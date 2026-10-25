"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import { LIST_EMOJIS, type Wishlist } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  list: Wishlist | null;
  householdId: string;
  position: number;
  itemCount: number;
  onSaved: (id: string | null) => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

export function WishlistSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.list ? "Editar lista" : "Nueva lista"}>
      {props.open && <Form key={props.list?.id ?? "nueva"} {...props} />}
    </BottomSheet>
  );
}

function Form({ list, householdId, position, itemCount, onSaved }: Props) {
  const [name, setName] = useState(list?.name ?? "");
  const [emoji, setEmoji] = useState(list?.emoji ?? "🎁");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Ponle un nombre a la lista, por ejemplo «Regalos».");

    setSaving(true);
    const supabase = createClient();
    const payload = { name: name.trim(), emoji };
    if (list) {
      const { error: updateError } = await supabase.from("wishlists").update(payload).eq("id", list.id);
      setSaving(false);
      if (updateError) return setError("No se pudo guardar la lista.");
      return onSaved(list.id);
    }
    const { data, error: insertError } = await supabase.from("wishlists").insert({ ...payload, household_id: householdId, position }).select("id").single();
    setSaving(false);
    if (insertError || !data) return setError("No se pudo crear la lista.");
    onSaved(data.id as string);
  }

  async function remove() {
    if (!list) return;
    setSaving(true);
    const { error: deleteError } = await createClient().from("wishlists").delete().eq("id", list.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar la lista.");
    onSaved(null);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="w-name">Nombre</label>
        <input id="w-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Regalos" maxLength={40} autoFocus />
      </div>

      <div>
        <p className={label}>Emoji</p>
        <div className="flex flex-wrap gap-2">
          {LIST_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              aria-pressed={emoji === e}
              aria-label={`Emoji ${e}`}
              className={`size-11 rounded-xl border text-xl transition active:scale-90 ${emoji === e ? "border-forest bg-forest/15" : "border-line bg-surface"}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : list ? "Guardar cambios" : "Crear lista"}
      </button>

      {list &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar{itemCount > 0 ? ` la lista y sus ${itemCount} ${itemCount === 1 ? "deseo" : "deseos"}` : " la lista"}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar lista
          </button>
        ))}
    </form>
  );
}
