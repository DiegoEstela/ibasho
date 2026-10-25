/** Datos de un producto sacados de la página de una tienda (etiquetas Open Graph). */
export type LinkPreview = { title: string | null; image: string | null; price: number | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .trim();
}

/** Atributos de una etiqueta (`name="valor"`, `name='valor'` o sin comillas). */
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    result[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return result;
}

/** Precio escrito de cualquier forma («249.90», «249,90», «1.249,90») como número. */
export function parsePrice(text: string): number | null {
  let t = text.trim().replace(/[^\d.,]/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Solo se aceptan enlaces http(s); resuelve los relativos respecto a la página. */
function absolute(value: string | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(decode(value), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parsePreview(html: string, baseUrl: string): LinkPreview {
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(tag[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content);
  }

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = meta.get(k);
      if (v && decode(v)) return decode(v);
    }
    return null;
  };

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = pick("og:title", "twitter:title") ?? (titleTag ? decode(titleTag.replace(/\s+/g, " ")) : null);

  const linkImage = html.match(/<link\b[^>]*rel=["']?image_src["']?[^>]*>/i);
  const image =
    absolute(pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src") ?? undefined, baseUrl) ??
    (linkImage ? absolute(attributes(linkImage[0]).href, baseUrl) : null);

  const priceText = pick("product:price:amount", "og:price:amount", "product:sale_price:amount", "price");
  return {
    title: title ? title.slice(0, 120) : null,
    image,
    price: priceText ? parsePrice(priceText) : null,
  };
}
