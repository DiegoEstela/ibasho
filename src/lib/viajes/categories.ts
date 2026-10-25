import {
  BedDouble, Camera, FileText, IdCard, Landmark, MapPin, Mountain, Plane, ShieldCheck, ShoppingBag,
  Ticket, TrainFront, TreePine, Utensils,
  type LucideIcon,
} from "lucide-react";

type Kind = { key: string; label: string; icon: LucideIcon; color: string };

/** Qué clase de sitio es un lugar guardado. El color es un token del tema. */
export const PLACE_CATEGORIES: Kind[] = [
  { key: "comer", label: "Comer", icon: Utensils, color: "terracotta" },
  { key: "museo", label: "Museos", icon: Landmark, color: "sky" },
  { key: "ver", label: "Para ver", icon: Camera, color: "sakura" },
  { key: "mirador", label: "Miradores", icon: Mountain, color: "moss" },
  { key: "naturaleza", label: "Naturaleza", icon: TreePine, color: "forest" },
  { key: "compras", label: "Compras", icon: ShoppingBag, color: "hanko" },
  { key: "alojamiento", label: "Alojamiento", icon: BedDouble, color: "sky" },
  { key: "otro", label: "Otros", icon: MapPin, color: "moss" },
];

/** Qué clase de documento es un archivo guardado. */
export const DOC_TYPES: Kind[] = [
  { key: "entrada", label: "Entradas", icon: Ticket, color: "sakura" },
  { key: "vuelo", label: "Vuelo", icon: Plane, color: "sky" },
  { key: "tren", label: "Tren y bus", icon: TrainFront, color: "terracotta" },
  { key: "alojamiento", label: "Alojamiento", icon: BedDouble, color: "moss" },
  { key: "seguro", label: "Seguro", icon: ShieldCheck, color: "forest" },
  { key: "documento", label: "Pasaporte y visa", icon: IdCard, color: "hanko" },
  { key: "otro", label: "Otro", icon: FileText, color: "moss" },
];

const find = (list: Kind[], key: string) => list.find((k) => k.key === key) ?? list[list.length - 1];
export const placeCategory = (key: string) => find(PLACE_CATEGORIES, key);
export const docType = (key: string) => find(DOC_TYPES, key);

/** Qué hay que tener listo para viajar tranquilo; cada punto se marca solo al guardar el documento correspondiente. */
export const PREPARATION = [
  { key: "transporte", label: "Transporte", hint: "Vuelo o tren", types: ["vuelo", "tren"] },
  { key: "alojamiento", label: "Alojamiento", hint: "Reserva de hotel o casa", types: ["alojamiento"] },
  { key: "seguro", label: "Seguro de viaje", hint: "Póliza", types: ["seguro"] },
  { key: "documento", label: "Pasaporte y visa", hint: "Copia a mano", types: ["documento"] },
] as const;

/** Qué puntos de la preparación están cubiertos según los tipos de documento guardados. */
export function preparationStatus(docTypes: string[]) {
  const have = new Set(docTypes);
  const items = PREPARATION.map((p) => ({ ...p, done: p.types.some((t) => have.has(t)) }));
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

/** Emojis para identificar el viaje (banderas y planes). */
export const TRIP_EMOJIS = ["🇯🇵", "🗼", "🌸", "🏝️", "🏔️", "🌋", "🚂", "✈️", "🍜", "🏕️", "🗽", "🎡", "🇪🇸", "🇮🇹", "🇫🇷", "🇵🇹", "🇲🇽", "🇦🇷", "🇨🇴", "🇨🇱"];

/** Emojis para las listas de Google Maps. */
export const LIST_EMOJIS = ["🗾", "⭐", "🍜", "⛩️", "🏯", "☕", "🍣", "🛍️", "🌸", "🏞️", "📍", "💖"];
