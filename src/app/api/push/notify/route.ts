import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured, PUSH_KINDS, sendPush, type PushKind } from "@/lib/push/send";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Avisa a las otras personas del hogar (o a tus propios dispositivos, en la prueba) de algo que acabas de hacer. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Los avisos no están configurados", sent: 0 }, { status: 503 });

  const input = (await request.json().catch(() => null)) as { kind?: string; to?: string | null; title?: string; body?: string; url?: string; tag?: string } | null;
  if (!input || !PUSH_KINDS.includes(input.kind as PushKind)) return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  const title = String(input.title ?? "").slice(0, 80);
  const body = String(input.body ?? "").slice(0, 160);
  // Solo rutas de la propia app.
  const url = typeof input.url === "string" && /^\/[a-z0-9/_-]*$/i.test(input.url) ? input.url : "/inicio";
  const to = input.to && UUID.test(input.to) ? input.to : null;
  if (!title) return NextResponse.json({ error: "Falta el título" }, { status: 400 });

  const kind = input.kind as PushKind;
  const { data: targets } = await supabase.rpc("push_targets", { p_kind: kind, p_to: to, p_include_self: kind === "prueba" });
  if (!targets || targets.length === 0) return NextResponse.json({ sent: 0 });

  const { sent, gone } = await sendPush(targets as { endpoint: string; p256dh: string; auth: string }[], { title, body, url, tag: input.tag?.slice(0, 40) || kind });
  await Promise.all(gone.map((endpoint) => supabase.rpc("push_forget", { p_endpoint: endpoint })));
  return NextResponse.json({ sent });
}
