"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearOfflineDocs } from "@/lib/viajes/offline";

type Props = {
  /** "row" se integra en listas y menús; "button" es un botón con borde. */
  variant?: "button" | "row";
};

export function SignOutButton({ variant = "button" }: Props) {
  const router = useRouter();

  async function signOut() {
    // Las copias de documentos del viaje no se quedan en el teléfono cuando se cierra sesión.
    await clearOfflineDocs();
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className={
        variant === "row"
          ? "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-soft transition hover:bg-washi-deep hover:text-ink"
          : "flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm text-ink-soft transition active:scale-95"
      }
    >
      <LogOut size={variant === "row" ? 20 : 18} strokeWidth={1.75} />
      Cerrar sesión
    </button>
  );
}
