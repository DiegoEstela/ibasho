import Link from "next/link";
import { CreditCard, Repeat, Users } from "lucide-react";

type Section = "compartidos" | "tarjetas" | "fijos";

/** Pestañas del módulo de Gastos: compartidos, tarjetas con cuotas y gastos fijos. */
export function GastosTabs({ active }: { active: Section }) {
  const tab = (href: string, key: Section, label: string, Icon: typeof Users) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition lg:flex-none lg:gap-2 lg:px-5 lg:text-sm ${
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
      {tab("/gastos/fijos", "fijos", "Fijos", Repeat)}
    </nav>
  );
}
