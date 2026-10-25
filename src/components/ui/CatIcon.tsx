import { createElement } from "react";
import { Package, type LucideProps } from "lucide-react";
import { ICONS } from "@/lib/compras/icons";

/** Icono de categoría por clave (ver src/lib/compras/icons.ts). */
export function CatIcon({ name, ...props }: { name: string } & LucideProps) {
  return createElement(ICONS[name] ?? Package, props);
}
