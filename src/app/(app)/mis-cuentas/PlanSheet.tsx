"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { parseAmount } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import type { Plan } from "@/lib/personal/types";

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

const text = (n: number | undefined) => (n ? String(n).replace(".", ",") : "");

type Props = {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  userId: string;
  /** Ahorro de hoy, en céntimos. */
  savedNow: number;
  /** Lo que hay hoy en la cuenta, en céntimos (nulo si aún no se indicó). */
  accountNow: number | null;
};

/** Tu plan: lo que cobras, lo que tienes ahorrado y lo que quieres ahorrar. Solo lo ves tú. */
export function PlanSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Mi plan">
      {props.open && <PlanForm {...props} />}
    </BottomSheet>
  );
}

function PlanForm({ onClose, plan, userId, savedNow, accountNow }: Props) {
  const [income, setIncome] = useState(text(plan?.monthly_income));
  const [payDay, setPayDay] = useState(plan?.pay_day ? String(plan.pay_day) : "");
  const [account, setAccount] = useState(accountNow == null ? "" : String(accountNow / 100).replace(".", ","));
  // Se muestra el ahorro de hoy (lo indicado más lo apartado desde entonces).
  const [savings, setSavings] = useState(text(savedNow / 100));
  const [goal, setGoal] = useState(text(plan?.monthly_saving_goal));
  const [target, setTarget] = useState(text(plan?.saving_target));
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { error: upsertError } = await createClient().from("personal_plans").upsert(row, { onConflict: "user_id" });
      if (upsertError) throw new Error(upsertError.message);
    },
    meta: { silent: true },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const num = (value: string) => (value.trim() ? parseAmount(value) : 0);
    const values = { income: num(income), savings: num(savings), goal: num(goal), target: num(target) };
    if (Object.values(values).some((v) => v == null)) return setError("Revisa los importes: usa números como 1.250,50.");
    const day = payDay.trim() ? Number(payDay) : null;
    if (day != null && (!Number.isInteger(day) || day < 1 || day > 31)) return setError("El día de cobro debe estar entre 1 y 31.");

    const accountValue = account.trim() ? parseAmount(account) : null;
    if (account.trim() && accountValue == null) return setError("Revisa lo que tienes en la cuenta: usa un número como 20,50.");
    const accountChanged = accountValue != null && Math.round(accountValue * 100) !== accountNow;

    const savingsChanged = Math.round((values.savings ?? 0) * 100) !== savedNow;
    try {
      await save.mutateAsync({
        user_id: userId,
        monthly_income: values.income,
        pay_day: day,
        monthly_saving_goal: values.goal,
        saving_target: values.target,
        updated_at: new Date().toISOString(),
        // Si cambias lo que hay en la cuenta, ese número pasa a ser el punto de partida desde hoy.
        ...(accountChanged ? { account_amount: accountValue, account_updated_at: new Date().toISOString() } : {}),
        // Si cambias el ahorro, ese número pasa a ser el punto de partida desde hoy.
        ...(savingsChanged || !plan ? { savings_amount: values.savings, savings_updated_at: new Date().toISOString() } : {}),
      });
    } catch {
      return setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    }
    onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">Estos datos son solo tuyos: tu pareja no los ve.</p>

      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div>
          <label className={label} htmlFor="p-income">Cuánto cobras al mes (€)</label>
          <input id="p-income" className={field} inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="1.800,00" autoFocus />
        </div>
        <div>
          <label className={label} htmlFor="p-day">Día de cobro</label>
          <input id="p-day" className={field} inputMode="numeric" value={payDay} onChange={(e) => setPayDay(e.target.value)} placeholder="Opcional" />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="p-account">Cuánto tienes hoy en la cuenta (€)</label>
        <input id="p-account" className={field} inputMode="decimal" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20,00" />
        <p className="mt-1 text-xs text-ink-soft">Lo que hay ahora, no lo que cobras. Se va ajustando con tus gastos, ingresos y ahorros.</p>
      </div>

      <div>
        <label className={label} htmlFor="p-savings">Caja de ahorro: cuánto tienes ahorrado (€)</label>
        <input id="p-savings" className={field} inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} placeholder="0,00" />
        <p className="mt-1 text-xs text-ink-soft">Lo que apartes desde «Nuevo movimiento → Ahorro» se suma solo.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="p-goal">Quiero ahorrar al mes (€)</label>
          <input id="p-goal" className={field} inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="300,00" />
        </div>
        <div>
          <label className={label} htmlFor="p-target">Meta total (€)</label>
          <input id="p-target" className={field} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Opcional" />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
          {error}
        </p>
      )}

      <button
        disabled={save.isPending}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {save.isPending ? "Guardando…" : "Guardar mi plan"}
      </button>
    </form>
  );
}
