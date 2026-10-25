"use client";

/** Se muestra si una pantalla de la app falla al cargar o dibujarse, en vez de dejarla en blanco. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
      <p className="font-medium text-ink">Algo salió mal al cargar esta pantalla.</p>
      <p className="mt-2 break-words font-mono text-xs">{error.message}</p>
      {error.digest && <p className="mt-1 font-mono text-xs">Código: {error.digest}</p>}
      <button
        onClick={reset}
        className="mt-4 min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface transition active:scale-95"
      >
        Reintentar
      </button>
    </div>
  );
}
