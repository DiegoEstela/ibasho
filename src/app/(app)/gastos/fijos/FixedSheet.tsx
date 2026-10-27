"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Paperclip, Trash2, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EXPENSE_CATEGORIES } from "@/lib/gastos/categories";
import { formatEUR, parseAmount, toCents } from "@/lib/gastos/money";
import { uploadFixedFile } from "@/lib/fijos/files";
import { removeFiles, signedUrl } from "@/lib/viajes/storage";
import { amountCents, historyOf, isDueIn, monthOf, type Fixed, type FixedEntry } from "@/lib/fijos/schedule";
import { createClient } from "@/lib/supabase/client";
import type { Card, Person } from "../tarjetas/types";

type Props = {
  open: boolean;
  onClose: () => void;
  householdId: string;
  fixed: Fixed | null;
  entries: FixedEntry[];
  people: Person[];
  meId: string;
  /** Solo las de crédito: una suscripción se carga a la tarjeta. */
  cards: Card[];
  currentMonth: string;
  /** Mes que se está viendo: a él va la factura que se adjunta. */
  month: string;
  /** Se adjuntó o quitó un archivo (la hoja sigue abierta). */
  onChanged: () => void;
  onSaved: () => void;
  onDelete: (fixed: Fixed) => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

const FREQUENCIES = [
  { value: 1, label: "Cada mes" },
  { value: 2, label: "Cada 2 meses" },
  { value: 3, label: "Cada 3 meses" },
  { value: 6, label: "Cada 6 meses" },
  { value: 12, label: "Cada año" },
];

export function FixedSheet(props: Props) {
  const { open, onClose, fixed } = props;
  return (
    <BottomSheet open={open} onClose={onClose} title={fixed ? "Editar gasto fijo" : "Nuevo gasto fijo"}>
      {open && <FixedForm key={fixed?.id ?? "nuevo"} {...props} />}
    </BottomSheet>
  );
}

function FixedForm({ householdId, fixed, entries, people, meId, cards, currentMonth, month, onChanged, onSaved, onDelete }: Props) {
  const [name, setName] = useState(fixed?.name ?? "");
  const [amountText, setAmountText] = useState(fixed ? String(fixed.amount).replace(".", ",") : "");
  const [every, setEvery] = useState(fixed?.every_months ?? 1);
  const [startMonth, setStartMonth] = useState(fixed ? monthOf(fixed.start_month) : currentMonth);
  const [dueDay, setDueDay] = useState(fixed?.due_day ? String(fixed.due_day) : "");
  const [category, setCategory] = useState(fixed?.category ?? "Facturas");
  const [subscription, setSubscription] = useState(fixed?.is_subscription ?? false);
  const [cardId, setCardId] = useState(fixed?.card_id ?? "");
  const [paidBy, setPaidBy] = useState(fixed ? (fixed.paid_by ?? "") : meId);
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const supabase = createClient();
      const { error: dbError } = fixed
        ? await supabase.from("fixed_expenses").update(row).eq("id", fixed.id)
        : await supabase.from("fixed_expenses").insert({ ...row, household_id: householdId });
      if (dbError) throw new Error(dbError.message);
    },
    meta: { silent: true },
  });

  const [fileBusy, setFileBusy] = useState(false);
  const [fileNote, setFileNote] = useState("");

  const monthEntry = fixed ? entries.find((e) => e.fixed_id === fixed.id && e.month.slice(0, 7) === month) : undefined;
  const monthText = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  })();

  async function attach(file: File) {
    if (!fixed) return;
    setFileBusy(true);
    setFileNote("");
    const supabase = createClient();
    const up = await uploadFixedFile(supabase, { householdId, fixedId: fixed.id, month, file });
    if ("error" in up) {
      setFileBusy(false);
      return setFileNote(up.error);
    }
    const { error: dbError } = monthEntry
      ? await supabase.from("fixed_expense_entries").update({ file_path: up.path, file_name: up.name }).eq("id", monthEntry.id)
      : await supabase.from("fixed_expense_entries").upsert(
          { household_id: householdId, fixed_id: fixed.id, month: `${month}-01`, amount: amountCents(fixed, entries, month) / 100, file_path: up.path, file_name: up.name },
          { onConflict: "fixed_id,month" },
        );
    if (dbError) {
      await removeFiles(supabase, [up.path]);
      setFileBusy(false);
      return setFileNote("No se pudo guardar el archivo. Inténtalo de nuevo.");
    }
    if (monthEntry?.file_path) await removeFiles(supabase, [monthEntry.file_path]);
    setFileBusy(false);
    const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    setFileNote(up.after < up.before ? `Guardado: de ${kb(up.before)} a ${kb(up.after)}.` : `Guardado (${kb(up.after)}).`);
    onChanged();
  }

  async function detach(entry: { id: string; file_path?: string | null }) {
    if (!entry.file_path) return;
    const supabase = createClient();
    setFileBusy(true);
    const { error: dbError } = await supabase.from("fixed_expense_entries").update({ file_path: null, file_name: null }).eq("id", entry.id);
    if (!dbError) await removeFiles(supabase, [entry.file_path]);
    setFileBusy(false);
    setFileNote(dbError ? "No se pudo quitar el archivo." : "");
    onChanged();
  }

  async function view(path: string) {
    // Se abre la pestaña antes de esperar para que el móvil no bloquee la ventana.
    const tab = window.open("", "_blank");
    const url = await signedUrl(createClient(), path);
    if (url && tab) tab.location.href = url;
    else {
      tab?.close();
      setFileNote("No se pudo abrir el archivo.");
    }
  }

  const card = cards.find((c) => c.id === cardId);
  // Con tarjeta, paga su titular (o los dos, si es compartida); sin tarjeta hay que elegir quién.
  const payerLocked = !!card;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = amountText.trim() ? parseAmount(amountText) : 0;
    if (!name.trim()) return setError("Ponle un nombre, por ejemplo «Luz».");
    if (amount === null) return setError("El importe no es válido.");
    const day = dueDay ? Number(dueDay) : null;
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return setError("El día de cobro va de 1 a 31.");
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return setError("Elige el primer mes.");
    setError("");

    save.mutate(
      {
        name: name.trim(),
        amount,
        every_months: every,
        start_month: `${startMonth}-01`,
        due_day: day,
        category,
        is_subscription: subscription,
        card_id: cardId || null,
        paid_by: payerLocked ? (card?.owner_user_id ?? null) : paidBy || null,
      },
      { onSuccess: onSaved, onError: () => setError("No se pudo guardar. Inténtalo de nuevo.") },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-2">
      <div>
        <label className={label} htmlFor="fx-name">Nombre</label>
        <input id="fx-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Luz, agua, gimnasio, Netflix…" maxLength={80} autoFocus={!fixed} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="fx-amount">Importe habitual</label>
          <input id="fx-amount" className={field} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00 €" />
        </div>
        <div>
          <label className={label} htmlFor="fx-day">Día de cobro</label>
          <input id="fx-day" className={field} inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Opcional" />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="fx-every">Cada cuánto llega</label>
        <select id="fx-every" className={field} value={every} onChange={(e) => setEvery(Number(e.target.value))}>
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="fx-start">{every === 1 ? "Desde el mes" : "Mes en que llega la primera"}</label>
        <input id="fx-start" type="month" className={field} value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        {every > 1 && <p className="mt-1 text-xs text-ink-soft">De ahí en adelante te avisa {every === 12 ? "una vez al año" : `cada ${every} meses`}.</p>}
      </div>

      <div>
        <label className={label} htmlFor="fx-cat">Categoría</label>
        <select id="fx-cat" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-4 text-sm">
        <input type="checkbox" checked={subscription} onChange={(e) => setSubscription(e.target.checked)} className="size-5 accent-forest" />
        Es una suscripción (Netflix, gimnasio…)
      </label>

      {cards.length > 0 && (
        <div>
          <label className={label} htmlFor="fx-card">Se carga a la tarjeta</label>
          <select id="fx-card" className={field} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">Sin tarjeta</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ···· ${c.last4}` : ""}</option>
            ))}
          </select>
          {card && <p className="mt-1 text-xs text-ink-soft">Suma al total que pagas cuando cierra la tarjeta.</p>}
        </div>
      )}

      {!payerLocked && (
        <div>
          <span className={label}>Quién lo paga</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quién lo paga">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaidBy(p.id)}
                aria-pressed={paidBy === p.id}
                className={`min-h-10 rounded-full border px-4 text-sm font-medium transition ${
                  paidBy === p.id ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                }`}
              >
                {p.id === meId ? "Yo" : p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {fixed && isDueIn(fixed, month) && (
        <div>
          <span className={label}>Factura de {monthText}</span>
          {monthEntry?.file_path ? (
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm">
              <button type="button" onClick={() => view(monthEntry.file_path!)} className="flex min-w-0 flex-1 items-center gap-2 text-left font-medium text-forest">
                <Paperclip size={16} className="shrink-0" />
                <span className="truncate">{monthEntry.file_name ?? "Ver factura"}</span>
              </button>
              <button type="button" onClick={() => detach(monthEntry)} disabled={fileBusy} aria-label="Quitar archivo" className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft">
                <X size={16} />
              </button>
            </div>
          ) : (
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink-soft/40 text-sm font-medium text-ink-soft">
              <Paperclip size={16} /> {fileBusy ? "Subiendo…" : "Adjuntar PDF o foto"}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                disabled={fileBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) attach(f);
                }}
              />
            </label>
          )}
          {fileNote && <p className="mt-1 text-xs text-ink-soft" role="status">{fileNote}</p>}
          <p className="mt-1 text-xs text-ink-soft">Las fotos se reducen solas para ocupar poco.</p>
        </div>
      )}

      {fixed && historyOf(fixed.id, entries).length > 0 && (
        <div>
          <span className={label}>Lo que fue costando</span>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
            {historyOf(fixed.id, entries).slice(0, 12).map((h) => {
              const [y, m] = h.month.split("-").map(Number);
              const text = new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
              return (
                <li key={h.id} className="flex min-h-10 items-center justify-between gap-2 px-3">
                  <span className="capitalize">{text}</span>
                  <span className="flex items-center gap-2">
                    {h.file_path && (
                      <button type="button" onClick={() => view(h.file_path!)} aria-label={`Ver la factura de ${text}`} className="flex size-9 items-center justify-center text-forest">
                        <Paperclip size={16} />
                      </button>
                    )}
                    <span className="font-medium">{formatEUR(toCents(Number(h.amount)))}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-hanko">{error}</p>}

      <button
        type="submit"
        disabled={save.isPending}
        className="min-h-12 rounded-2xl bg-forest px-6 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {save.isPending ? "Guardando…" : "Guardar"}
      </button>

      {fixed && (
        <button
          type="button"
          onClick={() => onDelete(fixed)}
          className="flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-hanko"
        >
          <Trash2 size={16} /> Eliminar este gasto fijo
        </button>
      )}
    </form>
  );
}
