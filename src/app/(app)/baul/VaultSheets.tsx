"use client";

import { useEffect, useState } from "react";
import { Camera, Check, CloudOff, ExternalLink, FileText, FileUp, Paperclip, Pencil, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { colorFor, tint } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { VAULT_CATEGORIES, vaultCategory } from "@/lib/baul/categories";
import { getOfflineDoc, removeOfflineDoc } from "@/lib/viajes/offline";
import { contentTypeOf, isImage, removeFiles, signedUrl, uploadTripFile, validateFile } from "@/lib/viajes/storage";
import { formatDate, formatSize, formatTime } from "../viajes/types";
import { OFFLINE_FOLDER, type VaultDoc } from "./types";

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

/** «entradas-cine_final.pdf» → «Entradas cine final» */
const nameFromFile = (file: string) => {
  const base = file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
};

/* ---------- Formulario: guardar o editar ---------- */

type FormProps = {
  open: boolean;
  onClose: () => void;
  doc: VaultDoc | null;
  householdId: string;
  onSaved: () => void;
};

export function VaultForm(props: FormProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.doc ? "Editar documento" : "Guardar en el baúl"}>
      {props.open && <Form key={props.doc?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function Form({ doc, householdId, onSaved }: FormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(doc?.name ?? "");
  const [category, setCategory] = useState(doc?.category ?? "entrada");
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
    if (!name.trim()) return setError("Ponle un nombre, por ejemplo «Entradas del cine».");
    if (time && !date) return setError("Para poner una hora, elige también la fecha.");

    const meta = { name: name.trim(), category, doc_date: date || null, doc_time: time || null, notes: notes.trim() || null };
    setSaving(true);
    const supabase = createClient();

    if (doc) {
      const { error: updateError } = await supabase.from("vault_documents").update(meta).eq("id", doc.id);
      setSaving(false);
      if (updateError) return setError("No se pudo guardar. Inténtalo de nuevo.");
      return onSaved();
    }

    const uploaded = await uploadTripFile(supabase, { householdId, tripId: OFFLINE_FOLDER, file: file! });
    if ("error" in uploaded) {
      setSaving(false);
      return setError(uploaded.error);
    }
    const { error: insertError } = await supabase.from("vault_documents").insert({
      ...meta,
      household_id: householdId,
      file_path: uploaded.path,
      file_name: file!.name,
      mime_type: contentTypeOf(file!),
      size_bytes: file!.size,
    });
    if (insertError) {
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
          {VAULT_CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                aria-pressed={c.key === category}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  c.key === category ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <Icon size={14} style={{ color: colorFor(c.color) }} /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="v-name">Nombre</label>
        <input id="v-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tren a Valencia · sábado" maxLength={100} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="v-date">Fecha (opcional)</label>
          <input id="v-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="v-time">Hora (opcional)</label>
          <input id="v-time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="v-notes">Notas</label>
        <textarea id="v-notes" className={`${field} min-h-16 py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Asiento, sala, código de reserva…" rows={2} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? (doc ? "Guardando…" : "Subiendo…") : doc ? "Guardar cambios" : "Guardar en el baúl"}
      </button>
    </form>
  );
}

/* ---------- Visor ---------- */

type ViewerProps = {
  doc: VaultDoc | null;
  offline: boolean;
  onSaveOffline: (doc: VaultDoc) => Promise<string | null>;
  onRemoveOffline: (doc: VaultDoc) => Promise<void>;
  onClose: () => void;
  onEdit: (doc: VaultDoc) => void;
  onDeleted: () => void;
};

export function VaultViewer(props: ViewerProps) {
  return (
    <BottomSheet open={!!props.doc} onClose={props.onClose} title={props.doc?.name ?? "Documento"}>
      {props.doc && <Viewer key={props.doc.id} {...props} doc={props.doc} />}
    </BottomSheet>
  );
}

function Viewer({ doc, offline, onSaveOffline, onRemoveOffline, onEdit, onDeleted }: ViewerProps & { doc: VaultDoc }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineError, setOfflineError] = useState("");
  const c = vaultCategory(doc.category);
  const Icon = c.icon;
  const image = isImage(doc.mime_type, doc.file_name);

  // Archivo privado: con conexión, enlace temporal; sin ella (o si falla), la copia guardada en el teléfono.
  useEffect(() => {
    let cancelled = false;
    let localUrl: string | null = null;
    (async () => {
      const online = typeof navigator === "undefined" || navigator.onLine;
      const remote = online ? await signedUrl(createClient(), doc.file_path, 600) : null;
      if (cancelled) return;
      if (remote) return setUrl(remote);
      const local = await getOfflineDoc(doc.id);
      if (cancelled) return;
      if (local) {
        localUrl = URL.createObjectURL(local.blob);
        return setUrl(localUrl);
      }
      setFailed(true);
    })();
    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [doc.file_path, doc.id]);

  async function toggleOffline() {
    setOfflineBusy(true);
    setOfflineError("");
    if (offline) await onRemoveOffline(doc);
    else {
      const problem = await onSaveOffline(doc);
      if (problem) setOfflineError(problem);
    }
    setOfflineBusy(false);
  }

  async function remove() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("vault_documents").delete().eq("id", doc.id);
    if (error) return setBusy(false);
    await removeFiles(supabase, [doc.file_path]);
    await removeOfflineDoc(doc.id);
    setBusy(false);
    onDeleted();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(c.color), color: colorFor(c.color) }}>
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <p className="min-w-0 text-sm text-ink-soft">
          <span className="font-medium text-ink">{c.label}</span>
          {doc.doc_date && ` · ${formatDate(doc.doc_date)}`}
          {doc.doc_time && ` · ${formatTime(doc.doc_time)}`}
          {doc.size_bytes ? ` · ${formatSize(doc.size_bytes)}` : ""}
        </p>
      </div>

      {doc.notes && <p className="rounded-xl bg-background px-3.5 py-2.5 text-sm text-ink-soft">{doc.notes}</p>}

      {failed ? (
        <p className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">No se pudo abrir el archivo. Revisa tu conexión e inténtalo de nuevo.</p>
      ) : !url ? (
        <div className="h-40 animate-pulse rounded-2xl bg-washi-deep" aria-label="Cargando el archivo" />
      ) : image ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl bg-washi-deep">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={doc.name} className="mx-auto max-h-[52dvh] w-auto object-contain" />
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-background text-sm font-medium text-forest transition active:scale-[0.99]">
          <FileText size={28} strokeWidth={1.5} /> Abrir el PDF <ExternalLink size={14} />
        </a>
      )}

      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-forest text-sm font-medium text-surface shadow-sm transition active:scale-95">
          <ExternalLink size={16} /> {image ? "Ver a pantalla completa" : "Abrir o descargar"}
        </a>
      )}

      <button
        onClick={toggleOffline}
        disabled={offlineBusy}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-sm font-medium transition active:scale-95 disabled:opacity-60 ${
          offline ? "border-forest/30 bg-forest/10 text-forest" : "border-line bg-surface text-ink"
        }`}
      >
        {offline ? <Check size={16} /> : <CloudOff size={16} />}
        {offlineBusy ? "Un momento…" : offline ? "Guardado sin conexión · Quitar" : "Guardar para usar sin conexión"}
      </button>
      {offlineError && <p role="alert" className="-mt-2 rounded-xl bg-hanko/10 px-3 py-2.5 text-sm text-hanko">{offlineError}</p>}

      <div className="flex gap-2">
        <button onClick={() => onEdit(doc)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium text-forest transition active:scale-95">
          <Pencil size={15} /> Editar
        </button>
        {confirmDelete ? (
          <button onClick={remove} disabled={busy} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-hanko/10 text-sm font-medium text-hanko transition active:scale-95">
            <Trash2 size={15} /> Sí, eliminar
          </button>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium text-hanko transition active:scale-95">
            <Trash2 size={15} /> Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
