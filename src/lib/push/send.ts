import webpush from "web-push";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushPayload = {
  title: string;
  body: string;
  /** Ruta de la app que se abre al tocar el aviso. */
  url: string;
  /** Avisos con la misma etiqueta se reemplazan entre sí en vez de apilarse. */
  tag?: string;
};

export const PUSH_KINDS = ["compras", "gastos", "notitas", "tareas", "prueba"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export const pushConfigured = () => !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

/** Envía el aviso a cada dispositivo. Devuelve cuántos llegaron y los que ya no existen (para olvidarlos). */
export async function sendPush(targets: PushTarget[], payload: PushPayload): Promise<{ sent: number; gone: string[] }> {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hola@ibasho.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body, { TTL: 60 * 60 * 12, urgency: "normal" });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(t.endpoint);
        else console.error(`[push] no se pudo enviar (${status ?? "sin respuesta"})`);
      }
    }),
  );
  return { sent, gone };
}
