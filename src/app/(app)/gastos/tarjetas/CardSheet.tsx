"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { COLOR_KEYS, colorFor } from "@/lib/compras/icons";
import { parseAmount } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import type { Card, Person } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  card: Card | null;
  people: Person[];
  meId: string;
  householdId: string;
  /** Compras (crédito) o ingresos (débito) que se perderían al eliminarla. */
  linkedCount: number;
  onSaved: () => void;
};

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";
const SHARED = "shared";

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

function CardForm({ card, people, meId, householdId, linkedCount, onSaved }: Props) {
  const [kind, setKind] = useState<"credit" | "debit">(card?.kind ?? "credit");
  const [name, setName] = useState(card?.name ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [color, setColor] = useState(card?.color ?? "forest");
  const [owner, setOwner] = useState(card ? (card.owner_user_id ?? SHARED) : meId);
  const [closing, setClosing] = useState(card?.closing_day ? String(card.closing_day) : "");
  const [due, setDue] = useState(card?.due_day ? String(card.due_day) : "");
  const [balance, setBalance] = useState(card ? String(card.initial_balance).replace(".", ",") : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError(kind === "debit" ? "Ponle un nombre a la tarjeta, por ejemplo «Cuenta de los dos»." : "Ponle un nombre a la tarjeta, por ejemplo «Visa de Ana».");
    if (last4 && !/^\d{4}$/.test(last4)) return setError("Los últimos dígitos deben ser exactamente 4 números.");

    let dueDay: number | null = null;
    let closingDay: number | null = null;
    let initial = 0;

    if (kind === "credit") {
      dueDay = dayOrNull(due);
      if (!dueDay) return setError("Indica el día del mes en que se paga la tarjeta (1 a 31).");
      if (closing && !dayOrNull(closing)) return setError("El día de cierre debe estar entre 1 y 31.");
      closingDay = closing ? dayOrNull(closing) : null;
    } else if (balance.trim()) {
      const parsed = parseAmount(balance.replace("-", ""));
      if (parsed === null) return setError("Escribe el saldo con números, por ejemplo 250,00.");
      initial = balance.trim().startsWith("-") ? -parsed : parsed;
    }

    const payload = {
      kind,
      name: name.trim(),
      last4: last4 || null,
      color,
      owner_user_id: owner === SHARED ? null : owner,
      closing_day: closingDay,
      due_day: dueDay,
      initial_balance: initial,
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

  const kindButton = (value: "credit" | "debit", text: string, hint: string) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      aria-pressed={kind === value}
      disabled={!!card}
      className={`flex-1 rounded-lg px-2 py-2 text-left transition disabled:opacity-70 ${kind === value ? "bg-surface shadow-sm" : ""}`}
    >
      <span className={`block text-sm font-medium ${kind === value ? "text-forest" : "text-ink-soft"}`}>{text}</span>
      <span className="block text-[11px] text-ink-soft">{hint}</span>
    </button>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className={label}>Tipo de tarjeta</p>
        <div className="flex gap-1 rounded-xl bg-washi-deep p-1">
          {kindButton("credit", "Crédito", "Compras en cuotas")}
          {kindButton("debit", "Débito", "Dinero que ya tienes")}
        </div>
        {card && <p className="mt-1 px-1 text-xs text-ink-soft">El tipo no se puede cambiar una vez creada.</p>}
      </div>

      <div>
        <label className={label} htmlFor="c-name">Nombre</label>
        <input id="c-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "debit" ? "Cuenta de los dos" : "Visa de Ana"} maxLength={40} autoFocus />
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
            {people.length > 1 && <option value={SHARED}>Compartida (de los dos)</option>}
          </select>
        </div>
      </div>
      {owner === SHARED && (
        <p className="-mt-2 text-xs text-ink-soft">
          Lo que se pague con una tarjeta compartida no genera deudas entre ustedes: sale del dinero de los dos.
        </p>
      )}

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

      {kind === "credit" ? (
        <>
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
        </>
      ) : (
        <div>
          <label className={label} htmlFor="c-balance">{card ? "Saldo inicial (€)" : "¿Cuánto dinero tiene hoy? (€)"}</label>
          <input id="c-balance" className={field} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
          <p className="mt-1 px-1 text-xs text-ink-soft">
            A partir de ahí, cada ingreso lo suma y cada gasto pagado con esta tarjeta lo descuenta.
            {card && " Si lo cambias, el saldo actual se ajusta en la misma cantidad."}
          </p>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={saving} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {saving ? "Guardando…" : card ? "Guardar cambios" : "Crear tarjeta"}
      </button>

      {card &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar
            {linkedCount > 0
              ? card.kind === "debit"
                ? ` la tarjeta y sus ${linkedCount} ${linkedCount === 1 ? "ingreso" : "ingresos"}`
                : ` la tarjeta y sus ${linkedCount} ${linkedCount === 1 ? "compra" : "compras"}`
              : " la tarjeta"}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar tarjeta
          </button>
        ))}
      {card && confirmDelete && card.kind === "debit" && (
        <p className="-mt-2 text-xs text-ink-soft">Los gastos que se pagaron con ella se conservan, pero quedan sin tarjeta.</p>
      )}
    </form>
  );
}
