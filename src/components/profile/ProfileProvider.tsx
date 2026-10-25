"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";

/** Colores que se pueden elegir para identificarte en gastos, tareas y notitas. */
export const PROFILE_COLORS = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f", "#a889c9", "#d9a441"];

type ProfileContext = {
  name: string;
  color: string;
  /** Abre «Mi perfil». */
  open: () => void;
};

const Ctx = createContext<ProfileContext>({ name: "", color: PROFILE_COLORS[0], open: () => {} });
export const useProfile = () => useContext(Ctx);

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

/**
 * Tu nombre y tu color. Si tu cuenta todavía no tiene nombre (por ejemplo, si entraste con un código),
 * se te pregunta al abrir la app, para que no aparezcas como «Alguien».
 */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROFILE_COLORS[0]);
  const [loaded, setLoaded] = useState(false);
  const [requested, setRequested] = useState(false);
  const [dismissedAsk, setDismissedAsk] = useState(false);

  // Se lee tu perfil al abrir la app (no depende del servidor, así no retrasa la pantalla).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const id = session.session?.user.id;
      if (!id) return !cancelled && setLoaded(true);
      const { data } = await supabase.from("profiles").select("display_name, color").eq("id", id).maybeSingle();
      if (cancelled) return;
      setName(data?.display_name?.trim() ?? "");
      if (data?.color) setColor(data.color);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const missingName = loaded && !name;
  const show = requested || (missingName && !dismissedAsk);

  return (
    <Ctx.Provider value={{ name, color, open: () => setRequested(true) }}>
      {children}
      <BottomSheet
        open={show}
        onClose={() => {
          setRequested(false);
          setDismissedAsk(true);
        }}
        title={missingName ? "¿Cómo te llamamos?" : "Mi perfil"}
      >
        {show && (
          <ProfileForm
            initialName={name}
            initialColor={color}
            askingName={missingName}
            onSaved={(n, c) => {
              setName(n);
              setColor(c);
              setRequested(false);
              setDismissedAsk(true);
              // Los nombres que ya se dibujaron (gastos, tareas, notitas) se vuelven a pedir con el nombre nuevo.
              router.refresh();
            }}
          />
        )}
      </BottomSheet>
    </Ctx.Provider>
  );
}

function ProfileForm({
  initialName,
  initialColor,
  askingName,
  onSaved,
}: {
  initialName: string;
  initialColor: string;
  askingName: boolean;
  onSaved: (name: string, color: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = name.trim();
    if (!clean) return setError("Escribe tu nombre.");
    if (clean.length > 40) return setError("El nombre puede tener hasta 40 letras.");

    setSaving(true);
    const { error: rpcError } = await createClient().rpc("set_my_profile", { p_name: clean, p_color: color });
    setSaving(false);
    if (rpcError) return setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    onSaved(clean, color);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {askingName && (
        <p className="text-sm text-ink-soft">
          Así te verá tu pareja en los gastos, las tareas y las notitas. Si no, aparecerás como «Alguien».
        </p>
      )}

      <div className="flex items-center gap-3">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-full font-display text-2xl font-bold text-white"
          style={{ background: color }}
          aria-hidden
        >
          {(name.trim().charAt(0) || "?").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-sm font-medium text-ink-soft" htmlFor="p-name">Tu nombre</label>
          <input id="p-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Diego" maxLength={40} autoFocus />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-soft">Tu color</p>
        <div className="flex flex-wrap gap-3">
          {PROFILE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={c === color}
              className={`size-11 rounded-full border-2 transition active:scale-90 ${c === color ? "border-ink" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
