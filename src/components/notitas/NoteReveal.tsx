"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NoteCard } from "@/components/notitas/NoteCard";
import { REACTIONS } from "@/lib/notitas/papers";
import { createClient } from "@/lib/supabase/client";

type Note = {
  id: string;
  from_user: string;
  body: string;
  paper: string;
  sticker: string | null;
  deliver_on: string;
};

type Phase = "envelope" | "letter";

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Pétalos: posición, retraso y duración repartidos a mano para que no se vean uniformes.
const PETALS = [
  { left: 6, delay: 0, dur: 7.5, drift: 40 },
  { left: 16, delay: 1.8, dur: 8.5, drift: -30 },
  { left: 27, delay: 0.6, dur: 6.8, drift: 50 },
  { left: 38, delay: 2.6, dur: 9, drift: -45 },
  { left: 49, delay: 1.1, dur: 7.2, drift: 30 },
  { left: 58, delay: 3.2, dur: 8.2, drift: -35 },
  { left: 68, delay: 0.3, dur: 9.2, drift: 45 },
  { left: 77, delay: 2.1, dur: 7, drift: -50 },
  { left: 86, delay: 1.4, dur: 8.8, drift: 35 },
  { left: 94, delay: 3.6, dur: 7.6, drift: -25 },
];

/**
 * Al abrir la app, si tu pareja te dejó una notita que aún no leíste, aparece un sobre que se abre.
 * Al guardarla queda leída y pasa al diario. También avisa si llega una mientras la app está abierta.
 */
export function NoteReveal({ userId, householdId }: { userId: string; householdId: string }) {
  const [supabase] = useState(() => createClient());
  const [queue, setQueue] = useState<Note[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("envelope");
  const [visible, setVisible] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [toast, setToast] = useState<Note | null>(null);
  const handled = useRef(new Set<string>());

  const current = queue[0] ?? null;
  const nameOf = (id: string) => names[id] ?? "Alguien";

  /** Busca notitas entregadas y sin leer. Las que ya se descartaron "para más tarde" no vuelven a salir hasta recargar. */
  const loadUnread = useCallback(async () => {
    const [{ data: notes }, { data: reads }, { data: profiles }] = await Promise.all([
      supabase
        .from("daily_messages")
        .select("id, from_user, body, paper, sticker, deliver_on")
        .neq("from_user", userId)
        .order("deliver_on", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50),
      supabase.from("daily_message_reads").select("message_id").eq("user_id", userId),
      supabase.from("profiles").select("id, display_name"),
    ]);
    if (profiles) setNames(Object.fromEntries(profiles.map((p) => [p.id, p.display_name || "Alguien"])));
    const read = new Set((reads ?? []).map((r) => r.message_id));
    const unread = ((notes ?? []) as Note[]).filter((n) => !read.has(n.id) && !handled.current.has(n.id));
    if (unread.length > 0) {
      setQueue((prev) => {
        const known = new Set(prev.map((n) => n.id));
        return [...prev, ...unread.filter((n) => !known.has(n.id))];
      });
      setVisible(true);
    }
  }, [supabase, userId]);

  useEffect(() => {
    // El aviso depende de datos externos (Supabase): se carga una vez al montar la app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUnread();

    // Si tu pareja escribe mientras tienes la app abierta, llega un aviso suave.
    const channel = supabase
      .channel(`reveal-${householdId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "daily_messages", filter: `household_id=eq.${householdId}` },
        (payload) => {
          const note = payload.new as Note;
          if (note.from_user === userId) return;
          setQueue((prev) => (prev.some((n) => n.id === note.id) ? prev : [...prev, note]));
          setToast(note);
        },
      )
      .subscribe();

    // Las notitas programadas llegan por fecha: se revisan al volver a la app.
    const onVisible = () => document.visibilityState === "visible" && loadUnread();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, householdId, userId, loadUnread]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  async function openLetter() {
    if (!current) return;
    setPhase("letter");
    setMyReaction(null);
    // Abrirla ya la marca como leída.
    await supabase
      .from("daily_message_reads")
      .upsert({ message_id: current.id, household_id: householdId }, { onConflict: "message_id,user_id", ignoreDuplicates: true });
  }

  async function react(emoji: string) {
    if (!current) return;
    const next = myReaction === emoji ? null : emoji;
    setMyReaction(next);
    if (next === null) {
      await supabase.from("daily_message_reactions").delete().eq("message_id", current.id).eq("user_id", userId);
    } else {
      await supabase
        .from("daily_message_reactions")
        .upsert({ message_id: current.id, household_id: householdId, emoji: next }, { onConflict: "message_id,user_id" });
    }
  }

  /** Pasa a la siguiente notita o cierra. */
  function next() {
    if (current) handled.current.add(current.id);
    const rest = queue.slice(1);
    setQueue(rest);
    setPhase("envelope");
    setMyReaction(null);
    if (rest.length === 0) setVisible(false);
  }

  return (
    <>
      {toast && !visible && (
        <div
          role="status"
          className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-[55] mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm shadow-lg ring-1 ring-line"
        >
          <span>
            💌 {nameOf(toast.from_user)} te dejó una notita
          </span>
          <button
            onClick={() => {
              setToast(null);
              setVisible(true);
            }}
            className="min-h-9 shrink-0 font-medium text-forest"
          >
            Abrir
          </button>
        </div>
      )}

      {visible && current && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden px-5" role="dialog" aria-modal="true" aria-label="Tienes una notita">
          <div className="absolute inset-0 bg-ink/65 backdrop-blur-sm sheet-backdrop" />

          {/* Pétalos cayendo (se ocultan con «reducir movimiento») */}
          {phase === "letter" &&
            PETALS.map((p, i) => (
              <span
                key={i}
                aria-hidden
                className="petal pointer-events-none absolute top-0 size-3 rounded-[100%_0_100%_0] bg-sakura"
                style={{ left: `${p.left}%`, ["--delay" as string]: `${p.delay}s`, ["--dur" as string]: `${p.dur}s`, ["--drift" as string]: `${p.drift}px` }}
              />
            ))}

          <div className="relative flex w-full max-w-md flex-col items-center gap-5 py-6">
            {phase === "envelope" ? (
              <>
                <div className="envelope-bob relative h-40 w-60" aria-hidden>
                  <div className="absolute inset-0 rounded-lg shadow-2xl" style={{ background: "linear-gradient(160deg, #fbf3df, #f1e4c6)" }} />
                  <div
                    className="absolute inset-x-0 top-0 h-24 rounded-t-lg"
                    style={{ background: "linear-gradient(180deg, #efdfba, #f6ead0)", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
                  />
                  <span
                    className="absolute left-1/2 top-[68px] flex size-12 -translate-x-1/2 rotate-[-8deg] items-center justify-center rounded-full border-2 border-white/40 text-lg font-bold text-white shadow-md"
                    style={{ background: "#c8382f", fontFamily: "var(--font-display)" }}
                  >
                    {nameOf(current.from_user).charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="text-center text-surface">
                  <p className="font-display text-2xl font-bold">{nameOf(current.from_user)} te dejó una notita</p>
                  {queue.length > 1 && <p className="mt-1 text-sm opacity-80">y hay {queue.length - 1} más esperándote</p>}
                </div>

                <div className="flex w-full max-w-xs flex-col gap-2">
                  <button
                    onClick={openLetter}
                    className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-lg transition active:scale-95"
                  >
                    Abrir
                  </button>
                  <button onClick={next} className="min-h-11 text-sm text-surface/80">
                    Más tarde
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="letter-rise w-full px-2">
                  <NoteCard
                    id={current.id}
                    body={current.body}
                    paper={current.paper}
                    sticker={current.sticker}
                    from={nameOf(current.from_user)}
                    date={formatDate(current.deliver_on)}
                    tilted={false}
                    size="lg"
                  />
                </div>

                <div className="flex justify-center gap-2" role="group" aria-label="Reaccionar">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => react(emoji)}
                      aria-pressed={myReaction === emoji}
                      aria-label={`Reaccionar con ${emoji}`}
                      className={`flex size-11 items-center justify-center rounded-full text-xl transition active:scale-90 ${
                        myReaction === emoji ? "bg-surface ring-2 ring-sakura" : "bg-surface/90"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <div className="flex w-full max-w-xs flex-col gap-2">
                  <button
                    onClick={next}
                    className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-lg transition active:scale-95"
                  >
                    {queue.length > 1 ? "Guardar y ver la siguiente" : "Guardar en el diario"}
                  </button>
                  <Link href="/notitas?escribir=1" onClick={next} className="flex min-h-11 items-center justify-center text-sm text-surface/80">
                    Escribir una respuesta
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
