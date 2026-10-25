/** Papeles de las notitas: siempre claros, con tinta oscura, como un papel de verdad (también en modo oscuro). */
export const PAPERS = [
  { key: "crema", label: "Crema", color: "#fbf3df", tape: "#f2b8c6" },
  { key: "sakura", label: "Sakura", color: "#fbe1e7", tape: "#fff3f5" },
  { key: "otono", label: "Otoño", color: "#f7dcc6", tape: "#e7a982" },
  { key: "cielo", label: "Cielo", color: "#dcecf4", tape: "#fbf3df" },
  { key: "musgo", label: "Musgo", color: "#e2ecd3", tape: "#f7dcc6" },
] as const;

export type PaperKey = (typeof PAPERS)[number]["key"];

export function paperOf(key: string) {
  return PAPERS.find((p) => p.key === key) ?? PAPERS[0];
}

export const STICKERS = ["🌸", "❤️", "☀️", "🌙", "🍵", "⭐", "🐱", "🍙", "✨", "🌈"] as const;

export const REACTIONS = ["❤️", "😊", "🥹", "😘", "🌸", "🤗"] as const;

/** Inclinación estable (entre -1,4° y 1,4°) según el id: cada notita queda "pegada" distinta, pero siempre igual. */
export function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 29) - 14) / 10;
}
