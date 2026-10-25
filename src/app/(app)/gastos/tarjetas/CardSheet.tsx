"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { COLOR_KEYS, colorFor } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import type { Card, Person } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  card: Card | null;
  people: Person[];
  meId: string;
  householdId: string;
  purchasesCount: number;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

export function CardSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.card ? "Editar tarjeta" : "Nueva tarjeta"}>
      {props.open && <CardForm key={props.card?.id ?? "nueva"} {...props} />}
    </BottomSheet>
  );
}

const dayOrNull = (text: string) => {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

function CardForm({ card, people, meId, householdId, purchasesCount, onSaved }: Props) {
  const [name, setName] = useState(card?.name ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [color, setColor] = useState(card?.color ?? "forest");
  const [owner, setOwner] = useState(card?.owner_user_id ?? meId);
  const [closing, setClosing] = useState(card?.closing_day ? String(card.closing_day) : "");
  const [due, setDue] = useState(card?.due_day ? String(card.due_day) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Ponle un nombre a la tarjeta, por ejemplo «Visa de Ana».");
    if (last4 && !/^\d{4}$/.test(last4)) return setError("Los últimos dígitos deben ser exactamente 4 números.");
    const dueDay = dayOrNull(due);
    if (!dueDay) return setError("Indica el día del mes en que se paga la tarjeta (1 a 31).");
    if (closing && !dayOrNull(closing)) return setError("El día de cierre debe estar entre 1 y 31.");

    const payload = {
      name: name.trim(),
      last4: last4 || null,
      color,
      owner_user_id: owner,
      closing_day: closing ? dayOrNull(closing) : null,
      due_day: dueDay,
    };

    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = card
      ? await supabase.from("cards").update(payload).eq("id", card.id)
      : await supabase.from("cards").insert({ ...payload, household_id: householdId });
    setSaving(false);
    if (saveError) return setError("No se pudo guardar la tarjeta. Inténtalo de nuevo.");
    onSaved();
  }

  async function remove() {
    if (!card) return;
    setSaving(true);
    const { error: deleteError } = await createClient().from("cards").delete().eq("id", card.id);
    setSaving(false);
    if (deleteError) return setError("No se pudo eliminar la tarjeta.");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="c-name">Nombre</label>
        <input id="c-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Visa de Ana" maxLength={40} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="c-last4">Últimos 4 dígitos</label>
          <input id="c-last4" className={field} inputMode="numeric" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Opcional" />
        </div>
        <div>
          <label className={label} htmlFor="c-owner">Titular</label>
          <select id="c-owner" className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (tú)` : p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className={label}>Color</p>
        <div className="flex gap-3">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setColor(key)}
              aria-label={key}
              aria-pressed={key === color}
              className={`size-11 rounded-full border-2 transition active:scale-90 ${key === color ? "border-ink" : "border-transparent"}`}
              style={{ background: colorFor(key) }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="c-due">Día de pago</label>
          <input id="c-due" className={field} inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ej. 5" />
        </div>
        <div>
          <label className={label} htmlFor="c-closing">Día de cierre</label>
          <input id="c-closing" className={field} inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Opcional" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-ink-soft">
        El día de cierre es cuando la tarjeta corta el resumen: las compras posteriores se cobran un mes después. Si no lo sabes, déjalo vacío.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>
      )}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : card ? "Guardar cambios" : "Crear tarjeta"}
      </button>

      {card &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar{purchasesCount > 0 ? ` la tarjeta y sus ${purchasesCount} ${purchasesCount === 1 ? "compra" : "compras"}` : " la tarjeta"}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar tarjeta
          </button>
        ))}
    </form>
  );
}
