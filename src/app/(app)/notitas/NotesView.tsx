"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Pencil, PenLine, Trash2 } from "lucide-react";
import { NoteCard } from "@/components/notitas/NoteCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { REACTIONS } from "@/lib/notitas/papers";
import { createClient } from "@/lib/supabase/client";
import { ComposeSheet } from "./ComposeSheet";
import { formatDate, isScheduled, nowParts, whenLabel, type Note, type NoteReaction, type NoteRead, type Person } from "./types";

type Props = {
  householdId: string;
  userId: string;
  people: Person[];
  initialNotes: Note[];
  initialReads: NoteRead[];
  initialReactions: NoteReaction[];
  /** Abre el formulario al entrar (viene de «Escribir una respuesta»). */
  startWriting?: boolean;
};

type Tab = "diario" | "programadas";

const monthTitle = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  const text = new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function NotesView({ householdId, userId, people, initialNotes, initialReads, initialReactions, startWriting = false }: Props) {
  const [supabase] = useState(() => createClient());
  // Hora del dispositivo, que se actualiza cada minuto: así una notita programada pasa sola al diario cuando llega su hora.
  const [clock, setClock] = useState(nowParts);
  useEffect(() => {
    const t = setInterval(() => setClock(nowParts()), 60_000);
    return () => clearInterval(t);
  }, []);
  const today = clock.date;
  const nowTime = clock.time;

  const [notes, setNotes] = useState(initialNotes);
  const [reads, setReads] = useState(initialReads);
  const [reactions, setReactions] = useState(initialReactions);

  const [tab, setTab] = useState<Tab>("diario");
  const [composer, setComposer] = useState<{ open: boolean; note: Note | null }>({ open: startWriting, note: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const me = people.find((p) => p.id === userId);
  const partners = people.filter((p) => p.id !== userId);
  const nameOf = useCallback(
    (id: string) => (id === userId ? (me?.name ?? "Tú") : (people.find((p) => p.id === id)?.name ?? "Alguien")),
    [people, userId, me],
  );

  // ---------- Sincronización ----------
  const refetch = useCallback(async () => {
    const [n, r, x] = await Promise.all([
      supabase.from("daily_messages").select("*").order("deliver_on", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("daily_message_reads").select("message_id, user_id, read_at").limit(5000),
      supabase.from("daily_message_reactions").select("message_id, user_id, emoji").limit(5000),
    ]);
    if (n.data) setNotes(n.data as Note[]);
    if (r.data) setReads(r.data as NoteRead[]);
    if (x.data) setReactions(x.data as NoteReaction[]);
  }, [supabase]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`notitas-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_messages", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_message_reads", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_message_reactions", filter }, queue)
      .subscribe();
    // Al volver a la app también se revisan las notitas que llegaron por su fecha.
    const onVisible = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [supabase, householdId, refetch]);

  // ---------- Datos derivados ----------
  const readByMe = useMemo(() => new Set(reads.filter((r) => r.user_id === userId).map((r) => r.message_id)), [reads, userId]);
  const readByOthers = useMemo(() => new Set(reads.filter((r) => r.user_id !== userId).map((r) => r.message_id)), [reads, userId]);

  const reactionsOf = useCallback((id: string) => reactions.filter((r) => r.message_id === id), [reactions]);
  const myReaction = (id: string) => reactions.find((r) => r.message_id === id && r.user_id === userId)?.emoji ?? null;

  /** Programadas: notitas mías con fecha futura. El resto forma el diario. */
  const scheduled = useMemo(() => notes.filter((n) => n.from_user === userId && isScheduled(n, today, nowTime)), [notes, userId, today, nowTime]);
  const diary = useMemo(() => notes.filter((n) => !isScheduled(n, today, nowTime)), [notes, today, nowTime]);

  const diaryByMonth = useMemo(() => {
    const groups = new Map<string, Note[]>();
    for (const n of diary) {
      const key = n.deliver_on.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    return [...groups.entries()];
  }, [diary]);

  const detail = notes.find((n) => n.id === detailId) ?? null;

  // ---------- Acciones ----------
  async function markRead(note: Note) {
    if (note.from_user === userId || readByMe.has(note.id)) return;
    setReads((prev) => [...prev, { message_id: note.id, user_id: userId, read_at: new Date().toISOString() }]);
    await supabase
      .from("daily_message_reads")
      .upsert({ message_id: note.id, household_id: householdId }, { onConflict: "message_id,user_id", ignoreDuplicates: true });
  }

  function open(note: Note) {
    setDetailId(note.id);
    markRead(note);
  }

  async function react(note: Note, emoji: string) {
    const current = myReaction(note.id);
    if (current === emoji) {
      setReactions((prev) => prev.filter((r) => !(r.message_id === note.id && r.user_id === userId)));
      await supabase.from("daily_message_reactions").delete().eq("message_id", note.id).eq("user_id", userId);
      return;
    }
    setReactions((prev) => [...prev.filter((r) => !(r.message_id === note.id && r.user_id === userId)), { message_id: note.id, user_id: userId, emoji }]);
    await supabase
      .from("daily_message_reactions")
      .upsert({ message_id: note.id, household_id: householdId, emoji }, { onConflict: "message_id,user_id" });
  }

  async function remove(note: Note) {
    setDetailId(null);
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    // Las que te enviaron solo se quitan de tu diario; las tuyas se borran para ambos.
    const { error } = note.from_user === userId
      ? await supabase.from("daily_messages").delete().eq("id", note.id)
      : await supabase.rpc("hide_note", { p_id: note.id });
    if (error) {
      refetch();
      flash("No se pudo eliminar. Revisa tu conexión.");
    }
  }

  function flash(text: string) {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  }

  function onSaved(scheduledFor: string | null) {
    const editing = !!composer.note;
    setComposer({ open: false, note: null });
    refetch();
    if (scheduledFor) {
      setTab("programadas");
      flash(`Programada: aparecerá el ${scheduledFor}.`);
    } else {
      setTab("diario");
      flash(editing ? "Cambios guardados." : `Listo: ${partners.length === 1 ? partners[0].name : "tu pareja"} la verá al abrir la app.`);
    }
  }

  // ---------- Piezas de la pantalla ----------
  const reactionChips = (note: Note) => {
    const list = reactionsOf(note.id);
    if (list.length === 0) return null;
    return (
      <span className="flex flex-wrap gap-1.5 text-sm">
        {list.map((r) => (
          <span key={r.user_id} className="rounded-full bg-black/5 px-2 py-0.5" title={nameOf(r.user_id)}>
            {r.emoji}
          </span>
        ))}
      </span>
    );
  };

  const statusLine = (note: Note) => {
    if (note.from_user !== userId) return null;
    if (isScheduled(note, today, nowTime)) return `Se entrega el ${formatDate(note.deliver_on)}${note.deliver_time ? ` a las ${note.deliver_time.slice(0, 5)}` : ""}`;
    return readByOthers.has(note.id) ? "✓ Ya la abrieron" : "Aún sin abrir";
  };

  const renderNote = (note: Note) => {
    const mine = note.from_user === userId;
    const isNew = !mine && !readByMe.has(note.id);
    const status = statusLine(note);
    const chips = reactionChips(note);
    return (
      <li key={note.id} className="mb-6 break-inside-avoid">
        <button onClick={() => open(note)} className="relative block w-full text-left transition active:scale-[0.99]" aria-label={`Abrir la notita de ${nameOf(note.from_user)}`}>
          <NoteCard
            id={note.id}
            body={note.body}
            paper={note.paper}
            sticker={note.sticker}
            from={nameOf(note.from_user)}
            date={isScheduled(note, today, nowTime) ? whenLabel(note.deliver_on, note.deliver_time) : formatDate(note.deliver_on)}
          >
            {(status || chips) && (
              <span className="flex items-center justify-between gap-3 text-xs opacity-80">
                <span>{status}</span>
                {chips}
              </span>
            )}
          </NoteCard>
          {isNew && (
            <span className="absolute -right-1 -top-2 rounded-full bg-hanko px-2 py-0.5 text-[11px] font-bold text-white shadow">Nueva</span>
          )}
        </button>
      </li>
    );
  };

  const writeButton = (
    <button
      onClick={() => setComposer({ open: true, note: null })}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
    >
      <PenLine size={16} /> Escribir
    </button>
  );

  return (
    <section className="max-w-[1500px]">
      <PageHeader title="Notitas" subtitle="El diario de ustedes" actions={writeButton} />

      <div className="mb-4 flex w-full gap-1 rounded-xl bg-washi-deep p-1 lg:w-fit" role="tablist" aria-label="Secciones">
        {(
          [
            ["diario", "Diario", diary.length],
            ["programadas", "Programadas", scheduled.length],
          ] as const
        ).map(([value, text, count]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition lg:flex-none lg:px-5 ${
              tab === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
            }`}
          >
            {text}
            {count > 0 && <span className="rounded-full bg-forest/15 px-2 text-xs text-forest">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "diario" ? (
        diary.length === 0 ? (
          <Empty
            title="Aquí vivirá el diario de ustedes"
            text="Deja la primera notita: aparecerá en el teléfono de tu pareja la próxima vez que abra Ibasho."
            action={
              <button
                onClick={() => setComposer({ open: true, note: null })}
                className="min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95"
              >
                Escribir la primera notita
              </button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {diaryByMonth.map(([month, list]) => (
              <div key={month}>
                <h2 className="mb-3 mt-2 px-1 font-display text-sm font-bold text-ink-soft">{monthTitle(`${month}-01`)}</h2>
                <ul className="columns-1 gap-6 px-2 sm:columns-2 xl:columns-3">{list.map(renderNote)}</ul>
              </div>
            ))}
          </div>
        )
      ) : scheduled.length === 0 ? (
        <Empty
          title="Nada programado"
          text="Programa una notita para una fecha especial y aparecerá ese día, como una sorpresa."
          action={
            <button
              onClick={() => setComposer({ open: true, note: null })}
              className="min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95"
            >
              Programar una notita
            </button>
          }
        />
      ) : (
        <ul className="columns-1 gap-6 px-2 sm:columns-2 xl:columns-3">{scheduled.map(renderNote)}</ul>
      )}

      <ComposeSheet
        open={composer.open}
        onClose={() => setComposer({ open: false, note: null })}
        note={composer.note}
        householdId={householdId}
        meName={me?.name ?? "Yo"}
        partners={partners}
        today={today}
        nowTime={nowTime}
        onSaved={onSaved}
      />

      {/* Detalle de una notita */}
      <BottomSheet open={!!detail} onClose={() => setDetailId(null)} title="Notita">
        {detail && (
          <div className="flex flex-col gap-5">
            <div className="px-2 pt-3">
              <NoteCard
                id={detail.id}
                body={detail.body}
                paper={detail.paper}
                sticker={detail.sticker}
                from={nameOf(detail.from_user)}
                date={isScheduled(detail, today, nowTime) ? whenLabel(detail.deliver_on, detail.deliver_time) : formatDate(detail.deliver_on)}
                tilted={false}
                size="lg"
              />
            </div>

            {detail.from_user !== userId ? (
              <div>
                <p className="mb-2 text-center text-sm text-ink-soft">¿Cómo te hizo sentir?</p>
                <div className="flex justify-center gap-2">
                  {REACTIONS.map((emoji) => {
                    const selected = myReaction(detail.id) === emoji;
                    return (
                      <button
                        key={emoji}
                        onClick={() => react(detail, emoji)}
                        aria-pressed={selected}
                        aria-label={`Reaccionar con ${emoji}`}
                        className={`flex size-11 items-center justify-center rounded-full border text-xl transition active:scale-90 ${
                          selected ? "border-forest bg-forest/15" : "border-line bg-surface"
                        }`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => remove(detail)}
                  className="mx-auto mt-4 flex min-h-11 items-center justify-center gap-2 px-4 text-sm text-hanko"
                >
                  <Trash2 size={15} /> Quitar de mi diario
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="flex items-center justify-center gap-2 text-center text-sm text-ink-soft">
                  {isScheduled(detail, today, nowTime) ? (
                    <>
                      <CalendarClock size={16} /> Se entregará el {formatDate(detail.deliver_on)}{detail.deliver_time ? ` a las ${detail.deliver_time.slice(0, 5)}` : ""}
                    </>
                  ) : readByOthers.has(detail.id) ? (
                    <>
                      <Check size={16} className="text-forest" /> Ya la abrieron
                      {reactionsOf(detail.id).length > 0 && ` y reaccionaron ${reactionsOf(detail.id).map((r) => r.emoji).join(" ")}`}
                    </>
                  ) : (
                    "Aún no la han abierto"
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setDetailId(null);
                      setComposer({ open: true, note: detail });
                    }}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium text-forest transition active:scale-95"
                  >
                    <Pencil size={15} /> Editar
                  </button>
                  <button
                    onClick={() => remove(detail)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-medium text-hanko transition active:scale-95"
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {notice && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm text-background shadow-lg lg:bottom-8"
        >
          {notice}
        </div>
      )}
    </section>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
      <span className="text-4xl" aria-hidden>
        💌
      </span>
      <p className="font-display text-lg font-bold">{title}</p>
      <p className="text-sm text-ink-soft">{text}</p>
      {action}
    </div>
  );
}
