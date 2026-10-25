"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { COLOR_KEYS, colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/gastos/currency";
import { TRIP_EMOJIS } from "@/lib/viajes/categories";
import { removeOfflineTrip } from "@/lib/viajes/offline";
import { removeFiles, uploadTripFile, validateFile } from "@/lib/viajes/storage";
import type { Trip } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Viaje que se edita; null para crear uno nuevo. */
  trip: Trip | null;
  householdId: string;
  /** Foto de portada actual (enlace temporal), para mostrarla al editar. */
  coverUrl: string | null;
  onSaved: (tripId: string) => void;
  onDeleted: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

export function TripSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.trip ? "Editar viaje" : "Nuevo viaje"}>
      {props.open && <TripForm key={props.trip?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function TripForm({ trip, householdId, coverUrl, onSaved, onDeleted }: Props) {
  const [name, setName] = useState(trip?.name ?? "");
  const [destination, setDestination] = useState(trip?.destination ?? "");
  const [emoji, setEmoji] = useState(trip?.emoji ?? "🌸");
  const [color, setColor] = useState(trip?.color ?? "sky");
  const [start, setStart] = useState(trip?.start_date ?? "");
  const [end, setEnd] = useState(trip?.end_date ?? "");
  const [notes, setNotes] = useState(trip?.notes ?? "");
  const [currency, setCurrency] = useState(trip?.currency ?? "EUR");

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const previewRef = useRef<string | null>(null);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Libera la vista previa al cerrar el formulario.
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  function pickCover(file: File | undefined) {
    if (!file) return;
    const invalid = validateFile(file);
    if (invalid || !file.type.startsWith("image/")) return setError(invalid ?? "La portada debe ser una foto.");
    setError("");
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);
    setCoverFile(file);
    setRemoveCover(false);
  }

  function clearCover() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreview(null);
    setCoverFile(null);
    setRemoveCover(true);
  }

  const shownCover = preview ?? (removeCover ? null : coverUrl);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Ponle un nombre al viaje, por ejemplo «Japón 2027».");
    if (start && end && end < start) return setError("El regreso no puede ser antes de la salida.");

    const payload = {
      name: name.trim(),
      destination: destination.trim() || null,
      emoji: emoji.trim() || null,
      color,
      currency,
      start_date: start || null,
      end_date: end || null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    const supabase = createClient();

    let tripId = trip?.id ?? "";
    if (trip) {
      const { error: updateError } = await supabase.from("trips").update(payload).eq("id", trip.id);
      if (updateError) {
        setSaving(false);
        return setError("No se pudo guardar el viaje. Inténtalo de nuevo.");
      }
    } else {
      const { data, error: insertError } = await supabase.from("trips").insert({ ...payload, household_id: householdId }).select("id").single();
      if (insertError || !data) {
        setSaving(false);
        return setError("No se pudo crear el viaje. Inténtalo de nuevo.");
      }
      tripId = data.id as string;
    }

    // Portada: se sube la nueva (y se borra la anterior) o se quita la actual.
    if (coverFile) {
      const uploaded = await uploadTripFile(supabase, { householdId, tripId, file: coverFile, prefix: "portada-" });
      if ("error" in uploaded) {
        setSaving(false);
        setError(`El viaje se guardó, pero la portada no: ${uploaded.error}`);
        return;
      }
      await supabase.from("trips").update({ cover_path: uploaded.path }).eq("id", tripId);
      if (trip?.cover_path) await removeFiles(supabase, [trip.cover_path]);
    } else if (removeCover && trip?.cover_path) {
      await supabase.from("trips").update({ cover_path: null }).eq("id", tripId);
      await removeFiles(supabase, [trip.cover_path]);
    }

    setSaving(false);
    onSaved(tripId);
  }

  async function remove() {
    if (!trip) return;
    setSaving(true);
    const supabase = createClient();
    // Los archivos no se borran solos con el viaje: se eliminan primero.
    const { data: docs } = await supabase.from("trip_documents").select("file_path").eq("trip_id", trip.id);
    await removeFiles(supabase, [...(docs ?? []).map((d) => d.file_path as string), trip.cover_path ?? ""]);
    const { error: deleteError } = await supabase.from("trips").delete().eq("id", trip.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar el viaje.");
    await removeOfflineTrip(trip.id);
    onDeleted();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="t-name">Nombre del viaje</label>
        <input id="t-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Japón 2027" maxLength={80} autoFocus />
      </div>

      <div>
        <label className={label} htmlFor="t-dest">Destino</label>
        <input id="t-dest" className={field} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Tokio y Kioto" maxLength={80} />
      </div>

      <div>
        <label className={label} htmlFor="t-currency">Moneda del destino</label>
        <select id="t-currency" className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
          ))}
        </select>
        <p className="mt-1 px-1 text-xs text-ink-soft">Para apuntar los gastos del viaje en esa moneda; la app los pasa a euros.</p>
      </div>

      <div>
        <p className={label}>Un emoji que lo represente</p>
        <div className="flex flex-wrap gap-2">
          {TRIP_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              aria-pressed={emoji === e}
              aria-label={`Emoji ${e}`}
              className={`size-11 rounded-xl border text-2xl transition active:scale-90 ${emoji === e ? "border-forest bg-forest/15" : "border-line bg-surface"}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="t-start">Salida</label>
          <input id="t-start" type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="t-end">Regreso</label>
          <input id="t-end" type="date" className={field} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div>
        <p className={label}>Color</p>
        <div className="flex gap-3">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setColor(key)}
              aria-label={key}
              aria-pressed={key === color}
              className={`size-11 rounded-full border-2 transition active:scale-90 ${key === color ? "border-ink" : "border-transparent"}`}
              style={{ background: colorFor(key) }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className={label}>Foto de portada (opcional)</p>
        {shownCover ? (
          <div className="relative h-32 overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shownCover} alt="Portada del viaje" className="size-full object-cover" />
            <button
              type="button"
              onClick={clearCover}
              aria-label="Quitar la portada"
              className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/55 text-white"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ink-soft/40 text-sm text-ink-soft transition active:scale-[0.99]">
            <ImagePlus size={22} />
            Elegir una foto
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickCover(e.target.files?.[0])} />
          </label>
        )}
      </div>

      <div>
        <label className={label} htmlFor="t-notes">Notas</label>
        <textarea id="t-notes" className={`${field} min-h-20 py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ideas, recordatorios…" rows={3} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : trip ? "Guardar cambios" : "Crear viaje"}
      </button>

      {trip &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar el viaje con todos sus lugares y archivos
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar viaje
          </button>
        ))}
    </form>
  );
}
