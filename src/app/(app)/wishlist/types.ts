export type Wishlist = { id: string; name: string; emoji: string | null; position: number };

export type WishItem = {
  id: string;
  wishlist_id: string;
  title: string;
  url: string | null;
  image_url: string | null;
  price: number | null;
  priority: 1 | 2 | 3;
  owner_user_id: string | null;
  note: string | null;
  status: "deseado" | "comprado";
  purchased_at: string | null;
  created_at: string;
};

export type Person = { id: string; name: string; color: string };

export const PRIORITIES = [
  { value: 1, label: "Me encantaría", hearts: 3 },
  { value: 2, label: "Me gustaría", hearts: 2 },
  { value: 3, label: "Algún día", hearts: 1 },
] as const;

export const SUGGESTED_LISTS = [
  { name: "Casa", emoji: "🏠" },
  { name: "Regalos", emoji: "🎁" },
  { name: "Tecnología", emoji: "💻" },
];

export const LIST_EMOJIS = ["🏠", "🎁", "💻", "👗", "📚", "🍳", "🌿", "🎮", "✈️", "🛋️", "💄", "⭐"];

/** Nombre del sitio de una tienda a partir del enlace («www.amazon.es» → «amazon.es»). */
export function siteName(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
