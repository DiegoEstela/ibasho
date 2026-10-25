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

/** Fecha de hoy en el dispositivo como "aaaa-mm-dd". */
export function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
