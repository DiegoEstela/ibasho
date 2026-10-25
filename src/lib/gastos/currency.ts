/** Monedas más comunes para viajar. La primera de cada país es la que se ofrece con el viaje. */
export const CURRENCIES = [
  { code: "EUR", name: "Euro" },
  { code: "JPY", name: "Yen japonés" },
  { code: "USD", name: "Dólar estadounidense" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "ARS", name: "Peso argentino" },
  { code: "COP", name: "Peso colombiano" },
  { code: "CLP", name: "Peso chileno" },
  { code: "BRL", name: "Real brasileño" },
  { code: "CHF", name: "Franco suizo" },
  { code: "CAD", name: "Dólar canadiense" },
  { code: "AUD", name: "Dólar australiano" },
  { code: "CNY", name: "Yuan chino" },
  { code: "KRW", name: "Won surcoreano" },
  { code: "THB", name: "Baht tailandés" },
  { code: "TRY", name: "Lira turca" },
] as const;

export const currencyName = (code: string) => CURRENCIES.find((c) => c.code === code)?.name ?? code;

/** Importe con el formato de su moneda: «12.000 ¥», «45,50 $». Sin decimales en monedas que no los usan. */
export function formatMoney(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${amount.toLocaleString("es-ES")} ${code}`;
  }
}

/**
 * Pasa un importe en otra moneda a céntimos de euro.
 * `perEuro` son las unidades de esa moneda que equivalen a 1 euro (por ejemplo, 175,51 yenes).
 */
export function toEuroCents(original: number, perEuro: number): number {
  if (!Number.isFinite(original) || !Number.isFinite(perEuro) || perEuro <= 0) return 0;
  return Math.round((original / perEuro) * 100);
}

/** Lee una cotización escrita a mano («175,51» o «1.234,5»). Devuelve null si no es válida. */
export function parseRate(text: string): number | null {
  let t = text.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}
