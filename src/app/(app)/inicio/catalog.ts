import {
  CookingPot, CreditCard, Gift, ListChecks, Mail, MapPin, ShoppingBasket, StickyNote, Wallet,
  type LucideIcon,
} from "lucide-react";

export type WidgetId =
  | "compras" | "cocina" | "gastos" | "tarjeta" | "viajes" | "wishlist" | "notas" | "tareas" | "mensajes";

export type WidgetDef = {
  id: WidgetId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Color del tema para el icono y el fondo. */
  color: string;
  href: string;
  /** false mientras el módulo no esté construido. */
  available: boolean;
};

export const WIDGETS: WidgetDef[] = [
  { id: "compras", label: "Compras", description: "Lo que falta en casa", icon: ShoppingBasket, color: "terracotta", href: "/compras", available: true },
  { id: "cocina", label: "Cocina", description: "Recetas guardadas", icon: CookingPot, color: "forest", href: "/cocina", available: true },
  { id: "gastos", label: "Gastos", description: "Balance entre los dos", icon: Wallet, color: "moss", href: "/gastos", available: false },
  { id: "tarjeta", label: "Tarjeta y cuotas", description: "Próximas cuotas a pagar", icon: CreditCard, color: "sky", href: "/gastos", available: false },
  { id: "viajes", label: "Viajes", description: "Tu próximo viaje", icon: MapPin, color: "sky", href: "/mas", available: false },
  { id: "wishlist", label: "Wishlist", description: "Lo que sueñan tener", icon: Gift, color: "sakura", href: "/mas", available: false },
  { id: "notas", label: "Notas", description: "Medidas y datos útiles", icon: StickyNote, color: "moss", href: "/mas", available: false },
  { id: "tareas", label: "Tareas", description: "Lo que toca hoy en casa", icon: ListChecks, color: "forest", href: "/mas", available: false },
  { id: "mensajes", label: "Mensaje del día", description: "Una notita para tu pareja", icon: Mail, color: "sakura", href: "/mas", available: false },
];

export const DEFAULT_WIDGETS: WidgetId[] = ["compras", "cocina", "gastos", "viajes"];

/** Espacios que se muestran siempre; se pueden agregar más. */
export const MIN_SLOTS = 4;

export function isWidgetId(value: string): value is WidgetId {
  return WIDGETS.some((w) => w.id === value);
}
