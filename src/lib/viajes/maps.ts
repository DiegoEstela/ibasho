/** Primer enlace http(s) dentro de un texto (por ejemplo, lo que se copia al compartir desde Google Maps). */
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[.,;)]+$/, "") : null;
}

/** Acepta un enlace con o sin «https://» y devuelve una URL válida, o null si no lo es. */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const candidate = extractUrl(text) ?? (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(text) ? `https://${text}` : null);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** ¿El enlace es de Google Maps (incluidos los enlaces cortos de «Compartir»)? */
export function isGoogleMaps(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "maps.app.goo.gl" || host === "goo.gl" || host.endsWith("google.com") || host.endsWith("google.es") || host === "g.co";
  } catch {
    return false;
  }
}

/** Búsqueda en Google Maps de un lugar, para los que no tienen enlace propio. */
export function mapsSearchUrl(name: string, destination?: string | null): string {
  const query = [name, destination].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
