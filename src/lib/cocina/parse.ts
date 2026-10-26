export type ParsedIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

const UNITS = [
  "kg", "g", "mg", "l", "ml", "cl", "dl",
  "ud", "uds", "unidad", "unidades",
  "cda", "cdas", "cucharada", "cucharadas",
  "cdta", "cdtas", "cucharadita", "cucharaditas",
  "taza", "tazas", "vaso", "vasos",
  "pizca", "pizcas", "diente", "dientes",
  "loncha", "lonchas", "rama", "ramas", "hoja", "hojas", "lata", "latas", "paquete", "paquetes",
];

export function toNumber(raw: string): number | null {
  const text = raw.replace(",", ".").trim();
  if (text.includes("/")) {
    const [a, b] = text.split("/").map(Number);
    return b ? a / b : null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Interpreta una línea tipo "200 g de arroz" o "2 dientes de ajo". */
export function parseIngredient(line: string): ParsedIngredient | null {
  const text = line.trim();
  if (!text) return null;

  const match = text.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*([a-zA-ZñÑ]+)?\s+(?:de\s+)?(.+)$/);
  if (!match) return { name: text, quantity: null, unit: null };

  const quantity = toNumber(match[1].replace(/\s/g, ""));
  const maybeUnit = match[2]?.toLowerCase();

  if (maybeUnit && UNITS.includes(maybeUnit)) {
    return { name: match[3].trim(), quantity, unit: maybeUnit };
  }
  // Sin unidad reconocida: "2 huevos" → cantidad 2, nombre "huevos"
  const rest = [match[2], match[3]].filter(Boolean).join(" ").trim();
  return { name: rest, quantity, unit: null };
}

export function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity == null) return "";
  const rounded = Math.round(quantity * 100) / 100;
  return [String(rounded).replace(".", ","), unit].filter(Boolean).join(" ");
}
