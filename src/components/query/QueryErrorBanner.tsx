import { RefreshCw } from "lucide-react";

/** Aviso cuando no se pudieron actualizar los datos de una pantalla; lo que se ve es lo último que se cargó. */
export function QueryErrorBanner({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
      <span>No se pudieron actualizar los datos. Estás viendo lo último que se cargó.</span>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 font-medium disabled:opacity-60"
      >
        <RefreshCw size={15} className={retrying ? "animate-spin" : ""} /> Reintentar
      </button>
    </div>
  );
}
