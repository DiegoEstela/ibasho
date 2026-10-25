import Link from "next/link";
import { CreditCard, Users } from "lucide-react";

/** Pestañas del módulo de Gastos: gastos compartidos y tarjetas con cuotas. */
export function GastosTabs({ active }: { active: "compartidos" | "tarjetas" }) {
  const tab = (href: string, key: "compartidos" | "tarjetas", label: string, Icon: typeof Users) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition lg:flex-none lg:px-5 ${
        active === key ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
      }`}
    >
      <Icon size={16} strokeWidth={1.75} /> {label}
    </Link>
  );

  return (
    <nav aria-label="Secciones de gastos" className="mb-3 flex w-full gap-1 rounded-xl bg-washi-deep p-1 lg:w-fit">
      {tab("/gastos", "compartidos", "Compartidos", Users)}
      {tab("/gastos/tarjetas", "tarjetas", "Tarjetas", CreditCard)}
    </nav>
  );
}
