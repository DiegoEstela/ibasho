import {
  Banknote, Bus, HeartPulse, Home, Plane, Receipt, ShoppingBasket, Ticket, Utensils,
  Apple, Baby, Bath, BookOpen, Beef, Candy, Car, Cake, Cat, Coffee, Cookie, Croissant, Dog, Dumbbell,
  Flower2, Gift, Hammer, Lamp, Leaf, Milk, Package, PartyPopper, PawPrint, Pill, Pizza, Salad,
  Shirt, Snowflake, SprayCan, Star, Wheat, Wine, Wrench,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Apple, Beef, Milk, Croissant, Wheat, Wine, Snowflake, SprayCan, Bath, Package,
  PawPrint, Baby, Pill, Flower2, Wrench, Hammer, Shirt, Gift, Cookie, Coffee, Pizza, Candy,
  Cake, Salad, Lamp, BookOpen, Leaf, Cat, Dog, Car, Dumbbell, Star, PartyPopper,
  Banknote, Bus, HeartPulse, Home, Plane, Receipt, ShoppingBasket, Ticket, Utensils,
};

/** Iconos que se pueden elegir al crear una categoría propia. */
export const PICKABLE_ICONS = [
  "PawPrint", "Baby", "Pill", "Flower2", "Wrench", "Hammer", "Shirt", "Gift", "Cookie", "Coffee",
  "Pizza", "Candy", "Cake", "Salad", "Lamp", "BookOpen", "Leaf", "Cat", "Dog", "Car",
  "Dumbbell", "Star", "PartyPopper", "Package",
] as const;

/** Colores disponibles (tokens del tema, se adaptan al modo oscuro). */
export const COLORS: Record<string, string> = {
  forest: "var(--forest)",
  moss: "var(--moss)",
  sky: "var(--sky)",
  terracotta: "var(--terracotta)",
  sakura: "var(--sakura)",
  hanko: "var(--hanko)",
};

export const COLOR_KEYS = Object.keys(COLORS);

export function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? Package;
}

export function colorFor(key: string): string {
  return COLORS[key] ?? COLORS.forest;
}

/** Fondo suave de un color del tema, para los recuadros de iconos. */
export function tint(key: string, percent = 18): string {
  return `color-mix(in srgb, ${colorFor(key)} ${percent}%, transparent)`;
}
