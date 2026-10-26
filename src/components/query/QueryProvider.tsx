"use client";

import { useState, useSyncExternalStore } from "react";
import { MutationCache, QueryClient, QueryClientProvider, useIsFetching, useIsMutating } from "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Mensaje que se muestra si la acción falla. */
      errorMessage?: string;
      /** La pantalla ya muestra el error por su cuenta (por ejemplo, dentro de un formulario). */
      silent?: boolean;
    };
  }
}

// Mensaje de error visible; vive fuera de React para poder mostrarlo desde la caché de acciones.
const toastListeners = new Set<() => void>();
let toastText = "";
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(text: string) {
  toastText = text;
  toastListeners.forEach((listener) => listener());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastText = "";
    toastListeners.forEach((listener) => listener());
  }, 5000);
}

function subscribeToast(callback: () => void) {
  toastListeners.add(callback);
  return () => {
    toastListeners.delete(callback);
  };
}

function makeClient() {
  const client = new QueryClient({
    defaultOptions: {
      // Los datos se consideran frescos unos segundos: al volver a una pantalla se actualizan en segundo plano.
      queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
    },
    mutationCache: new MutationCache({
      // Tras cualquier acción que cambie datos, las pantallas abiertas se actualizan y las demás al abrirlas.
      onSuccess: () => {
        void client.invalidateQueries();
      },
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.silent) return;
        const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
        showToast(`${mutation.meta?.errorMessage ?? "No se pudo completar la acción."}${detail}`);
      },
    }),
  });
  return client;
}

/**
 * Datos del servidor para toda la app (React Query).
 * - Tras cualquier acción que cambie datos (crear, editar, borrar) se vuelven a pedir los datos de las pantallas abiertas,
 *   y las que no lo están se actualizan al abrirlas: ya no hace falta recargar la web.
 * - Si una acción falla, se avisa abajo con un mensaje.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  const toast = useSyncExternalStore(subscribeToast, () => toastText, () => "");

  return (
    <QueryClientProvider client={client}>
      <ActivityBar />
      {children}
      {toast && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl bg-hanko px-4 py-3 text-center text-sm text-white shadow-lg lg:bottom-8"
        >
          {toast}
        </div>
      )}
    </QueryClientProvider>
  );
}

/** Barra fina arriba que indica que se están guardando o actualizando datos. */
function ActivityBar() {
  const busy = useIsFetching() + useIsMutating() > 0;
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300 ${busy ? "opacity-100" : "opacity-0"}`}
    >
      <div className="activity-bar h-full w-1/3 rounded-full bg-forest" />
    </div>
  );
}
