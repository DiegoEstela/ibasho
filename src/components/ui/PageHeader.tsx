import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type Props = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Controles a la derecha (botones, selector de vista…). */
  actions?: React.ReactNode;
  /** Ruta a la que vuelve la flecha, si la pantalla es de segundo nivel. */
  back?: string;
};

/** Cabecera de pantalla: compacta en el teléfono (una sola línea) y grande en escritorio. */
export function PageHeader({ title, subtitle, actions, back }: Props) {
  return (
    <header className="mb-2 lg:mb-4">
      {/* En escritorio los botones quedan a la altura del título; el subtítulo va debajo. */}
      <div className="flex min-h-11 items-center justify-between gap-3 lg:min-h-0">
        <div className="flex min-w-0 items-center gap-1">
          {back && (
            <Link
              href={back}
              aria-label="Volver"
              className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft"
            >
              <ChevronLeft size={22} />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold leading-tight lg:text-3xl lg:leading-none">{title}</h1>
            {subtitle && <p className="text-xs text-ink-soft lg:hidden">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 lg:[&>button]:min-h-9! lg:[&>button]:rounded-xl! lg:[&>a]:min-h-9!">{actions}</div>}
      </div>
      {subtitle && <p className="hidden text-base text-ink-soft lg:mt-0.5 lg:block">{subtitle}</p>}
    </header>
  );
}
