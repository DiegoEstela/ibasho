import { HeartPulse, Home, KeyRound, Plug, Ruler, StickyNote, type LucideIcon } from "lucide-react";

export type NoteTag = { key: string; label: string; icon: LucideIcon; color: string };

/** Etiquetas de las notas. El color es un token del tema. */
export const NOTE_TAGS: NoteTag[] = [
  { key: "medidas", label: "Medidas", icon: Ruler, color: "sky" },
  { key: "casa", label: "Casa", icon: Home, color: "forest" },
  { key: "electrodomesticos", label: "Electrodomésticos", icon: Plug, color: "terracotta" },
  { key: "salud", label: "Salud", icon: HeartPulse, color: "hanko" },
  { key: "claves", label: "Claves", icon: KeyRound, color: "moss" },
  { key: "otros", label: "Otros", icon: StickyNote, color: "sakura" },
];

export const noteTag = (key: string): NoteTag => NOTE_TAGS.find((t) => t.key === key) ?? NOTE_TAGS[NOTE_TAGS.length - 1];

/** Minúsculas y sin acentos, para que «electrodomesticos» encuentre «Electrodomésticos». */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * ¿La nota coincide con lo que se busca? Cada palabra debe aparecer en el título, el texto o la etiqueta.
 * El texto de una nota secreta no se busca: así no se «filtra» por el buscador lo que está oculto.
 */
export function matchesQuery(note: { title: string; body: string; tag: string; is_secret: boolean }, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(`${note.title} ${note.is_secret ? "" : note.body} ${noteTag(note.tag).label}`);
  return words.every((w) => haystack.includes(w));
}
