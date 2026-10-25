"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

/** Pone o cambia la contraseña de la cuenta con la que ya entraste (por el enlace del correo o desde la app). */
export function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (password !== repeat) return setError("Las dos contraseñas no coinciden.");

    setSaving(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      const same = updateError.message.toLowerCase().includes("different");
      return setError(same ? "Elige una contraseña distinta de la anterior." : "No se pudo guardar. Abre de nuevo el enlace del correo e inténtalo otra vez.");
    }
    router.replace("/inicio");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-4">
      <input className={inputClass} type="password" placeholder="Contraseña nueva (mínimo 6 caracteres)" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      <input className={inputClass} type="password" placeholder="Repite la contraseña" autoComplete="new-password" minLength={6} value={repeat} onChange={(e) => setRepeat(e.target.value)} required />

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar contraseña"}
      </button>
      <button type="button" onClick={() => router.back()} className="min-h-11 text-sm text-ink-soft">
        Ahora no
      </button>
    </form>
  );
}
