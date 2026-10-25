"use server";

import { requireHousehold } from "@/lib/household";
import { fetchHtml } from "@/lib/wishlist/network";
import { parsePreview } from "@/lib/wishlist/preview";
import { extractUrl, normalizeUrl } from "@/lib/viajes/maps";

type PreviewResult =
  | { ok: true; url: string; title: string | null; image: string | null; price: number | null }
  | { ok: false; message: string };

/** Foto, título y precio de un producto a partir del enlace de la tienda. Solo para personas con sesión. */
export async function fetchLinkPreview(raw: string): Promise<PreviewResult> {
  await requireHousehold();

  const url = normalizeUrl(extractUrl(raw) ?? raw);
  if (!url) return { ok: false, message: "Pega el enlace completo del producto." };

  const page = await fetchHtml(url);
  if (!page.ok) return { ok: false, message: page.message };

  const preview = parsePreview(page.html, page.finalUrl);
  if (!preview.title && !preview.image && preview.price === null) {
    return { ok: false, message: "No encontramos datos en esa página. Completa el producto a mano." };
  }
  return { ok: true, url, ...preview };
}
