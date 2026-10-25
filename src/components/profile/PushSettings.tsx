"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from "@/lib/push/client";

const KINDS = [
  { key: "compras", label: "Lista de compras", hint: "Cuando tu pareja agrega algo" },
  { key: "gastos", label: "Gastos", hint: "Cuando se anota un gasto nuevo" },
  { key: "notitas", label: "Notitas", hint: "Cuando te dejan o te llega una" },
  { key: "tareas", label: "Tareas", hint: "A la hora de cada recordatorio" },
];

/** Activar los avisos en este teléfono y elegir de qué quieres enterarte. */
export function PushSettings() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [off, setOff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const id = session.session?.user.id;
      const [current, prefs] = await Promise.all([pushState(), id ? supabase.from("profiles").select("push_off").eq("id", id).maybeSingle() : null]);
      if (cancelled) return;
      setState(current);
      setOff(((prefs?.data as { push_off?: string[] } | null)?.push_off) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleDevice() {
    setBusy(true);
    setMessage("");
    if (state === "on") {
      await disablePush();
    } else {
      const problem = await enablePush();
      if (problem) setMessage(problem);
    }
    setState(await pushState());
    setBusy(false);
  }

  async function toggleKind(key: string) {
    const previous = off;
    const next = off.includes(key) ? off.filter((k) => k !== key) : [...off, key];
    setOff(next);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase.from("profiles").update({ push_off: next }).eq("id", session.session?.user.id ?? "");
    if (error) {
      setOff(previous);
      setMessage("No se pudo guardar. Inténtalo de nuevo.");
    }
  }

  async function test() {
    setBusy(true);
    setMessage((await sendTestPush()) ?? "Te enviamos un aviso de prueba.");
    setBusy(false);
  }

  if (state === "loading") return null;

  return (
    <div className="border-t border-line pt-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft">
        <BellRing size={16} /> Avisos al teléfono
      </p>

      {state === "unsupported" && <p className="text-sm text-ink-soft">Este navegador no permite avisos. Prueba con la app instalada o con otro navegador.</p>}
      {state === "needs-install" && (
        <p className="text-sm text-ink-soft">En iPhone los avisos funcionan cuando Ibasho está instalada en la pantalla de inicio. Instálala desde «Compartir → Agregar a pantalla de inicio» y ábrela desde ahí.</p>
      )}
      {state === "denied" && <p className="text-sm text-ink-soft">Bloqueaste los avisos para Ibasho. Para activarlos, permite las notificaciones en los ajustes del navegador o de la app.</p>}

      {(state === "on" || state === "off") && (
        <>
          <button
            type="button"
            onClick={toggleDevice}
            disabled={busy}
            className={`flex min-h-11 w-full items-center justify-center rounded-2xl text-sm font-medium transition active:scale-95 disabled:opacity-60 ${
              state === "on" ? "border border-forest/30 bg-forest/10 text-forest" : "bg-forest text-surface shadow-sm"
            }`}
          >
            {state === "on" ? "Avisos activados en este teléfono · Desactivar" : "Activar avisos en este teléfono"}
          </button>

          {state === "on" && (
            <>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {KINDS.map((k) => {
                  const on = !off.includes(k.key);
                  return (
                    <li key={k.key}>
                      <button type="button" onClick={() => toggleKind(k.key)} role="switch" aria-checked={on} className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{k.label}</span>
                          <span className="block text-xs text-ink-soft">{k.hint}</span>
                        </span>
                        <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-forest" : "bg-ink-soft/30"}`}>
                          <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" onClick={test} disabled={busy} className="mt-2 min-h-10 w-full text-sm font-medium text-forest disabled:opacity-60">
                Enviarme un aviso de prueba
              </button>
            </>
          )}
        </>
      )}

      {message && <p role="status" className="mt-2 rounded-xl bg-background px-3 py-2.5 text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
