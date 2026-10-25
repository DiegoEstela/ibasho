import { Ticket, TrainFront, CalendarCheck, HeartPulse, Home, IdCard, FileText, type LucideIcon } from "lucide-react";

export type VaultCategory = { key: string; label: string; icon: LucideIcon; color: string };

/** Qué clase de documento es. El color es un token del tema. */
export const VAULT_CATEGORIES: VaultCategory[] = [
  { key: "entrada", label: "Entradas", icon: Ticket, color: "sakura" },
  { key: "tren", label: "Tren y bus", icon: TrainFront, color: "terracotta" },
  { key: "reserva", label: "Reservas", icon: CalendarCheck, color: "sky" },
  { key: "salud", label: "Salud", icon: HeartPulse, color: "hanko" },
  { key: "hogar", label: "Hogar", icon: Home, color: "moss" },
  { key: "identidad", label: "Identidad", icon: IdCard, color: "forest" },
  { key: "otro", label: "Otros", icon: FileText, color: "moss" },
];

export const vaultCategory = (key: string) => VAULT_CATEGORIES.find((c) => c.key === key) ?? VAULT_CATEGORIES[VAULT_CATEGORIES.length - 1];
