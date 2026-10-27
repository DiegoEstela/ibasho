"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Plus, Repeat } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";
import { addDays, dayLabel } from "@/lib/viajes/dates";
import { describeRecurrence, dueLabel, nextDue } from "@/lib/tareas/recurrence";
import { TaskSheet } from "./TaskSheet";
import { formatTime, todayISO, type Completion, type Person, type Task } from "./types";

type Props = {
  householdId: string;
  userId: string;
  people: Person[];
  initialTasks: Task[];
  initialCompletions: Completion[];
};

type Tab = "hoy" | "proximos" | "todas";
type Toast = { text: string; undo?: () => void };

// Pétalos que caen al completar una tarea (se desactivan con «reducir movimiento»).
const PETALS = Array.from({ length: 12 }, (_, i) => ({ left: 4 + i * 8, delay: (i % 4) * 0.12, dur: 1.5 + (i % 3) * 0.35, drift: (i % 2 ? 1 : -1) * (20 + (i % 5) * 10) }));

export function TasksView({ householdId, userId, people, initialTasks, initialCompletions }: Props) {
  const [supabase] = useState(() => createClient());
  const [today] = useState(todayISO);

  const [tasks, setTasks] = useState(initialTasks);
  const [completions, setCompletions] = useState(initialCompletions);
  const [tab, setTab] = useState<Tab>("hoy");
  const [who, setWho] = useState<"" | "mias" | string>("");
  const [sheet, setSheet] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [toast, setToast] = useState<Toast | null>(null);
  const [burst, setBurst] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const partners = people.filter((p) => p.id !== userId);
  const nameOf = useCallback(
    (id: string | null) => (id === null ? "Cualquiera" : id === userId ? "Tú" : (people.find((p) => p.id === id)?.name ?? "Alguien")),
    [people, userId],
  );

  // ---------- Sincronización ----------
  const refetch = useCallback(async () => {
    const monthStart = `${today.slice(0, 8)}01`;
    const [t, c] = await Promise.all([
      supabase.from("tasks").select("*").eq("active", true).order("due_date").limit(500),
      supabase.from("task_completions").select("id, task_id, done_by, done_on, tasks(title)").gte("done_on", monthStart).order("done_on", { ascending: false }).limit(2000),
    ]);
    if (t.data) setTasks(t.data as Task[]);
    if (c.data) {
      setCompletions(
        (c.data as unknown as { id: string; task_id: string; done_by: string | null; done_on: string; tasks: { title: string } | null }[]).map((x) => ({
          id: x.id,
          task_id: x.task_id,
          done_by: x.done_by,
          done_on: x.done_on,
          title: x.tasks?.title ?? "Tarea",
        })),
      );
    }
  }, [supabase, today]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`tareas-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_completions", filter }, queue)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [supabase, householdId, refetch]);

  // ---------- Datos derivados ----------
  /** Una tarea «de cualquiera» aparece para todos; una asignada, solo para su persona (o al ver «todas»). */
  const visibleFor = useCallback(
    (t: Task) => {
      if (!who) return true;
      const target = who === "mias" ? userId : who;
      return t.assigned_to === null || t.assigned_to === target;
    },
    [who, userId],
  );

  const byTimeThenTitle = (a: Task, b: Task) => (a.remind_time ?? "99:99").localeCompare(b.remind_time ?? "99:99") || a.title.localeCompare(b.title);

  const due = useMemo(() => tasks.filter((t) => t.due_date <= today && visibleFor(t)), [tasks, today, visibleFor]);
  const overdue = due.filter((t) => t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date) || byTimeThenTitle(a, b));
  const dueToday = due.filter((t) => t.due_date === today).sort(byTimeThenTitle);

  const horizon = addDays(today, 14);
  const upcoming = useMemo(() => tasks.filter((t) => t.due_date > today && t.due_date <= horizon && visibleFor(t)).sort((a, b) => a.due_date.localeCompare(b.due_date) || byTimeThenTitle(a, b)), [tasks, today, horizon, visibleFor]);
  const later = useMemo(() => tasks.filter((t) => t.due_date > horizon && visibleFor(t)).sort((a, b) => a.due_date.localeCompare(b.due_date)), [tasks, horizon, visibleFor]);
  const upcomingByDay = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const t of upcoming) groups.set(t.due_date, [...(groups.get(t.due_date) ?? []), t]);
    return [...groups.entries()];
  }, [upcoming]);

  const all = useMemo(() => tasks.filter(visibleFor).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title)), [tasks, visibleFor]);

  // Resumen amistoso del mes
  const monthStats = useMemo(() => {
    const perPerson = new Map<string, { count: number; titles: Map<string, number> }>();
    for (const c of completions) {
      const key = c.done_by ?? "";
      const entry = perPerson.get(key) ?? { count: 0, titles: new Map() };
      entry.count++;
      entry.titles.set(c.title, (entry.titles.get(c.title) ?? 0) + 1);
      perPerson.set(key, entry);
    }
    return [...perPerson.entries()]
      .map(([id, v]) => ({ id, count: v.count, top: [...v.titles.entries()].sort((a, b) => b[1] - a[1])[0] }))
      .sort((a, b) => b.count - a.count);
  }, [completions]);
  const totalDone = completions.length;

  // ---------- Acciones ----------
  function flash(next: Toast) {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function complete(task: Task) {
    const next = nextDue(task, today, task.due_date);
    const snapshot = task;
    setTasks((prev) => (next ? prev.map((t) => (t.id === task.id ? { ...t, due_date: next } : t)) : prev.filter((t) => t.id !== task.id)));
    navigator.vibrate?.(12);
    setBurst((n) => n + 1);

    const { data: completionId, error } = await supabase.rpc("complete_task", {
      p_task: task.id,
      p_done_on: today,
      p_next_due: next ?? task.due_date,
      p_next_active: next !== null,
    });
    if (error || !completionId) {
      setTasks((prev) => (prev.some((t) => t.id === snapshot.id) ? prev.map((t) => (t.id === snapshot.id ? snapshot : t)) : [snapshot, ...prev]));
      return flash({ text: "No se pudo marcar como hecha. Revisa tu conexión." });
    }

    setCompletions((prev) => [{ id: completionId as string, task_id: task.id, done_by: userId, done_on: today, title: task.title }, ...prev]);
    flash({
      text: next ? `¡Hecha! La próxima vez: ${dueLabel(next, today).toLowerCase()}` : "¡Hecha! 🌱",
      undo: async () => {
        setToast(null);
        const { error: undoError } = await supabase.rpc("undo_task_completion", { p_completion: completionId });
        if (undoError) return flash({ text: "No se pudo deshacer." });
        setTasks((prev) => (prev.some((t) => t.id === snapshot.id) ? prev.map((t) => (t.id === snapshot.id ? snapshot : t)) : [snapshot, ...prev]));
        setCompletions((prev) => prev.filter((c) => c.id !== completionId));
      },
    });
  }

  // ---------- Piezas ----------
  const row = (task: Task, opts: { check: boolean }) => {
    const late = task.due_date < today;
    return (
      <li key={task.id} className="flex min-h-14 items-center">
        {opts.check ? (
          <button onClick={() => complete(task)} aria-label={`Marcar «${task.title}» como hecha`} className="flex size-12 shrink-0 items-center justify-center">
            <span className="size-6 rounded-full border-2 border-ink-soft/50 transition active:scale-90" />
          </button>
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center text-ink-soft">
            <CalendarDays size={18} />
          </span>
        )}
        <button onClick={() => setSheet({ open: true, task })} className="min-w-0 flex-1 py-1.5 pr-3 text-left" aria-label={`Editar «${task.title}»`}>
          <span className="block truncate text-[15px]">{task.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
            <span className={late ? "font-medium text-hanko" : ""}>{dueLabel(task.due_date, today)}</span>
            {task.remind_time && <span>{formatTime(task.remind_time)}</span>}
            {task.recurrence !== "none" && (
              <span className="flex items-center gap-1">
                <Repeat size={11} /> {describeRecurrence(task)}
              </span>
            )}
            {people.length > 1 && <span>· {task.assigned_to === null ? "De cualquiera" : `Para ${nameOf(task.assigned_to)}`}</span>}
          </span>
        </button>
      </li>
    );
  };

  const list = (items: Task[], check: boolean) => (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{items.map((t) => row(t, { check }))}</ul>
  );

  const section = (title: React.ReactNode, items: Task[], check = true, tone = "text-ink-soft") =>
    items.length > 0 && (
      <div>
        <h2 className={`mb-1.5 px-2 text-xs font-medium uppercase tracking-wider ${tone}`}>{title}</h2>
        {list(items, check)}
      </div>
    );

  const summary = (
    <div className="rounded-2xl border border-line bg-surface p-4 lg:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Este mes en casa</p>
      {totalDone === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Aún no hay tareas hechas este mes. Cuando las vayan completando, aquí se verá quién hizo qué.</p>
      ) : (
        <>
          <p className="mt-1 font-display text-2xl font-bold">
            {totalDone} {totalDone === 1 ? "tarea hecha" : "tareas hechas"}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {monthStats.map((s) => {
              const person = people.find((p) => p.id === s.id);
              return (
                <li key={s.id || "nadie"} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: person?.color ?? "var(--moss)" }} />
                      {nameOf(s.id || null) === "Cualquiera" ? "Alguien" : nameOf(s.id)}
                    </span>
                    <span className="font-medium">{s.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-washi-deep">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / totalDone) * 100}%`, background: person?.color ?? "var(--moss)" }} />
                  </div>
                  {s.top && (
                    <p className="mt-1 text-xs text-ink-soft">
                      Lo que más hace: {s.top[0].toLowerCase()} ({s.top[1]} {s.top[1] === 1 ? "vez" : "veces"}) 🌱
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );

  const tabs: [Tab, string, number][] = [
    ["hoy", "Hoy", overdue.length + dueToday.length],
    ["proximos", "Próximos días", upcoming.length],
    ["todas", "Todas", all.length],
  ];

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Tareas"
        subtitle={tasks.length === 0 ? "Lo de casa, entre los dos" : `${overdue.length + dueToday.length} para hoy`}
        actions={
          <button
            onClick={() => setSheet({ open: true, task: null })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> Tarea
          </button>
        }
      />

      {tasks.length === 0 ? (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center lg:mt-10">
          <span className="text-5xl" aria-hidden>
            🪴
          </span>
          <p className="font-display text-xl font-bold">Que nada se quede sin hacer</p>
          <p className="text-sm text-ink-soft">
            Regar las plantas, sacar la basura, cambiar las sábanas… Pueden repetirse cada día, cada semana o cada mes, y se asignan a quien le toque.
          </p>
          <button
            onClick={() => setSheet({ open: true, task: null })}
            className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95"
          >
            Crear la primera tarea
          </button>
        </div>
      ) : (
        <>
          <div className="flex w-full gap-1 rounded-xl bg-washi-deep p-1 lg:w-fit" role="tablist" aria-label="Vistas">
            {tabs.map(([value, text, count]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition lg:flex-none lg:px-6 ${
                  tab === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
                }`}
              >
                {text}
                {count > 0 && <span className="rounded-full bg-forest/15 px-2 text-xs text-forest">{count}</span>}
              </button>
            ))}
          </div>

          {partners.length > 0 && (
            <div className="mt-3 flex items-center gap-2 chip-row" role="group" aria-label="Ver las tareas de">
              {[{ id: "", label: "Todas" }, { id: "mias", label: "Mías" }, ...partners.map((p) => ({ id: p.id, label: p.name }))].map((opt) => (
                <button
                  key={opt.id || "todas"}
                  onClick={() => setWho(opt.id)}
                  aria-pressed={who === opt.id}
                  className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition ${
                    who === opt.id ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-8">
            <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
              {tab === "hoy" &&
                (overdue.length + dueToday.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
                    <span className="text-4xl" aria-hidden>
                      🌿
                    </span>
                    <p className="mt-2 font-display text-lg font-bold">Todo hecho por hoy</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {upcoming.length > 0 ? `Lo siguiente: ${upcoming[0].title.toLowerCase()} (${dueLabel(upcoming[0].due_date, today).toLowerCase()}).` : "No hay nada pendiente."}
                    </p>
                  </div>
                ) : (
                  <>
                    {section("Atrasadas", overdue, true, "text-hanko")}
                    {section("Para hoy", dueToday)}
                  </>
                ))}

              {tab === "proximos" &&
                (upcoming.length === 0 && later.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No hay tareas en los próximos días.</p>
                ) : (
                  <>
                    {upcomingByDay.map(([day, items]) => section(day === addDays(today, 1) ? `Mañana · ${dayLabel(day)}` : dayLabel(day), items, false))}
                    {section("Más adelante", later, false)}
                  </>
                ))}

              {tab === "todas" && (all.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No hay tareas para este filtro.</p> : list(all, false))}
            </div>

            <div className="lg:col-start-2 lg:row-start-1 lg:self-start">{summary}</div>
          </div>
        </>
      )}

      {/* Pétalos al completar una tarea */}
      {burst > 0 && (
        <div key={burst} aria-hidden className="pointer-events-none fixed inset-0 z-[45] overflow-hidden">
          {PETALS.map((p, i) => (
            <span
              key={i}
              className="petal-once absolute top-0 size-3 rounded-[100%_0_100%_0] bg-sakura"
              style={{ left: `${p.left}%`, ["--delay" as string]: `${p.delay}s`, ["--dur" as string]: `${p.dur}s`, ["--drift" as string]: `${p.drift}px` }}
            />
          ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-background shadow-lg lg:bottom-8"
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={toast.undo} className="min-h-9 shrink-0 font-medium text-sakura">
              Deshacer
            </button>
          )}
        </div>
      )}

      <TaskSheet
        open={sheet.open}
        onClose={() => setSheet({ open: false, task: null })}
        task={sheet.task}
        people={people}
        meId={userId}
        householdId={householdId}
        today={today}
        onSaved={() => {
          setSheet({ open: false, task: null });
          refetch();
        }}
      />
    </section>
  );
}
