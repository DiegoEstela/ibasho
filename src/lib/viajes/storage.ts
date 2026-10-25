import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "trip-files";
export const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"];
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** Contenido que acepta el almacenamiento, deducido de la extensión si el navegador no informa el tipo. */
export function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  const ext = extensionOf(file.name);
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "application/octet-stream";
}

/** Mensaje de error si el archivo no se puede subir; null si está bien. */
export function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return "El archivo pesa más de 15 MB. Prueba con uno más ligero.";
  if (!ALLOWED_TYPES.includes(contentTypeOf(file)) && !ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
    return "Solo se pueden guardar fotos (JPG, PNG, WEBP, HEIC) y archivos PDF.";
  }
  return null;
}

/** Nombre de archivo seguro para la ruta: minúsculas, sin acentos ni espacios, conservando la extensión. */
export function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const base = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "archivo"}${ext ? `.${ext}` : ""}`;
}

/** Sube un archivo a la carpeta del hogar y del viaje. Devuelve la ruta guardada o un mensaje de error. */
export async function uploadTripFile(
  supabase: SupabaseClient,
  args: { householdId: string; tripId: string; file: File; prefix?: string },
): Promise<{ path: string } | { error: string }> {
  const { householdId, tripId, file, prefix = "" } = args;
  const invalid = validateFile(file);
  if (invalid) return { error: invalid };

  const path = `${householdId}/${tripId}/${prefix}${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: contentTypeOf(file), upsert: false });
  if (error) return { error: "No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo." };
  return { path };
}

/** Enlace temporal (5 minutos por defecto) para ver un archivo privado. */
export async function signedUrl(supabase: SupabaseClient, path: string, seconds = 300): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function removeFiles(supabase: SupabaseClient, paths: string[]) {
  const list = paths.filter(Boolean);
  if (list.length > 0) await supabase.storage.from(BUCKET).remove(list);
}

export const isImage = (mime: string | null | undefined, name?: string | null) =>
  !!mime?.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(name ?? "");
