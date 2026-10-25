"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { NoteCard } from "@/components/notitas/NoteCard";
import { PAPERS, STICKERS } from "@/lib/notitas/papers";
import { createClient } from "@/lib/supabase/client";
import { addDaysISO, formatDate, MAX_LENGTH, type Note, type Person } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Notita que se edita; null para escribir una nueva. */
  note: Note | null;
  householdId: string;
  meName: string;
  /** Las demás personas del hogar (a quien se le puede escribir). */
  partners: Person[];
  today: string;
  /** `scheduledFor` viene si la notita quedó programada para otro día. */
  onSaved: (scheduledFor: string | null) => void;
};

const field =
  "w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";
const EVERYONE = "all";

export function ComposeSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.note ? "Editar notita" : "Escribir una notita"}>
      {props.open && <ComposeForm key={props.note?.id ?? "nueva"} {...props} />}
    </BottomSheet>
  );
}

function ComposeForm({ note, householdId, meName, partners, today, onSaved }: Props) {
  const [body, setBody] = useState(note?.body ?? "");
  const [paper, setPaper] = useState(note?.paper ?? "crema");
  const [sticker, setSticker] = useState<string | null>(note ? note.sticker : "🌸");
  const [later, setLater] = useState(!!note && note.deliver_on > today);
  const [date, setDate] = useState(note && note.deliver_on > today ? note.deliver_on : "");
  const [to, setTo] = useState(note ? (note.to_user ?? EVERYONE) : partners.length === 1 ? partners[0].id : EVERYONE);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const deliverOn = later && date ? date : today;
  const recipient = partners.find((p) => p.id === to);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!body.trim()) return setError("Escribe algo bonito antes de dejarla.");
    if (later && !date) return setError("Elige el día en que quieres que aparezca.");
    if (later && date <= today) return setError("Para programarla, elige un día que aún no haya llegado.");

    const payload = {
      body: body.trim(),
      paper,
      sticker,
      deliver_on: deliverOn,
      to_user: to === EVERYONE ? null : to,
    };

    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = note
      ? await supabase.from("daily_messages").update(payload).eq("id", note.id)
      : await supabase.from("daily_messages").insert({ ...payload, household_id: householdId });
    setSaving(false);
    if (saveError) return setError("No se pudo guardar la notita. Revisa tu conexión e inténtalo de nuevo.");
    onSaved(deliverOn > today ? deliverOn : null);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Así la verá quien la reciba */}
      <div className="px-2 pt-3">
        <NoteCard
          id={note?.id ?? "vista-previa"}
          body={body.trim() || "Aquí aparecerá lo que escribas…"}
          paper={paper}
          sticker={sticker}
          from={meName}
          date={formatDate(deliverOn)}
          tilted={false}
        />
      </div>

      <div>
        <label className={label} htmlFor="n-body">
          {recipient ? `Para ${recipient.name}` : partners.length > 1 ? "Para todos" : "Tu mensaje"}
        </label>
        <textarea
          id="n-body"
          className={`${field} min-h-28 py-3 leading-relaxed`}
          style={{ fontFamily: "var(--font-note)" }}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="¡Que tengas un hermoso día!"
          rows={4}
          autoFocus
        />
        <p className="mt-1 text-right text-xs text-ink-soft">
          {body.length} / {MAX_LENGTH}
        </p>
      </div>

      {partners.length > 1 && (
        <div>
          <label className={label} htmlFor="n-to">Para</label>
          <select id="n-to" className={`${field} min-h-11`} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value={EVERYONE}>Todos en el hogar</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <p className={label}>Papel</p>
        <div className="flex gap-3">
          {PAPERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPaper(p.key)}
              aria-label={`Papel ${p.label}`}
              aria-pressed={paper === p.key}
              className={`size-11 rounded-lg border-2 shadow-sm transition active:scale-90 ${paper === p.key ? "border-ink" : "border-black/10"}`}
              style={{ background: p.color }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className={label}>Pegatina</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSticker(null)}
            aria-pressed={sticker === null}
            className={`min-h-10 rounded-xl border px-3 text-sm transition ${sticker === null ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"}`}
          >
            Ninguna
          </button>
          {STICKERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSticker(s)}
              aria-label={`Pegatina ${s}`}
              aria-pressed={sticker === s}
              className={`size-11 rounded-xl border text-xl transition active:scale-90 ${sticker === s ? "border-forest bg-forest/15" : "border-line bg-surface"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={label}>¿Cuándo la verá?</p>
        <div className="flex gap-1 rounded-xl bg-washi-deep p-1">
          {(
            [
              [false, "Ahora"],
              [true, "Otro día"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={text}
              type="button"
              onClick={() => setLater(value)}
              aria-pressed={later === value}
              className={`min-h-10 flex-1 rounded-lg text-sm font-medium transition ${later === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"}`}
            >
              {text}
            </button>
          ))}
        </div>
        {later && (
          <>
            <input
              type="date"
              aria-label="Día de entrega"
              className={`${field} mt-2 min-h-11`}
              value={date}
              min={addDaysISO(today, 1)}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="mt-1.5 px-1 text-xs text-ink-soft">
              {recipient?.name ?? "Quien la reciba"} no la verá hasta ese día; cuando llegue, aparecerá al abrir la app.
            </p>
          </>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button
        disabled={saving}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60"
      >
        {saving ? "Guardando…" : note ? "Guardar cambios" : later ? "Programar notita" : "Dejar notita"}
      </button>
    </form>
  );
}
