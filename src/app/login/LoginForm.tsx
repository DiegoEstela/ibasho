"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "magic";

const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "El correo o la contraseña no son correctos.";
  if (m.includes("already registered")) return "Ya existe una cuenta con ese correo. Prueba a iniciar sesión.";
  if (m.includes("not confirmed")) return "Confirma tu correo antes de entrar: te enviamos un enlace.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  if (m.includes("password")) return "La contraseña debe tener al menos 6 caracteres.";
  return "No pudimos completarlo. Inténtalo de nuevo.";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/inicio";

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    params.get("error") ? { type: "error", text: "El enlace no es válido o ha caducado." } : null,
  );

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  function switchMode(m: Mode) {
    setMode(m);
    setMessage(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        setMessage({ type: "ok", text: "Listo. Te enviamos un enlace: ábrelo desde tu correo para entrar." });
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo(), data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage({ type: "ok", text: "Cuenta creada. Confirma tu correo con el enlace que te enviamos." });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: friendlyError(err instanceof Error ? err.message : "") });
    } finally {
      setLoading(false);
    }
  }

  const tab = (m: "login" | "signup", label: string) => (
    <button
      type="button"
      onClick={() => switchMode(m)}
      className={`min-h-11 flex-1 rounded-lg text-sm font-medium transition ${
        mode === m ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {mode === "magic" ? (
        <div>
          <h1 className="font-display text-xl font-bold">Entrar con un enlace</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Te enviamos un enlace al correo y entras con un toque, sin contraseña.
          </p>
        </div>
      ) : (
        <div className="flex gap-1 rounded-xl bg-washi-deep p-1">
          {tab("login", "Iniciar sesión")}
          {tab("signup", "Crear cuenta")}
        </div>
      )}

      {mode === "signup" && (
        <input
          className={inputClass}
          type="text"
          placeholder="Tu nombre"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      )}

      <input
        className={inputClass}
        type="email"
        placeholder="Correo electrónico"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      {mode !== "magic" && (
        <input
          className={inputClass}
          type="password"
          placeholder={mode === "signup" ? "Contraseña (mínimo 6 caracteres)" : "Contraseña"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      )}

      {message && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            message.type === "ok" ? "bg-moss/20 text-forest" : "bg-hanko/10 text-hanko"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {loading
          ? "Un momento…"
          : mode === "magic"
            ? "Enviarme el enlace"
            : mode === "signup"
              ? "Crear cuenta"
              : "Entrar"}
      </button>

      <button
        type="button"
        onClick={() => switchMode(mode === "magic" ? "login" : "magic")}
        className="min-h-11 text-sm text-ink-soft underline-offset-4 hover:underline"
      >
        {mode === "magic" ? "Prefiero usar contraseña" : "Prefiero entrar con un enlace por email"}
      </button>
    </form>
  );
}
