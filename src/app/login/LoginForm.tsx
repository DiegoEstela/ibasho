"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Method = "magic" | "password";

const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/inicio";

  const [method, setMethod] = useState<Method>("magic");
  const [signUp, setSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    params.get("error") ? { type: "error", text: "El enlace no es válido o ha caducado." } : null,
  );

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    try {
      if (method === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo(),
            data: name ? { display_name: name } : undefined,
          },
        });
        if (error) throw error;
        setMessage({ type: "ok", text: "Te hemos enviado un enlace. Revisa tu correo." });
        return;
      }

      if (signUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo(), data: { display_name: name } },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage({ type: "ok", text: "Cuenta creada. Confirma tu correo para entrar." });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Ha ocurrido un error.";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }

  const tab = (m: Method, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMethod(m);
        setMessage(null);
      }}
      className={`min-h-11 flex-1 rounded-lg text-sm font-medium transition ${
        method === m ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <div className="flex gap-1 rounded-xl bg-washi-deep p-1">
        {tab("magic", "Enlace por email")}
        {tab("password", "Contraseña")}
      </div>

      {(signUp || method === "magic") && (
        <input
          className={inputClass}
          type="text"
          placeholder={method === "magic" ? "Tu nombre (si es la primera vez)" : "Tu nombre"}
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required={signUp && method === "password"}
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

      {method === "password" && (
        <input
          className={inputClass}
          type="password"
          placeholder="Contraseña"
          autoComplete={signUp ? "new-password" : "current-password"}
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
        className="min-h-11 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {loading
          ? "Un momento…"
          : method === "magic"
            ? "Enviarme el enlace"
            : signUp
              ? "Crear cuenta"
              : "Entrar"}
      </button>

      {method === "password" && (
        <button
          type="button"
          onClick={() => setSignUp((v) => !v)}
          className="min-h-11 text-sm text-ink-soft underline-offset-4 hover:underline"
        >
          {signUp ? "Ya tengo cuenta" : "Crear una cuenta nueva"}
        </button>
      )}
    </form>
  );
}
