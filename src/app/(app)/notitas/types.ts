export type Note = {
  id: string;
  household_id: string;
  from_user: string;
  /** Nulo = para todas las demás personas del hogar. */
  to_user: string | null;
  body: string;
  paper: string;
  sticker: string | null;
  deliver_on: string;
  /** Hora de entrega ("10:30:00"); nula = desde el comienzo del día. */
  deliver_time: string | null;
  created_at: string;
};

export type NoteRead = { message_id: string; user_id: string; read_at: string };
export type NoteReaction = { message_id: string; user_id: string; emoji: string };
export type Person = { id: string; name: string; color: string };

export const MAX_LENGTH = 600;

/** dd/mm/aaaa a partir de "aaaa-mm-dd". */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Suma días a una fecha "aaaa-mm-dd" sin pasar por zonas horarias. */
export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** "10:30" a partir de "10:30:00". */
export const shortTime = (time: string | null) => (time ? time.slice(0, 5) : "");

/** Fecha y hora de entrega legibles: «12/12/2027 · 10:30» (la hora solo si se eligió una). */
export const whenLabel = (date: string, time: string | null) => `${formatDate(date)}${time ? ` · ${shortTime(time)}` : ""}`;

/** ¿Una notita aún no llegó a su día y hora? */
export function isScheduled(note: { deliver_on: string; deliver_time: string | null }, today: string, nowTime: string) {
  return note.deliver_on > today || (note.deliver_on === today && !!note.deliver_time && shortTime(note.deliver_time) > nowTime);
}

/** Fecha y hora de ahora en el dispositivo. */
export function nowParts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** Fecha de hoy en el dispositivo como "aaaa-mm-dd". */
export function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
