import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { TasksView } from "./TasksView";
import type { Completion, Person, Task } from "./types";

async function Tareas() {
  const supabase = await createClient();
  // Primer día del mes en España, para el resumen de «este mes».
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const monthStart = `${today.slice(0, 8)}01`;

  const [{ user, household }, tasks, completions, members, profiles] = await Promise.all([
    requireHousehold(),
    supabase.from("tasks").select("*").eq("active", true).order("due_date").limit(500),
    supabase.from("task_completions").select("id, task_id, done_by, done_on, tasks(title)").gte("done_on", monthStart).order("done_on", { ascending: false }).limit(2000),
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
  ]);

  const failed = [["leer las tareas", tasks.error], ["leer el historial", completions.error], ["leer los miembros del hogar", members.error]].find(([, e]) => e) as
    | [string, { code: string; message: string }]
    | undefined;
  if (failed) {
    console.error(`[tareas] ${failed[0]}: ${failed[1].code}: ${failed[1].message}`);
    return (
      <section>
        <PageHeader title="Tareas" />
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
          <p className="font-medium text-ink">No pudimos cargar las tareas.</p>
          <p className="mt-2">Paso que falló: <span className="font-mono">{failed[0]}</span></p>
          <p className="mt-1 break-words font-mono text-xs">{failed[1].code}: {failed[1].message}</p>
          <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0014 en Supabase.</p>
        </div>
      </section>
    );
  }

  const palette = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f"];
  const people: Person[] = (members.data ?? []).map((m, i) => {
    const profile = profiles.data?.find((p) => p.id === m.user_id);
    const fallback = m.user_id === user.id ? user.email.split("@")[0] : "";
    return { id: m.user_id, name: profile?.display_name || fallback || "Alguien", color: profile?.color || palette[i % palette.length] };
  });

  const done: Completion[] = (
    (completions.data ?? []) as unknown as { id: string; task_id: string; done_by: string | null; done_on: string; tasks: { title: string } | null }[]
  ).map((c) => ({ id: c.id, task_id: c.task_id, done_by: c.done_by, done_on: c.done_on, title: c.tasks?.title ?? "Tarea" }));

  return <TasksView householdId={household.id} userId={user.id} people={people} initialTasks={(tasks.data ?? []) as Task[]} initialCompletions={done} />;
}

export default function TareasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Tareas />
    </Suspense>
  );
}
