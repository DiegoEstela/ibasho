"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import { LIST_EMOJIS } from "@/lib/viajes/categories";
import { normalizeUrl } from "@/lib/viajes/maps";
import type { TripList } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  list: TripList | null;
  tripId: string;
  householdId: string;
  position: number;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

export function ListSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.list ? "Editar lista de Maps" : "Lista de Google Maps"}>
      {props.open && <ListForm key={props.list?.id ?? "nueva"} {...props} />}
    </BottomSheet>
  );
}

function ListForm({ list, tripId, householdId, position, onSaved }: Props) {
  const [name, setName] = useState(list?.name ?? "");
  const [url, setUrl] = useState(list?.url ?? "");
  const [emoji, setEmoji] = useState(list?.emoji ?? "🗾");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Ponle un nombre a la lista, por ejemplo «Mis lugares de Japón».");
    const clean = normalizeUrl(url);
    if (!clean) return setError("Pega el enlace de la lista. Si copiaste el mensaje completo de «Compartir», también sirve.");

    const payload = { name: name.trim(), url: clean, emoji: emoji.trim() || null };
    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = list
      ? await supabase.from("trip_lists").update(payload).eq("id", list.id)
      : await supabase.from("trip_lists").insert({ ...payload, trip_id: tripId, household_id: householdId, position });
    setSaving(false);
    if (saveError) return setError("No se pudo guardar la lista. Inténtalo de nuevo.");
    onSaved();
  }

  async function remove() {
    if (!list) return;
    setSaving(true);
    const { error: deleteError } = await createClient().from("trip_lists").delete().eq("id", list.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar la lista.");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="-mt-1 text-sm text-ink-soft">
        Guarda aquí una lista de Google Maps y ábrela con un toque. En Google Maps: <span className="font-medium text-ink">Guardado → tu lista → Compartir → Copiar enlace</span>.
      </p>

      <div>
        <label className={label} htmlFor="l-name">Nombre</label>
        <input id="l-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis lugares de Japón" maxLength={60} autoFocus />
      </div>

      <div>
        <label className={label} htmlFor="l-url">Enlace de la lista</label>
        <input id="l-url" className={field} inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" autoCapitalize="none" autoCorrect="off" />
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
        {saving ? "Guardando…" : list ? "Guardar cambios" : "Guardar lista"}
      </button>

      {list &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, quitar la lista
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Quitar lista
          </button>
        ))}
    </form>
  );
}
