import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { pushConfigured, sendPush, type PushTarget } from "@/lib/push/send";

type Sub = PushTarget & { user_id: string; household_id: string };

/** Hora y día de hoy en España. */
function madridNow() {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(new Date()).split(" ");
  return { today: parts[0], time: parts[1] };
}

/**
 * Lo llama un programador cada minuto (ver supabase/push_cron.sql): avisa de las notitas programadas que ya llegaron
 * y de las tareas con hora de recordatorio. Necesita la clave de servicio, porque actúa sobre todo el hogar.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey || !pushConfigured()) return NextResponse.json({ error: "No configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const { today, time } = madridNow();

  const [{ data: subs }, { data: profiles }] = await Promise.all([
    db.from("push_subscriptions").select("endpoint, p256dh, auth, user_id, household_id"),
    db.from("profiles").select("id, display_name, push_off"),
  ]);
  const allSubs = (subs ?? []) as Sub[];
  const profile = new Map((profiles ?? []).map((p) => [p.id as string, p as { id: string; display_name: string | null; push_off: string[] }]));
  const forgotten = new Set<string>();

  async function notify(userIds: string[], kind: string, payload: { title: string; body: string; url: string; tag: string }) {
    const targets = allSubs.filter((s) => userIds.includes(s.user_id) && !profile.get(s.user_id)?.push_off?.includes(kind));
    if (targets.length === 0) return 0;
    const { sent, gone } = await sendPush(targets, payload);
    gone.forEach((g) => forgotten.add(g));
    return sent;
  }

  const membersOf = (householdId: string) => allSubs.filter((s) => s.household_id === householdId).map((s) => s.user_id);

  // ---- Notitas programadas que ya llegaron ----
  let notes = 0;
  const { data: dueNotes } = await db
    .from("daily_messages")
    .select("id, household_id, from_user, to_user")
    .is("pushed_at", null)
    .or(`deliver_on.lt.${today},and(deliver_on.eq.${today},or(deliver_time.is.null,deliver_time.lte.${time}))`)
    .limit(100);
  for (const n of dueNotes ?? []) {
    // Se marca primero: si dos ejecuciones coinciden, solo una consigue la notita.
    const { data: claimed } = await db.from("daily_messages").update({ pushed_at: new Date().toISOString() }).eq("id", n.id).is("pushed_at", null).select("id");
    if (!claimed?.length) continue;
    const recipients = n.to_user ? [n.to_user as string] : [...new Set(membersOf(n.household_id as string))].filter((u) => u !== n.from_user);
    const from = profile.get(n.from_user as string)?.display_name || "Tu pareja";
    notes += await notify(recipients, "notitas", { title: "Tienes una notita 💌", body: `${from} te dejó algo. Ábrela cuando quieras.`, url: "/notitas", tag: `notita-${n.id}` });
  }

  // ---- Tareas con hora de recordatorio ----
  let tasks = 0;
  const { data: dueTasks } = await db
    .from("tasks")
    .select("id, household_id, title, assigned_to, due_date, reminded_for")
    .eq("active", true)
    .eq("due_date", today)
    .not("remind_time", "is", null)
    .lte("remind_time", time)
    .limit(200);
  for (const t of (dueTasks ?? []).filter((x) => x.reminded_for !== x.due_date)) {
    const { data: claimed } = await db.from("tasks").update({ reminded_for: t.due_date }).eq("id", t.id).or(`reminded_for.is.null,reminded_for.neq.${t.due_date}`).select("id");
    if (!claimed?.length) continue;
    const recipients = t.assigned_to ? [t.assigned_to as string] : [...new Set(membersOf(t.household_id as string))];
    tasks += await notify(recipients, "tareas", { title: "Recordatorio", body: String(t.title), url: "/tareas", tag: `tarea-${t.id}` });
  }

  if (forgotten.size > 0) await db.from("push_subscriptions").delete().in("endpoint", [...forgotten]);
  return NextResponse.json({ notes, tasks });
}
