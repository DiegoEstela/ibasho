import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./storage";

/**
 * Copias de documentos en el propio teléfono (IndexedDB), para abrirlas sin conexión.
 * La página /offline.html lee esta misma base de datos: si cambias el nombre o la estructura, cámbialo también allí.
 */
const DB_NAME = "ibasho-offline";
const STORE = "docs";
const VERSION = 1;

export type OfflineDoc = {
  id: string;
  tripId: string;
  tripName: string;
  name: string;
  docType: string;
  date: string | null;
  time: string | null;
  notes: string | null;
  mime: string;
  fileName: string | null;
  size: number;
  savedAt: string;
  blob: Blob;
};

/** Lo mínimo de un documento del viaje que se necesita para guardarlo. */
export type SavableDoc = {
  id: string;
  trip_id: string;
  name: string;
  doc_type: string;
  doc_date: string | null;
  doc_time: string | null;
  notes: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};

export const offlineSupported = () => typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!offlineSupported()) return reject(new Error("IndexedDB no disponible"));
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("tripId", "tripId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Identificadores de los documentos guardados en este teléfono. */
export async function listOfflineIds(): Promise<Set<string>> {
  try {
    return new Set((await run("readonly", (s) => s.getAllKeys())).map(String));
  } catch {
    return new Set();
  }
}

export async function getOfflineDoc(id: string): Promise<OfflineDoc | null> {
  try {
    return ((await run("readonly", (s) => s.get(id))) as OfflineDoc | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function removeOfflineDoc(id: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(id));
  } catch {
    // Si no se puede borrar, la copia solo ocupa espacio; no es un error para la persona.
  }
}

/** Quita todas las copias de un viaje (al eliminarlo). */
export async function removeOfflineTrip(tripId: string): Promise<void> {
  try {
    const keys = await run("readonly", (s) => s.index("tripId").getAllKeys(tripId));
    for (const key of keys) await run("readwrite", (s) => s.delete(key));
  } catch {
    // Ídem.
  }
}

/** Borra todas las copias: se usa al cerrar sesión, para no dejar documentos personales en un teléfono ajeno. */
export async function clearOfflineDocs(): Promise<void> {
  try {
    await run("readwrite", (s) => s.clear());
  } catch {
    // Ídem.
  }
}

/** Descarga un documento y lo guarda en el teléfono. */
export async function saveDocOffline(
  supabase: SupabaseClient,
  doc: SavableDoc,
  tripName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!offlineSupported()) return { ok: false, message: "Este navegador no permite guardar archivos sin conexión." };

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(doc.file_path);
  if (error || !blob) return { ok: false, message: "No se pudo descargar el archivo. Revisa tu conexión." };

  const entry: OfflineDoc = {
    id: doc.id,
    tripId: doc.trip_id,
    tripName,
    name: doc.name,
    docType: doc.doc_type,
    date: doc.doc_date,
    time: doc.doc_time ? doc.doc_time.slice(0, 5) : null,
    notes: doc.notes,
    mime: doc.mime_type || blob.type || "application/octet-stream",
    fileName: doc.file_name,
    size: blob.size,
    savedAt: new Date().toISOString(),
    blob,
  };

  try {
    await run("readwrite", (s) => s.put(entry));
    // Pide al navegador que no borre estos archivos por falta de espacio (si lo permite).
    void navigator.storage?.persist?.();
    return { ok: true };
  } catch {
    return { ok: false, message: "No hay espacio suficiente en el teléfono para guardar el archivo." };
  }
}
