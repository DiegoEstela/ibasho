"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import { WEEK_ORDER, firstDue, weekdayLetter, type Recurrence } from "@/lib/tareas/recurrence";
import type { Person, Task } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  people: Person[];
  meId: string;
  householdId: string;
  today: string;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";
const ANYONE = "any";

const REPEATS: { value: Recurrence; label: string }[] = [
  { value: "none", label: "No se repite" },
  { value: "daily", label: "Cada día" },
  { value: "every_n_days", label: "Cada cierto número de días" },
  { value: "weekly", label: "Ciertos días de la semana" },
  { value: "monthly", label: "Un día del mes" },
];

export function TaskSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.task ? "Editar tarea" : "Nueva tarea"}>
      {props.open && <TaskForm key={props.task?.id ?? "nueva"} {...props} />}
    </BottomSheet>
  );
}

function TaskForm({ task, people, meId, householdId, today, onSaved }: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? "none");
  const [interval, setInterval_] = useState(String(task?.interval_days ?? 3));
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays ?? []);
  const [monthDay, setMonthDay] = useState(String(task?.month_day ?? new Date().getDate()));
  const [due, setDue] = useState(task?.due_date ?? today);
  const [dueTouched, setDueTouched] = useState(!!task);
  const [time, setTime] = useState(task?.remind_time?.slice(0, 5) ?? "");
  const [assigned, setAssigned] = useState(task ? (task.assigned_to ?? ANYONE) : ANYONE);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rule = () => ({
    recurrence,
    interval_days: recurrence === "every_n_days" ? Math.max(1, Number(interval) || 1) : null,
    weekdays: recurrence === "weekly" ? weekdays : [],
    month_day: recurrence === "monthly" ? Math.min(31, Math.max(1, Number(monthDay) || 1)) : null,
  });

  /** Mientras la fecha de inicio no se haya tocado a mano, se ajusta sola a la primera vez que toca. */
  function recompute(next: { recurrence?: Recurrence; weekdays?: number[]; monthDay?: string }) {
    if (dueTouched) return;
    const r = { ...rule(), recurrence: next.recurrence ?? recurrence, weekdays: next.weekdays ?? weekdays, month_day: Number(next.monthDay ?? monthDay) || null };
    if ((r.recurrence === "weekly" && r.weekdays.length === 0) || (r.recurrence === "monthly" && !r.month_day)) return;
    setDue(firstDue(r, today));
  }

  function toggleDay(day: number) {
    const next = weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day];
    setWeekdays(next);
    recompute({ weekdays: next });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Ponle un nombre a la tarea, por ejemplo «Regar las plantas».");
    if (recurrence === "weekly" && weekdays.length === 0) return setError("Elige al menos un día de la semana.");
    if (recurrence === "every_n_days" && !(Number(interval) >= 1 && Number(interval) <= 365)) return setError("Indica cada cuántos días (de 1 a 365).");
    if (recurrence === "monthly" && !(Number(monthDay) >= 1 && Number(monthDay) <= 31)) return setError("Indica el día del mes (de 1 a 31).");
    if (!due) return setError("Elige cuándo toca la primera vez.");

    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      ...rule(),
      due_date: due,
      remind_time: time || null,
      assigned_to: assigned === ANYONE ? null : assigned,
    };

    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = task
      ? await supabase.from("tasks").update(payload).eq("id", task.id)
      : await supabase.from("tasks").insert({ ...payload, household_id: householdId });
    setSaving(false);
    if (saveError) return setError("No se pudo guardar la tarea. Inténtalo de nuevo.");
    onSaved();
  }

  async function remove() {
    if (!task) return;
    setSaving(true);
    const { error: deleteError } = await createClient().from("tasks").delete().eq("id", task.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar la tarea.");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="t-title">¿Qué hay que hacer?</label>
        <input id="t-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Regar las plantas" maxLength={80} autoFocus={!task} />
      </div>

      <div>
        <label className={label} htmlFor="t-repeat">¿Se repite?</label>
        <select
          id="t-repeat"
          className={field}
          value={recurrence}
          onChange={(e) => {
            const next = e.target.value as Recurrence;
            setRecurrence(next);
            recompute({ recurrence: next });
          }}
        >
          {REPEATS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {recurrence === "every_n_days" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-ink-soft">Cada</span>
            <input className={`${field} w-24 text-center`} inputMode="numeric" value={interval} onChange={(e) => setInterval_(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Número de días" />
            <span className="text-sm text-ink-soft">días</span>
          </div>
        )}

        {recurrence === "weekly" && (
          <div className="mt-2 flex gap-1.5" role="group" aria-label="Días de la semana">
            {WEEK_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={weekdays.includes(d)}
                aria-label={["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d]}
                className={`flex size-10 flex-1 items-center justify-center rounded-full border text-sm font-medium transition active:scale-90 ${
                  weekdays.includes(d) ? "border-forest bg-forest text-surface" : "border-line bg-surface text-ink-soft"
                }`}
              >
                {weekdayLetter(d)}
              </button>
            ))}
          </div>
        )}

        {recurrence === "monthly" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-ink-soft">El día</span>
            <input
              className={`${field} w-24 text-center`}
              inputMode="numeric"
              value={monthDay}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                setMonthDay(v);
                recompute({ monthDay: v });
              }}
              aria-label="Día del mes"
            />
            <span className="text-sm text-ink-soft">de cada mes</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="t-due">{task ? "Próxima vez" : "Empieza"}</label>
          <input
            id="t-due"
            type="date"
            className={field}
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
              setDueTouched(true);
            }}
          />
        </div>
        <div>
          <label className={label} htmlFor="t-time">Hora (opcional)</label>
          <input id="t-time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      {time && <p className="-mt-2 px-1 text-xs text-ink-soft">La hora ordena la lista y se usará para avisarte al teléfono cuando activemos las notificaciones.</p>}

      {people.length > 1 && (
        <div>
          <label className={label} htmlFor="t-who">¿Quién la hace?</label>
          <select id="t-who" className={field} value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value={ANYONE}>Cualquiera de los dos</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (tú)` : p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={label} htmlFor="t-notes">Nota (opcional)</label>
        <textarea id="t-notes" className={`${field} min-h-16 py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Medio vaso a cada una…" rows={2} maxLength={500} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : task ? "Guardar cambios" : "Crear tarea"}
      </button>

      {task &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar la tarea y su historial
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar tarea
          </button>
        ))}
    </form>
  );
}
