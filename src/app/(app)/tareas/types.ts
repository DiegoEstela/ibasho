import type { Recurrence } from "@/lib/tareas/recurrence";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  recurrence: Recurrence;
  interval_days: number | null;
  weekdays: number[];
  month_day: number | null;
  due_date: string;
  remind_time: string | null;
  assigned_to: string | null;
  active: boolean;
};

export type Completion = {
  id: string;
  task_id: string;
  done_by: string | null;
  done_on: string;
  title: string;
};

export type Person = { id: string; name: string; color: string };

export const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatTime = (t: string | null) => (t ? t.slice(0, 5) : "");
