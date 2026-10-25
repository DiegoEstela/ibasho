"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm text-ink-soft transition active:scale-95"
    >
      <LogOut size={18} strokeWidth={1.75} />
      Cerrar sesión
    </button>
  );
}
