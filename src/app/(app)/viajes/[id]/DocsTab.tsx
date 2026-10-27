"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, CloudOff, ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { colorFor, tint } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { DOC_TYPES, docType } from "@/lib/viajes/categories";
import { getOfflineDoc, removeOfflineDoc } from "@/lib/viajes/offline";
import { isImage, removeFiles, signedUrl } from "@/lib/viajes/storage";
import { formatDate, formatSize, formatTime, type TripDoc } from "../types";

type TabProps = {
  docs: TripDoc[];
  today: string;
  /** Documentos que ya están guardados en este teléfono para usarse sin conexión. */
  offlineIds: Set<string>;
  /** Progreso de «guardar todo» (null si no se está guardando). */
  saveProgress: { done: number; total: number; failed: number } | null;
  onSaveAll: () => void;
  onOpen: (doc: TripDoc) => void;
  onNew: () => void;
};

/** Documentos ordenados por fecha: lo más próximo primero y, al final, lo que no tiene fecha. */
const byDate = (a: TripDoc, b: TripDoc) => {
  if (!a.doc_date && !b.doc_date) return a.created_at.localeCompare(b.created_at);
  if (!a.doc_date) return 1;
  if (!b.doc_date) return -1;
  return (a.doc_date + (a.doc_time ?? "")).localeCompare(b.doc_date + (b.doc_time ?? ""));
};

export function DocsTab({ docs, today, offlineIds, saveProgress, onSaveAll, onOpen, onNew }: TabProps) {
  const [type, setType] = useState("");
  const shown = docs.filter((d) => !type || d.doc_type === type).sort(byDate);
  const pending = docs.filter((d) => !offlineIds.has(d.id)).length;

  return (
    <div>
      <button
        onClick={onNew}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-forest px-4 text-sm font-medium text-surface shadow-sm transition active:scale-[0.99] lg:w-auto lg:px-6"
      >
        <Plus size={18} /> Guardar un archivo
      </button>

      {docs.length > 0 && (
        <button
          onClick={onSaveAll}
          disabled={!!saveProgress || pending === 0}
          className={`mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition active:scale-[0.99] lg:w-auto lg:px-6 ${
            pending === 0 ? "border-forest/30 bg-forest/10 text-forest" : "border-line bg-surface text-forest"
          } disabled:cursor-default`}
        >
          {saveProgress ? (
            <>Guardando {saveProgress.done} de {saveProgress.total}…</>
          ) : pending === 0 ? (
            <><Check size={16} /> Todo guardado para usar sin conexión</>
          ) : (
            <><CloudOff size={16} /> Guardar {pending === docs.length ? "todo" : `los ${pending} que faltan`} para usar sin conexión</>
          )}
        </button>
      )}

      {docs.length > 0 && (
        <div className="mt-3 flex items-center gap-2 chip-row">
          <button
            onClick={() => setType("")}
            aria-pressed={!type}
            className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition ${!type ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"}`}
          >
            Todos · {docs.length}
          </button>
          {DOC_TYPES.filter((t) => docs.some((d) => d.doc_type === t.key)).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setType(type === t.key ? "" : t.key)}
                aria-pressed={type === t.key}
                className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  type === t.key ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                <Icon size={13} style={{ color: colorFor(t.color) }} /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🎫
          </span>
          <p className="font-display text-lg font-bold">Todo a mano, sin buscar en el correo</p>
          <p className="text-sm text-ink-soft">
            Guarda aquí las entradas del museo, los vuelos, la reserva del hotel y el seguro. Dices qué es cada cosa y quedan ordenadas por fecha.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface lg:max-w-3xl">
          {shown.map((d) => {
            const t = docType(d.doc_type);
            const Icon = t.icon;
            const isToday = d.doc_date === today;
            return (
              <li key={d.id}>
                <button onClick={() => onOpen(d)} className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left transition active:bg-washi-deep/60">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(t.color), color: colorFor(t.color) }}>
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{d.name}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      {t.label}
                      {d.doc_date && ` · ${formatDate(d.doc_date)}`}
                      {d.doc_time && ` · ${formatTime(d.doc_time)}`}
                    </span>
                  </span>
                  {offlineIds.has(d.id) && <CloudOff size={14} className="shrink-0 text-forest" aria-label="Disponible sin conexión" />}
                  {isToday && <span className="shrink-0 rounded-full bg-hanko px-2 py-0.5 text-[11px] font-bold text-white">Hoy</span>}
                  <ChevronRight size={18} className="shrink-0 text-ink-soft" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type ViewerProps = {
  doc: TripDoc | null;
  /** ¿Hay una copia de este documento en el teléfono? */
  offline: boolean;
  onSaveOffline: (doc: TripDoc) => Promise<string | null>;
  onRemoveOffline: (doc: TripDoc) => Promise<void>;
  onClose: () => void;
  onEdit: (doc: TripDoc) => void;
  onDeleted: () => void;
};

export function DocViewer(props: ViewerProps) {
  return (
    <BottomSheet open={!!props.doc} onClose={props.onClose} title={props.doc?.name ?? "Documento"}>
      {props.doc && <Viewer key={props.doc.id} {...props} doc={props.doc} />}
    </BottomSheet>
  );
}

function Viewer({ doc, offline, onSaveOffline, onRemoveOffline, onEdit, onDeleted }: ViewerProps & { doc: TripDoc }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineError, setOfflineError] = useState("");
  const t = docType(doc.doc_type);
  const Icon = t.icon;
  const image = isImage(doc.mime_type, doc.file_name);

  // El archivo es privado: con conexión se pide un enlace temporal; sin ella (o si falla) se usa la copia del teléfono.
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
    await removeFiles(supabase, [doc.file_path]);
    await removeOfflineDoc(doc.id);
    const { error } = await supabase.from("trip_documents").delete().eq("id", doc.id);
    setBusy(false);
    if (!error) onDeleted();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(t.color), color: colorFor(t.color) }}>
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <p className="min-w-0 text-sm text-ink-soft">
          <span className="font-medium text-ink">{t.label}</span>
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
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-background text-sm font-medium text-forest transition active:scale-[0.99]"
        >
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
