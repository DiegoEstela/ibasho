"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Download, EllipsisVertical, Maximize, Share, SquarePlus, Zap } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { BottomSheet } from "@/components/ui/BottomSheet";

/** Evento del navegador (Chrome/Edge/Android) que permite abrir el cuadro de instalación del sistema. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SEEN_KEY = "ibasho.instalar.visto";

// ---- Evento de instalación: se captura al cargar, porque el navegador lo dispara una sola vez ----
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

// ---- «Ya vio el aviso»: solo es una comodidad del navegador ----
let seenInMemory = false;
const getSeen = () => {
  if (seenInMemory) return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
function markSeen() {
  seenInMemory = true;
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Ignorar.
  }
  emit();
}

// ---- Detección del dispositivo ----
const subscribeMedia = (query: string) => (callback: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

const standaloneQuery = "(display-mode: standalone)";
const getStandalone = () =>
  window.matchMedia(standaloneQuery).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const mobileQuery = "(max-width: 1023px)";

const getIsIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

type InstallContext = {
  /** La app ya se abrió como app instalada: no hay nada que ofrecer. */
  installed: boolean;
  /** El navegador permite abrir el cuadro de instalación con un toque (Android, Chrome de escritorio). */
  canPrompt: boolean;
  /** Abre el aviso de instalación. */
  open: () => void;
};

const Ctx = createContext<InstallContext>({ installed: true, canPrompt: false, open: () => {} });

export const useInstall = () => useContext(Ctx);

/** Ofrece instalar la app: un aviso la primera vez en el teléfono y una opción permanente en el menú. */
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const installed = useSyncExternalStore(subscribeMedia(standaloneQuery), getStandalone, () => true);
  const mobile = useSyncExternalStore(subscribeMedia(mobileQuery), () => window.matchMedia(mobileQuery).matches, () => false);
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const ios = useSyncExternalStore(() => () => {}, getIsIos, () => false);
  const seen = useSyncExternalStore(subscribe, getSeen, () => true);

  const [requested, setRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // El aviso automático espera un momento para no chocar con la pantalla de bienvenida ni con una notita nueva.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 3500);
    return () => clearTimeout(t);
  }, []);

  const show = !installed && (requested || (ready && mobile && !seen));

  const close = useCallback(() => {
    markSeen();
    setRequested(false);
  }, []);

  async function install() {
    if (!deferred) return;
    setBusy(true);
    const event = deferred;
    await event.prompt();
    await event.userChoice;
    deferred = null;
    setBusy(false);
    close();
  }

  const mode: "prompt" | "ios" | "manual" = canPrompt ? "prompt" : ios ? "ios" : "manual";

  return (
    <Ctx.Provider value={{ installed, canPrompt, open: () => setRequested(true) }}>
      {children}

      <BottomSheet open={show} onClose={close} title="Instala Ibasho">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size={72} />
          <div>
            <p className="font-display text-xl font-bold">Ibasho, como una app en tu teléfono</p>
            <p className="mt-1 text-sm text-ink-soft">Ábrela desde tu pantalla de inicio, sin buscarla en el navegador.</p>
          </div>

          <ul className="flex w-full flex-col gap-2 text-left text-sm">
            {[
              [Zap, "Se abre al instante, con un toque"],
              [Maximize, "A pantalla completa, sin la barra del navegador"],
              [Download, "Sigue funcionando aunque se corte la conexión un momento"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Zap;
              return (
                <li key={text as string} className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5">
                  <I size={18} strokeWidth={1.75} className="shrink-0 text-forest" />
                  {text as string}
                </li>
              );
            })}
          </ul>

          {mode === "prompt" && (
            <button
              onClick={install}
              disabled={busy}
              className="min-h-12 w-full rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
            >
              {busy ? "Abriendo…" : "Instalar la app"}
            </button>
          )}

          {mode === "ios" && (
            <ol className="flex w-full flex-col gap-2 text-left text-sm">
              <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest/15 text-xs font-bold text-forest">1</span>
                <span>
                  Toca el botón <span className="inline-flex translate-y-0.5 items-center"><Share size={16} className="text-forest" /></span>{" "}
                  <span className="font-medium">Compartir</span>, abajo en Safari.
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest/15 text-xs font-bold text-forest">2</span>
                <span>
                  Elige <span className="inline-flex translate-y-0.5 items-center"><SquarePlus size={16} className="text-forest" /></span>{" "}
                  <span className="font-medium">Añadir a pantalla de inicio</span> y confirma.
                </span>
              </li>
              <li className="px-1 text-xs text-ink-soft">Si no ves esa opción, abre esta página en Safari.</li>
            </ol>
          )}

          {mode === "manual" && (
            <div className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface px-3 py-3 text-left text-sm">
              <EllipsisVertical size={18} className="mt-0.5 shrink-0 text-forest" />
              <span>
                Abre el menú de tu navegador y elige <span className="font-medium">«Instalar aplicación»</span> o{" "}
                <span className="font-medium">«Añadir a pantalla de inicio»</span>.
              </span>
            </div>
          )}

          <button onClick={close} className="min-h-11 text-sm text-ink-soft">
            {mode === "prompt" ? "Ahora no" : "Entendido"}
          </button>
        </div>
      </BottomSheet>
    </Ctx.Provider>
  );
}
