import Link from "next/link";
import { ChevronRight, Lock, PiggyBank } from "lucide-react";

/**
 * Acceso fijo a «Mis cuentas»: vive solo en Inicio y no se puede quitar.
 * Es privado, así que no muestra ningún dato: cualquiera que mire la pantalla solo ve el botón.
 */
export function CuentasButton() {
  return (
    <Link
      href="/mis-cuentas"
      className="mt-3 flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition active:scale-[0.99] lg:mt-4 lg:min-h-20 lg:gap-4 lg:rounded-3xl lg:p-5"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest/15 text-forest lg:size-12 lg:rounded-2xl">
        <PiggyBank size={24} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-base font-bold lg:text-lg">Mis cuentas</span>
        <span className="flex items-center gap-1 text-sm text-ink-soft">
          <Lock size={12} /> Solo lo ves tú
        </span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-ink-soft" />
    </Link>
  );
}
