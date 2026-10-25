"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import type { Participant } from "@/lib/gastos/balance";

type Props = {
  open: boolean;
  onClose: () => void;
  householdId: string;
  groupId: string;
  participants: Participant[];
  /** Participantes que no se pueden quitar porque ya pagaron o tienen parte en algún gasto. */
  usedIds: Set<string>;
  onChanged: () => void;
};

const PALETTE = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f", "#a889c9", "#d9a441"];
const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";

export function PeopleSheet({ open, onClose, householdId, groupId, participants, usedIds, onChanged }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = name.trim();
    if (!clean) return setError("Escribe el nombre de quien viaja con ustedes.");
    if (participants.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return setError("Ya hay alguien con ese nombre.");

    setBusy(true);
    const { error: insertError } = await createClient()
      .from("expense_participants")
      .insert({ household_id: householdId, group_id: groupId, user_id: null, name: clean, color: PALETTE[participants.length % PALETTE.length] });
    setBusy(false);
    if (insertError) return setError("No se pudo añadir. Inténtalo de nuevo.");
    setName("");
    onChanged();
  }

  async function remove(p: Participant) {
    setError("");
    setBusy(true);
    const { error: deleteError } = await createClient().from("expense_participants").delete().eq("id", p.id);
    setBusy(false);
    if (deleteError) return setError("No se pudo quitar a esa persona.");
    onChanged();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="¿Quién viaja?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          Las dos personas del hogar ya están. Si viajan con amigos, añádelos aquí aunque no tengan cuenta: sus gastos y deudas también se calculan.
        </p>

        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {participants.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-3 px-3">
              <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}</span>
              {p.user_id ? (
                <span className="text-xs text-ink-soft">Con cuenta</span>
              ) : usedIds.has(p.id) ? (
                <span className="text-xs text-ink-soft" title="Tiene gastos: no se puede quitar">Invitado</span>
              ) : (
                <button
                  onClick={() => remove(p)}
                  disabled={busy}
                  aria-label={`Quitar a ${p.name}`}
                  className="flex size-10 items-center justify-center rounded-full text-hanko"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={add} className="flex gap-2">
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de un amigo o amiga" maxLength={40} aria-label="Nombre del invitado" />
          <button disabled={busy} aria-label="Añadir invitado" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest text-surface shadow-sm transition active:scale-95 disabled:opacity-60">
            <UserPlus size={18} />
          </button>
        </form>

        {error && <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">{error}</p>}
      </div>
    </BottomSheet>
  );
}
