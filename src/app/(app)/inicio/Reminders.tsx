"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Check, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { describeRecurrence, dueLabel, nextDue, type Recurrence } from "@/lib/tareas/recurrence";

export type ReminderTask = {
  id: string;
  title: string;
  recurrence: Recurrence;
  interval_days: number | null;
  weekdays: number[];
  month_day: number | null;
  due_date: string;
  remind_time: string | null;
  assigned_to: string | null;
};

type Props = {
  tasks: ReminderTask[];
  today: string;
};

/** Tareas de esta semana (y las atrasadas) que le tocan a quien mira: se tildan aquí mismo. */
export function Reminders({ tasks: initial, today }: Props) {
  const [supabase] = useState(() => createClient());
  const tasks = initial;
  // Las que se tildaron en esta visita quedan tachadas (con su id de registro) para poder deshacerlas.
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function complete(task: ReminderTask) {
    if (busy) return;
    setBusy(task.id);
    setError("");
    const next = nextDue(task, today, task.due_date);
    navigator.vibrate?.(12);
    const { data: completionId, error: rpcError } = await supabase.rpc("complete_task", {
      p_task: task.id,
      p_done_on: today,
      p_next_due: next ?? task.due_date,
      p_next_active: next !== null,
    });
    setBusy(null);
    if (rpcError || !completionId) return setError("No se pudo marcar como hecha. Revisa tu conexión.");
    setDone((prev) => ({ ...prev, [task.id]: completionId as string }));
  }

  async function undo(task: ReminderTask) {
    const completionId = done[task.id];
    if (!completionId || busy) return;
    setBusy(task.id);
    setError("");
    const { error: rpcError } = await supabase.rpc("undo_task_completion", { p_completion: completionId });
    setBusy(null);
    if (rpcError) return setError("No se pudo deshacer.");
    setDone((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== task.id)));
  }

  const pending = tasks.filter((t) => !done[t.id]).length;

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-3.5 lg:mt-6 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-bold lg:text-xl">
          <BellRing size={18} className="text-forest" strokeWidth={1.75} /> Recordatorios
        </h2>
        <Link href="/tareas" className="flex min-h-9 items-center text-sm font-medium text-forest">
          {tasks.length === 0 ? "Tareas" : pending === 0 ? "Todo hecho" : `${pending} por hacer`}
        </Link>
      </div>
      <p className="text-xs text-ink-soft">Tus tareas de esta semana</p>

      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-hanko/10 px-3 py-2 text-sm text-hanko">
          {error}
        </p>
      )}

      {tasks.length === 0 ? (
        <p className="mt-3 rounded-xl bg-background px-3 py-4 text-center text-sm text-ink-soft">
          No tienes tareas esta semana. 🌿{" "}
          <Link href="/tareas" className="font-medium text-forest">
            Crear una
          </Link>
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {tasks.map((task) => {
            const isDone = !!done[task.id];
            const late = !isDone && task.due_date < today;
            return (
              <li key={task.id} className="flex min-h-12 items-center">
                <button
                  onClick={() => (isDone ? undo(task) : complete(task))}
                  disabled={busy === task.id}
                  aria-pressed={isDone}
                  aria-label={isDone ? `Deshacer «${task.title}»` : `Marcar «${task.title}» como hecha`}
                  className="flex size-12 shrink-0 items-center justify-center disabled:opacity-60"
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded-full border-2 transition active:scale-90 ${
                      isDone ? "border-forest bg-forest text-surface" : "border-ink-soft/50"
                    }`}
                  >
                    {isDone && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
                <div className="min-w-0 flex-1 py-1.5 pr-1">
                  <p className={`truncate text-[15px] ${isDone ? "text-ink-soft line-through" : ""}`}>{task.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
                    <span className={late ? "font-medium text-hanko" : ""}>{isDone ? "Hecha" : dueLabel(task.due_date, today)}</span>
                    {task.remind_time && <span>{task.remind_time.slice(0, 5)}</span>}
                    {task.assigned_to === null && <span>De cualquiera</span>}
                    {task.recurrence !== "none" && (
                      <span className="flex items-center gap-1">
                        <Repeat size={11} /> {describeRecurrence(task)}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
