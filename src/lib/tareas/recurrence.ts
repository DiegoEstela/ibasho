import { addDays, daysBetween } from "@/lib/viajes/dates";

export type Recurrence = "none" | "daily" | "every_n_days" | "weekly" | "monthly";

export type RecurrenceRule = {
  recurrence: Recurrence;
  interval_days: number | null;
  /** 0 = domingo … 6 = sábado. */
  weekdays: number[];
  month_day: number | null;
};

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month: 1-12

const pad = (n: number) => String(n).padStart(2, "0");
const clampedDay = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;

/** Primera fecha desde `from` (inclusive) que cae en uno de los días de la semana. */
function firstWeekdayOnOrAfter(from: string, weekdays: number[]): string {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (weekdays.includes(weekdayOf(d))) return d;
  }
  return from;
}

/** Primera fecha desde `from` (inclusive) que cae en el día del mes indicado (ajustado en meses cortos). */
function firstMonthDayOnOrAfter(from: string, monthDay: number): string {
  const [y, m] = from.split("-").map(Number);
  const here = clampedDay(y, m, monthDay);
  if (here >= from) return here;
  return m === 12 ? clampedDay(y + 1, 1, monthDay) : clampedDay(y, m + 1, monthDay);
}

/** Cuándo toca la primera vez, empezando a contar desde `from` (normalmente, hoy). */
export function firstDue(rule: RecurrenceRule, from: string): string {
  if (rule.recurrence === "weekly") return firstWeekdayOnOrAfter(from, rule.weekdays);
  if (rule.recurrence === "monthly" && rule.month_day) return firstMonthDayOnOrAfter(from, rule.month_day);
  return from;
}

/**
 * Qué pasa al hacer una tarea: la fecha de la próxima vez, o null si no se repite (queda hecha para siempre).
 * Se cuenta desde el día en que se hizo, pero nunca antes de la fecha en que tocaba: hacerla pronto no adelanta el calendario.
 */
export function nextDue(rule: RecurrenceRule, doneOn: string, dueDate: string): string | null {
  const base = doneOn > dueDate ? doneOn : dueDate;
  switch (rule.recurrence) {
    case "none":
      return null;
    case "daily":
      return addDays(base, 1);
    case "every_n_days":
      return addDays(base, Math.max(1, rule.interval_days ?? 1));
    case "weekly":
      return firstWeekdayOnOrAfter(addDays(base, 1), rule.weekdays);
    case "monthly":
      return rule.month_day ? firstMonthDayOnOrAfter(addDays(base, 1), rule.month_day) : null;
  }
}

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** Orden de los días en pantalla: empieza el lunes. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const weekdayLetter = (d: number) => ["D", "L", "M", "X", "J", "V", "S"][d];

/** «Cada semana: lun y jue», «Cada 3 días», «El día 15 de cada mes»… */
export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.recurrence) {
    case "none":
      return "No se repite";
    case "daily":
      return "Cada día";
    case "every_n_days":
      return rule.interval_days === 1 ? "Cada día" : `Cada ${rule.interval_days} días`;
    case "weekly": {
      const days = WEEK_ORDER.filter((d) => rule.weekdays.includes(d)).map((d) => WEEKDAY_SHORT[d]);
      return days.length === 7 ? "Cada día" : `Cada semana: ${days.length > 1 ? `${days.slice(0, -1).join(", ")} y ${days[days.length - 1]}` : days[0]}`;
    }
    case "monthly":
      return `El día ${rule.month_day} de cada mes`;
  }
}

/** «Hoy», «Mañana», «Atrasada 2 días», «En 3 días» o la fecha. */
export function dueLabel(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Atrasada 1 día";
  if (diff < 0) return `Atrasada ${-diff} días`;
  if (diff < 7) return `En ${diff} días`;
  const [, m, d] = due.split("-");
  return `${d}/${m}`;
}
