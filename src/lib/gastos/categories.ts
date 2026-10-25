export const EXPENSE_CATEGORIES = [
  { name: "Supermercado", icon: "ShoppingBasket", color: "terracotta" },
  { name: "Casa", icon: "Home", color: "forest" },
  { name: "Facturas", icon: "Receipt", color: "sky" },
  { name: "Comida fuera", icon: "Utensils", color: "hanko" },
  { name: "Transporte", icon: "Bus", color: "moss" },
  { name: "Ocio", icon: "Ticket", color: "sakura" },
  { name: "Salud", icon: "HeartPulse", color: "hanko" },
  { name: "Ropa", icon: "Shirt", color: "sakura" },
  { name: "Viajes", icon: "Plane", color: "sky" },
  { name: "Regalos", icon: "Gift", color: "terracotta" },
  { name: "Otros", icon: "Package", color: "moss" },
] as const;

const FALLBACK = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export function expenseCategory(name: string) {
  return EXPENSE_CATEGORIES.find((c) => c.name === name) ?? FALLBACK;
}
