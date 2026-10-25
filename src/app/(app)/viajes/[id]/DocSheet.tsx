"use client";

import { useState } from "react";
import { Camera, FileUp, Paperclip } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { DOC_TYPES } from "@/lib/viajes/categories";
import { removeFiles, uploadTripFile, validateFile, contentTypeOf } from "@/lib/viajes/storage";
import { formatSize, type TripDoc } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Documento que se edita; null para subir uno nuevo. */
  doc: TripDoc | null;
  /** Tipo con el que se abre el formulario (por ejemplo, desde la lista de preparación). */
  defaultType: string;
  tripId: string;
  householdId: string;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

/** «entradas-ghibli_final.pdf» → «Entradas ghibli final» */
const nameFromFile = (file: string) => {
  const base = file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
};

export function DocSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.doc ? "Editar documento" : "Guardar un archivo"}>
      {props.open && <DocForm key={props.doc?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function DocForm({ doc, defaultType, tripId, householdId, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(doc?.name ?? "");
  const [type, setType] = useState(doc?.doc_type ?? defaultType);
  const [date, setDate] = useState(doc?.doc_date ?? "");
  const [time, setTime] = useState(doc?.doc_time?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function pick(picked: File | undefined) {
    if (!picked) return;
    const invalid = validateFile(picked);
    if (invalid) return setError(invalid);
    setError("");
    setFile(picked);
    if (!name.trim()) setName(nameFromFile(picked.name));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!doc && !file) return setError("Elige el archivo o haz una foto.");
    if (!name.trim()) return setError("Ponle un nombre, por ejemplo «Entradas Museo Ghibli».");

    const meta = {
      name: name.trim(),
      doc_type: type,
      doc_date: date || null,
      doc_time: time || null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    const supabase = createClient();

    if (doc) {
      const { error: updateError } = await supabase.from("trip_documents").update(meta).eq("id", doc.id);
      setSaving(false);
      if (updateError) return setError("No se pudo guardar. Inténtalo de nuevo.");
      return onSaved();
    }

    const uploaded = await uploadTripFile(supabase, { householdId, tripId, file: file! });
    if ("error" in uploaded) {
      setSaving(false);
      return setError(uploaded.error);
    }

    const { error: insertError } = await supabase.from("trip_documents").insert({
      ...meta,
      trip_id: tripId,
      household_id: householdId,
      file_path: uploaded.path,
      file_name: file!.name,
      mime_type: contentTypeOf(file!),
      size_bytes: file!.size,
    });
    if (insertError) {
      // Sin su fila, el archivo quedaría huérfano: se borra.
      await removeFiles(supabase, [uploaded.path]);
      setSaving(false);
      return setError("No se pudo guardar el documento. Inténtalo de nuevo.");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {doc ? (
        <p className="flex items-center gap-2 rounded-xl bg-background px-3.5 py-2.5 text-sm text-ink-soft">
          <Paperclip size={16} className="shrink-0" />
          <span className="min-w-0 truncate">{doc.file_name ?? "Archivo"}</span>
          <span className="shrink-0 text-xs">{formatSize(doc.size_bytes)}</span>
        </p>
      ) : file ? (
        <p className="flex items-center gap-2 rounded-xl bg-forest/10 px-3.5 py-2.5 text-sm text-forest">
          <Paperclip size={16} className="shrink-0" />
          <span className="min-w-0 truncate">{file.name}</span>
          <span className="shrink-0 text-xs">{formatSize(file.size)}</span>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink-soft/40 text-sm text-ink-soft transition active:scale-[0.98]">
            <FileUp size={22} />
            Elegir archivo
            <span className="text-[11px]">PDF o foto</span>
            <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink-soft/40 text-sm text-ink-soft transition active:scale-[0.98]">
            <Camera size={22} />
            Hacer una foto
            <span className="text-[11px]">con la cámara</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </div>
      )}

      <div>
        <p className={label}>¿Qué es?</p>
        <div className="flex flex-wrap gap-2">
          {DOC_TYPES.map((t) => {
            const selected = t.key === type;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                aria-pressed={selected}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  selected ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <Icon size={14} style={{ color: colorFor(t.color) }} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="d-name">Nombre</label>
        <input id="d-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Entradas Museo Ghibli" maxLength={100} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="d-date">Fecha (opcional)</label>
          <input id="d-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="d-time">Hora (opcional)</label>
          <input id="d-time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="d-notes">Notas</label>
        <textarea id="d-notes" className={`${field} min-h-16 py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Código de reserva, puerta de entrada…" rows={2} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? (doc ? "Guardando…" : "Subiendo…") : doc ? "Guardar cambios" : "Guardar documento"}
      </button>
    </form>
  );
}
