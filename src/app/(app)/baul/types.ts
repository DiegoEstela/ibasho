export type VaultDoc = {
  id: string;
  name: string;
  category: string;
  doc_date: string | null;
  doc_time: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  created_at: string;
};

/** Carpeta y nombre del «viaje» con los que se guardan las copias sin conexión del baúl. */
export const OFFLINE_FOLDER = "baul";
export const OFFLINE_NAME = "Baúl";
