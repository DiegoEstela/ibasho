export type Trip = {
  id: string;
  household_id: string;
  name: string;
  destination: string | null;
  emoji: string | null;
  color: string;
  start_date: string | null;
  end_date: string | null;
  cover_path: string | null;
  notes: string | null;
  /** Moneda del destino (código de 3 letras), la que se ofrece por defecto al apuntar gastos. */
  currency: string;
};

export type TripList = {
  id: string;
  trip_id: string;
  name: string;
  url: string;
  emoji: string | null;
  position: number;
};

export type TripPlace = {
  id: string;
  trip_id: string;
  name: string;
  category: string;
  maps_url: string | null;
  note: string | null;
  planned_day: string | null;
  done: boolean;
  favorite: boolean;
  created_at: string;
};

export type TripDoc = {
  id: string;
  trip_id: string;
  name: string;
  doc_type: string;
  doc_date: string | null;
  doc_time: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  created_at: string;
};

/** dd/mm/aaaa a partir de "aaaa-mm-dd". */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "10:30" a partir de "10:30:00". */
export const formatTime = (time: string | null) => (time ? time.slice(0, 5) : "");

/** Fecha de hoy en el dispositivo como "aaaa-mm-dd". */
export function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatSize(bytes: number | null) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
