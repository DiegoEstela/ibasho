"use client";

import { useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import { PLACE_CATEGORIES } from "@/lib/viajes/categories";
import { dayLabel } from "@/lib/viajes/dates";
import { extractUrl, normalizeUrl } from "@/lib/viajes/maps";
import { colorFor } from "@/lib/compras/icons";
import type { TripPlace } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  place: TripPlace | null;
  tripId: string;
  householdId: string;
  /** Días del viaje, para elegir cuándo ir. */
  days: string[];
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

export function PlaceSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.place ? "Editar lugar" : "Nuevo lugar"}>
      {props.open && <PlaceForm key={props.place?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function PlaceForm({ place, tripId, householdId, days, onSaved }: Props) {
  const [name, setName] = useState(place?.name ?? "");
  const [category, setCategory] = useState(place?.category ?? "ver");
  const [mapsUrl, setMapsUrl] = useState(place?.maps_url ?? "");
  const [note, setNote] = useState(place?.note ?? "");
  const [day, setDay] = useState(place?.planned_day ?? "");
  const [favorite, setFavorite] = useState(place?.favorite ?? false);
  const [done, setDone] = useState(place?.done ?? false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Escribe el nombre del lugar.");

    let url: string | null = null;
    if (mapsUrl.trim()) {
      url = normalizeUrl(extractUrl(mapsUrl) ?? mapsUrl);
      if (!url) return setError("El enlace del mapa no parece válido. Pégalo tal como lo copiaste de Google Maps.");
    }

    const payload = {
      name: name.trim(),
      category,
      maps_url: url,
      note: note.trim() || null,
      planned_day: day || null,
      favorite,
      done,
    };
    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = place
      ? await supabase.from("trip_places").update(payload).eq("id", place.id)
      : await supabase.from("trip_places").insert({ ...payload, trip_id: tripId, household_id: householdId });
    setSaving(false);
    if (saveError) return setError("No se pudo guardar el lugar. Inténtalo de nuevo.");
    onSaved();
  }

  async function remove() {
    if (!place) return;
    setSaving(true);
    const { error: deleteError } = await createClient().from("trip_places").delete().eq("id", place.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar el lugar.");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="p-name">Nombre</label>
        <input id="p-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Museo Ghibli" maxLength={100} autoFocus />
      </div>

      <div>
        <p className={label}>¿Qué es?</p>
        <div className="flex flex-wrap gap-2">
          {PLACE_CATEGORIES.map((c) => {
            const selected = c.key === category;
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                aria-pressed={selected}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  selected ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <Icon size={14} style={{ color: colorFor(c.color) }} /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="p-url">Enlace de Google Maps (opcional)</label>
        <input id="p-url" className={field} inputMode="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" autoCapitalize="none" autoCorrect="off" />
        <p className="mt-1 px-1 text-xs text-ink-soft">Sin enlace, el botón del mapa busca el lugar por su nombre.</p>
      </div>

      <div>
        <label className={label} htmlFor="p-day">¿Qué día irán? (opcional)</label>
        {days.length > 0 ? (
          <select id="p-day" className={field} value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Sin día asignado</option>
            {days.map((d) => (
              <option key={d} value={d}>{dayLabel(d)}</option>
            ))}
            {day && !days.includes(day) && <option value={day}>{dayLabel(day)}</option>}
          </select>
        ) : (
          <input id="p-day" type="date" className={field} value={day} onChange={(e) => setDay(e.target.value)} />
        )}
      </div>

      <div>
        <label className={label} htmlFor="p-note">Nota</label>
        <textarea id="p-note" className={`${field} min-h-20 py-3`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reservar con tiempo, cierra los lunes…" rows={3} />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFavorite((v) => !v)}
          aria-pressed={favorite}
          className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition active:scale-95 ${
            favorite ? "border-hanko/40 bg-hanko/10 text-hanko" : "border-line bg-surface text-ink-soft"
          }`}
        >
          <Heart size={16} className={favorite ? "fill-hanko" : ""} /> Favorito
        </button>
        <button
          type="button"
          onClick={() => setDone((v) => !v)}
          aria-pressed={done}
          className={`min-h-11 flex-1 rounded-xl border text-sm font-medium transition active:scale-95 ${
            done ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
          }`}
        >
          {done ? "✓ Ya fuimos" : "Marcar como hecho"}
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : place ? "Guardar cambios" : "Guardar lugar"}
      </button>

      {place &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, quitar el lugar
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Quitar lugar
          </button>
        ))}
    </form>
  );
}
