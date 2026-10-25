"use server";

type RateResult = { ok: true; perEuro: number; date: string } | { ok: false; message: string };

/**
 * Cotización de una moneda respecto al euro (unidades por 1 €), del día del gasto si ya pasó, o la más reciente.
 * Usa las cotizaciones de referencia del Banco Central Europeo (servicio gratuito, sin clave).
 */
export async function fetchRate(currency: string, date: string): Promise<RateResult> {
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, message: "Moneda no válida." };
  if (currency === "EUR") return { ok: true, perEuro: 1, date };

  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "latest";
  const today = new Date().toISOString().slice(0, 10);
  const path = safeDate === "latest" || safeDate >= today ? "latest" : safeDate;

  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${path}?base=EUR&symbols=${currency}`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 422) {
      return { ok: false, message: `No hay cotización automática para ${currency}. Escribe la que te dio la casa de cambio o tu banco.` };
    }
    if (!res.ok) return { ok: false, message: "No se pudo consultar la cotización. Escríbela a mano." };

    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const perEuro = data.rates?.[currency];
    if (!perEuro || perEuro <= 0) return { ok: false, message: `No hay cotización automática para ${currency}. Escríbela a mano.` };
    return { ok: true, perEuro, date: data.date ?? safeDate };
  } catch {
    return { ok: false, message: "No se pudo consultar la cotización. Escríbela a mano." };
  }
}
