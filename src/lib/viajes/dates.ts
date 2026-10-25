/** Fechas como "aaaa-mm-dd" (texto) y cálculo en UTC, para evitar errores de zona horaria y de cambio de hora. */

const MS_DAY = 86_400_000;
const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Días entre dos fechas (positivo si `b` es posterior a `a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / MS_DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * MS_DAY).toISOString().slice(0, 10);
}

export type TripPhase = {
  kind: "sin-fechas" | "proximo" | "en-curso" | "terminado";
  /** Frase para la insignia de cuenta atrás. */
  label: string;
};

/** En qué momento está un viaje respecto a hoy, con una frase con carácter. */
export function tripPhase(start: string | null, end: string | null, today: string): TripPhase {
  if (!start) return { kind: "sin-fechas", label: "Sin fechas aún" };

  const untilStart = daysBetween(today, start);
  if (untilStart > 0) {
    if (untilStart === 1) return { kind: "proximo", label: "Mañana 🎒" };
    if (untilStart < 7) return { kind: "proximo", label: `Faltan ${untilStart} días 🎒` };
    return { kind: "proximo", label: `Faltan ${untilStart} días ✈️` };
  }

  // Ya empezó: sin fecha de fin se considera en curso; con fecha, hasta ese día inclusive.
  const ended = end !== null && daysBetween(end, today) > 0;
  if (ended) return { kind: "terminado", label: "Terminado" };

  const dayNumber = daysBetween(start, today) + 1;
  if (dayNumber === 1) return { kind: "en-curso", label: "¡Hoy se viaja! 🌸" };
  const total = end ? daysBetween(start, end) + 1 : null;
  return { kind: "en-curso", label: total ? `Día ${dayNumber} de ${total}` : `Día ${dayNumber}` };
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** "2 – 16 abr 2027", "28 mar – 4 abr 2027" o "30 dic 2026 – 5 ene 2027". */
export function formatRange(start: string | null, end: string | null): string {
  if (!start) return "Fechas por definir";
  const [sy, sm, sd] = start.split("-").map(Number);
  if (!end || end === start) return `${sd} ${MONTHS[sm - 1]} ${sy}`;
  const [ey, em, ed] = end.split("-").map(Number);
  if (sy !== ey) return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  if (sm !== em) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  return `${sd} – ${ed} ${MONTHS[em - 1]} ${ey}`;
}

/** Todos los días del viaje, de inicio a fin (para el plan por días). Máximo 60 para no generar listas enormes. */
export function tripDays(start: string | null, end: string | null): string[] {
  if (!start || !end || end < start) return [];
  const n = Math.min(daysBetween(start, end) + 1, 60);
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "lunes 5 abr" */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(toUtc(iso)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]}`;
}
