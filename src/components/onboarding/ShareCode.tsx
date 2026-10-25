"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

/** Muestra el código de invitación y permite copiarlo o compartirlo. */
export function ShareCode({ code, householdName }: { code: string; householdName: string }) {
  const [copied, setCopied] = useState(false);

  const message = () =>
    `Únete a "${householdName}" en Ibasho. Entra en ${window.location.origin}, crea tu cuenta y elige "Tengo un código": ${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el código sigue visible para copiarlo a mano.
    }
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ text: message() });
      else await navigator.clipboard.writeText(message());
    } catch {
      // El usuario canceló el menú de compartir.
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="w-full rounded-2xl border border-line bg-surface px-4 py-6 text-center">
        <p className="text-sm text-ink-soft">Código de invitación</p>
        <p className="mt-2 font-display text-4xl font-bold tracking-[0.3em] text-forest">{code}</p>
      </div>
      <div className="flex w-full gap-3">
        <button
          onClick={copy}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium transition active:scale-95"
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        <button
          onClick={share}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium transition active:scale-95"
        >
          <Share2 size={18} /> Compartir
        </button>
      </div>
    </div>
  );
}
