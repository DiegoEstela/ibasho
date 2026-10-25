import { createClient } from "@/lib/supabase/client";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const urlBase64ToBytes = (value: string) => {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  // El service worker solo se registra en producción; esperar sin límite colgaría la pantalla.
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? null;
}

/** Cómo está este dispositivo respecto a los avisos. */
export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    // En iPhone, los avisos solo existen cuando la app está instalada en la pantalla de inicio.
    return typeof window !== "undefined" && isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "unsupported";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** Pide permiso y registra este dispositivo. Devuelve un mensaje si algo falla. */
export async function enablePush(): Promise<string | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "No diste permiso para los avisos. Puedes activarlo en los ajustes del navegador.";

  const reg = await registration();
  if (!reg) return "La app todavía no está lista para avisos. Recarga la página e inténtalo de nuevo.";

  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) }));
    const json = sub.toJSON();
    const { error } = await createClient().rpc("push_subscribe", {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? "",
      p_auth: json.keys?.auth ?? "",
      p_user_agent: navigator.userAgent,
    });
    if (error) {
      await sub.unsubscribe();
      return "No se pudieron activar los avisos. Inténtalo de nuevo.";
    }
    return null;
  } catch {
    return "Este navegador no pudo activar los avisos.";
  }
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await createClient().rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** Avisa a tu pareja de algo que acabas de hacer. Si falla, no pasa nada: el cambio ya está guardado. */
export function notifyPartner(input: { kind: "compras" | "gastos" | "notitas"; title: string; body: string; url: string; to?: string | null; tag?: string }) {
  fetch("/api/push/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {});
}

/** Envía un aviso de prueba a tus propios dispositivos. */
export async function sendTestPush(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "prueba", title: "Ibasho", body: "¡Los avisos funcionan! 🌿", url: "/inicio" }),
    });
    if (res.status === 503) return "Faltan las claves de los avisos en el servidor.";
    const data = (await res.json()) as { sent?: number };
    return res.ok && data.sent ? null : "No llegó el aviso. Desactiva los avisos y vuelve a activarlos.";
  } catch {
    return "No se pudo enviar. Revisa tu conexión.";
  }
}
