"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Lock, Pin, Trash2, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { NOTE_TAGS } from "@/lib/notas/tags";
import { removeFiles, uploadTripFile, validateFile } from "@/lib/viajes/storage";
import type { HomeNote } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  note: HomeNote | null;
  /** Foto actual (enlace temporal), para mostrarla al editar. */
  photoUrl: string | null;
  householdId: string;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

export function NoteSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.note ? "Editar nota" : "Nueva nota"}>
      {props.open && <NoteForm key={props.note?.id ?? "nueva"} {...props} />}
    </BottomSheet>
  );
}

function NoteForm({ note, photoUrl, householdId, onSaved }: Props) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tag, setTag] = useState(note?.tag ?? "casa");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [secret, setSecret] = useState(note?.is_secret ?? false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const previewRef = useRef<string | null>(null);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  function chooseTag(key: string) {
    setTag(key);
    // Las claves casi siempre son para ocultar: se sugiere, pero se puede cambiar.
    if (key === "claves" && !note) setSecret(true);
  }

  function pick(picked: File | undefined) {
    if (!picked) return;
    const invalid = validateFile(picked);
    if (invalid || !picked.type.startsWith("image/")) return setError(invalid ?? "Elige una foto (no un PDF).");
    setError("");
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(picked);
    setPreview(previewRef.current);
    setFile(picked);
    setRemovePhoto(false);
  }

  function clearPhoto() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreview(null);
    setFile(null);
    setRemovePhoto(true);
  }

  const shown = preview ?? (removePhoto ? null : photoUrl);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Ponle un título a la nota, por ejemplo «Medidas del salón».");

    const payload = { title: title.trim(), body: body.trim(), tag, pinned, is_secret: secret };
    setSaving(true);
    const supabase = createClient();

    let id = note?.id ?? "";
    if (note) {
      const { error: updateError } = await supabase.from("notes").update(payload).eq("id", note.id);
      if (updateError) {
        setSaving(false);
        return setError("No se pudo guardar la nota. Inténtalo de nuevo.");
      }
    } else {
      const { data, error: insertError } = await supabase.from("notes").insert({ ...payload, household_id: householdId }).select("id").single();
      if (insertError || !data) {
        setSaving(false);
        return setError("No se pudo crear la nota. Inténtalo de nuevo.");
      }
      id = data.id as string;
    }

    if (file) {
      const uploaded = await uploadTripFile(supabase, { householdId, tripId: "notas", file, prefix: "nota-" });
      if ("error" in uploaded) {
        setSaving(false);
        return setError(`La nota se guardó, pero la foto no: ${uploaded.error}`);
      }
      await supabase.from("notes").update({ photo_path: uploaded.path }).eq("id", id);
      if (note?.photo_path) await removeFiles(supabase, [note.photo_path]);
    } else if (removePhoto && note?.photo_path) {
      await supabase.from("notes").update({ photo_path: null }).eq("id", id);
      await removeFiles(supabase, [note.photo_path]);
    }

    setSaving(false);
    onSaved();
  }

  async function remove() {
    if (!note) return;
    setSaving(true);
    const supabase = createClient();
    if (note.photo_path) await removeFiles(supabase, [note.photo_path]);
    const { error: deleteError } = await supabase.from("notes").delete().eq("id", note.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar la nota.");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="n-title">Título</label>
        <input id="n-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Medidas del salón" maxLength={80} autoFocus={!note} />
      </div>

      <div>
        <p className={label}>Etiqueta</p>
        <div className="flex flex-wrap gap-2">
          {NOTE_TAGS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTag(t.key)}
                aria-pressed={tag === t.key}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  tag === t.key ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <Icon size={14} style={{ color: colorFor(t.color) }} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="n-body">Texto</label>
        <textarea
          id="n-body"
          className={`${field} min-h-32 py-3 leading-relaxed`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"Cuadros: 40 × 40 cm\nCama: 170 × 190 cm (sábanas de esa medida)"}
          rows={6}
          maxLength={5000}
          autoFocus={!!note}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPinned((v) => !v)}
          aria-pressed={pinned}
          className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition active:scale-95 ${
            pinned ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
          }`}
        >
          <Pin size={15} /> {pinned ? "Fijada" : "Fijar arriba"}
        </button>
        <button
          type="button"
          onClick={() => setSecret((v) => !v)}
          aria-pressed={secret}
          className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition active:scale-95 ${
            secret ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
          }`}
        >
          <Lock size={15} /> {secret ? "Texto oculto" : "Ocultar texto"}
        </button>
      </div>
      {secret && <p className="-mt-2 px-1 text-xs text-ink-soft">En la lista se verá «••••» hasta que toques para mostrarlo, y el buscador no lo mira.</p>}

      <div>
        <p className={label}>Foto (opcional)</p>
        {shown ? (
          <div className="relative h-36 overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="Foto de la nota" className="size-full object-cover" />
            <button type="button" onClick={clearPhoto} aria-label="Quitar la foto" className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/55 text-white">
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ink-soft/40 text-sm text-ink-soft transition active:scale-[0.99]">
            <ImagePlus size={22} />
            Añadir una foto
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : note ? "Guardar cambios" : "Guardar nota"}
      </button>

      {note &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar la nota
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar nota
          </button>
        ))}
    </form>
  );
}
