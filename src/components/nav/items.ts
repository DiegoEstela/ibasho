import { CookingPot, Home, MoreHorizontal, ShoppingBasket, Wallet } from "lucide-react";

export const navItems = [
  { href: "/inicio", label: "Inicio", icon: Home },
  { href: "/compras", label: "Compras", icon: ShoppingBasket },
  { href: "/cocina", label: "Cocina", icon: CookingPot },
  { href: "/gastos", label: "Gastos", icon: Wallet },
  { href: "/mas", label: "Más", icon: MoreHorizontal },
] as const;
