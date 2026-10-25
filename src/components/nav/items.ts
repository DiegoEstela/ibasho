import {
  CookingPot, Gift, Vault, Home, ListChecks, Mail, MapPin, ShoppingBasket, StickyNote, Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false mientras el módulo no esté construido: se muestra con «Pronto» y no es un enlace. */
  available: boolean;
};

/** Todos los módulos, en el orden de la barra lateral de escritorio. */
export const navModules: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: Home, available: true },
  { href: "/compras", label: "Compras", icon: ShoppingBasket, available: true },
  { href: "/cocina", label: "Cocina", icon: CookingPot, available: true },
  { href: "/gastos", label: "Gastos", icon: Wallet, available: true },
  { href: "/notitas", label: "Notitas", icon: Mail, available: true },
  { href: "/viajes", label: "Viajes", icon: MapPin, available: true },
  { href: "/wishlist", label: "Wishlist", icon: Gift, available: true },
  { href: "/notas", label: "Notas", icon: StickyNote, available: true },
  { href: "/tareas", label: "Tareas", icon: ListChecks, available: true },
  { href: "/baul", label: "Baúl", icon: Vault, available: true },
];

/** Lo que va siempre a la vista en la barra inferior del teléfono. */
const TAB_HREFS = ["/inicio", "/compras", "/gastos", "/notitas"];

export const tabItems = navModules.filter((m) => TAB_HREFS.includes(m.href));

/** El resto de módulos, que en el teléfono viven dentro de «Más». */
export const moreItems = navModules.filter((m) => !TAB_HREFS.includes(m.href));
