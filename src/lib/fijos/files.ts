import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, contentTypeOf, safeFileName, validateFile } from "@/lib/viajes/storage";

/** Una factura pesa poco: por encima de esto se pide un archivo más ligero. */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1600;
const QUALITY = 0.72;

/**
 * Reduce una foto: la baja a 1600 px de lado largo y la guarda como JPEG de calidad media (suele pasar de varios MB a ~200 KB).
 * Si el navegador no puede leerla (por ejemplo un HEIC) o el resultado no pesa menos, se deja la original.
 * Los PDF no se tocan.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!contentTypeOf(file).startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Fondo blanco: un PNG con transparencia se vería negro como JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Comprime (si es foto) y sube la factura de un mes. Devuelve la ruta y el nombre, o un mensaje de error. */
export async function uploadFixedFile(
  supabase: SupabaseClient,
  args: { householdId: string; fixedId: string; month: string; file: File },
): Promise<{ path: string; name: string; before: number; after: number } | { error: string }> {
  const small = await shrinkImage(args.file);
  const invalid = validateFile(small);
  if (invalid) return { error: invalid };
  if (small.size > MAX_BYTES) return { error: "El archivo pesa más de 10 MB. Prueba con uno más ligero." };

  const path = `${args.householdId}/fijos/${args.fixedId}/${args.month}-${crypto.randomUUID().slice(0, 6)}-${safeFileName(small.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, small, { contentType: contentTypeOf(small), upsert: false });
  if (error) return { error: "No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo." };
  return { path, name: small.name, before: args.file.size, after: small.size };
}
