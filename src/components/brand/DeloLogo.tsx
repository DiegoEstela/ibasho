export const CREATOR_URL = "https://diego-estela-lopez.vercel.app/";

/** Logo de Delo IA Studio (claro u oscuro según el tema del dispositivo). Pensado para ir dentro de un enlace. */
export function DeloLogo({ className = "" }: { className?: string }) {
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet="/brand/delo-ia-dark.png" />
      <img src="/brand/delo-ia-light.png" alt="Delo IA Studio" width={480} height={133} className={`block h-auto ${className}`} />
    </picture>
  );
}

/** Enlace con el logo de quien creó la app: se abre en otra pestaña. */
export function DeloLink({ className = "", logoClassName = "" }: { className?: string; logoClassName?: string }) {
  return (
    <a href={CREATOR_URL} target="_blank" rel="noopener noreferrer" aria-label="Creado por Delo IA Studio (se abre en otra pestaña)" className={className}>
      <DeloLogo className={logoClassName} />
    </a>
  );
}
