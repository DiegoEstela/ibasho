"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { COLOR_KEYS, colorFor } from "@/lib/compras/icons";
import { parseAmount } from "@/lib/gastos/money";
import { createClient } from "@/lib/supabase/client";
import type { PersonalCard } from "@/lib/personal/types";

const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

type Props = { open: boolean; onClose: () => void; card: PersonalCard | null; userId: string };

const dayOrNull = (text: string) => {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

/** Crear o editar una tarjeta privada: solo la ves tú. */
export function PersonalCardSheet(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.card ? "Editar tarjeta" : "Nueva tarjeta privada"}>
      {props.open && <CardForm key={props.card?.id ?? "nueva"} {...props} />}
    </BottomSheet>
  );
}

function CardForm({ onClose, card, userId }: Props) {
  const [kind, setKind] = useState<"credit" | "debit">(card?.kind ?? "debit");
  const [name, setName] = useState(card?.name ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [color, setColor] = useState(card?.color ?? "sky");
  const [balance, setBalance] = useState(card ? String(card.initial_balance).replace(".", ",") : "");
  const [closing, setClosing] = useState(card?.closing_day ? String(card.closing_day) : "");
  const [due, setDue] = useState(card?.due_day ? String(card.due_day) : "");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const write = useMutation({
    mutationFn: async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error: writeError } = await run();
      if (writeError) throw new Error(writeError.message);
    },
    meta: { silent: true },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Ponle un nombre, por ejemplo «Mi débito».");
    if (last4 && !/^\d{4}$/.test(last4)) return setError("Los últimos dígitos deben ser exactamente 4 números.");

    let initial = 0;
    if (kind === "debit" && balance.trim()) {
      const parsed = parseAmount(balance.replace("-", ""));
      if (parsed === null) return setError("Escribe el saldo con números, por ejemplo 250,00.");
      initial = balance.trim().startsWith("-") ? -parsed : parsed;
    }
    if (kind === "credit" && due && !dayOrNull(due)) return setError("El día de pago debe estar entre 1 y 31.");
    if (kind === "credit" && closing && !dayOrNull(closing)) return setError("El día de cierre debe estar entre 1 y 31.");

    const row = {
      name: name.trim(),
      last4: last4 || null,
      color,
      kind,
      initial_balance: initial,
      closing_day: kind === "credit" && closing ? dayOrNull(closing) : null,
      due_day: kind === "credit" && due ? dayOrNull(due) : null,
    };
    const supabase = createClient();
    try {
      await write.mutateAsync(() =>
        card ? supabase.from("personal_cards").update(row).eq("id", card.id) : supabase.from("personal_cards").insert({ ...row, user_id: userId }),
      );
    } catch {
      return setError("No se pudo guardar la tarjeta. Inténtalo de nuevo.");
    }
    onClose();
  }

  async function remove() {
    if (!card) return;
    try {
      await write.mutateAsync(() => createClient().from("personal_cards").delete().eq("id", card.id));
    } catch {
      return setError("No se pudo eliminar la tarjeta.");
    }
    onClose();
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
      <p className="flex items-center gap-1.5 text-xs text-ink-soft">
        <Lock size={12} /> Solo la ves tú. Belén no la ve en ninguna pantalla.
      </p>

      <div>
        <p className={label}>Tipo de tarjeta</p>
        <div className="flex gap-1 rounded-xl bg-washi-deep p-1">
          {kindButton("debit", "Débito", "Con saldo que se descuenta")}
          {kindButton("credit", "Crédito", "Pagas a fin de mes")}
        </div>
        {card && <p className="mt-1 px-1 text-xs text-ink-soft">El tipo no se puede cambiar una vez creada.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="pc-name">Nombre</label>
          <input id="pc-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi débito" maxLength={40} autoFocus={!card} />
        </div>
        <div>
          <label className={label} htmlFor="pc-last4">Últimos 4 dígitos</label>
          <input id="pc-last4" className={field} inputMode="numeric" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Opcional" />
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

      {kind === "debit" ? (
        <div>
          <label className={label} htmlFor="pc-balance">{card ? "Saldo inicial (€)" : "¿Cuánto dinero tiene hoy? (€)"}</label>
          <input id="pc-balance" className={field} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
          <p className="mt-1 px-1 text-xs text-ink-soft">Cada gasto pagado con ella lo descuenta y cada ingreso que anotes en ella lo suma.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="pc-due">Día de pago</label>
            <input id="pc-due" className={field} inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Opcional" />
          </div>
          <div>
            <label className={label} htmlFor="pc-closing">Día de cierre</label>
            <input id="pc-closing" className={field} inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Opcional" />
          </div>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}

      <button disabled={write.isPending} className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
        {write.isPending ? "Guardando…" : card ? "Guardar cambios" : "Crear tarjeta"}
      </button>

      {card &&
        (confirmDelete ? (
          <button type="button" onClick={remove} disabled={write.isPending} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-hanko/10 px-3 text-sm font-medium text-hanko">
            <Trash2 size={16} /> Sí, eliminar la tarjeta
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm text-hanko">
            <Trash2 size={16} /> Eliminar tarjeta
          </button>
        ))}
      {card && confirmDelete && <p className="-mt-2 text-xs text-ink-soft">Tus movimientos con ella se conservan, pero quedan sin tarjeta.</p>}
    </form>
  );
}
