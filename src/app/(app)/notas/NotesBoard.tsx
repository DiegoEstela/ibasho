"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Pin, Plus, Search, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { colorFor, tint } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { NOTE_TAGS, matchesQuery, noteTag } from "@/lib/notas/tags";
import { BUCKET } from "@/lib/viajes/storage";
import { NoteSheet } from "./NoteSheet";
import type { HomeNote } from "./types";

type Props = {
  householdId: string;
  initialNotes: HomeNote[];
  /** Enlaces temporales de las fotos, por ruta. */
  initialPhotos: Record<string, string>;
};

export function NotesBoard({ householdId, initialNotes, initialPhotos }: Props) {
  const [supabase] = useState(() => createClient());
  const [notes, setNotes] = useState(initialNotes);
  const [photos, setPhotos] = useState(initialPhotos);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<{ open: boolean; note: HomeNote | null }>({ open: false, note: null });

  // ---------- Sincronización ----------
  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("notes")
      .select("id, title, body, tag, pinned, is_secret, photo_path, updated_at")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500);
    if (!data) return;
    const list = data as HomeNote[];
    setNotes(list);
    const paths = list.map((n) => n.photo_path).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      setPhotos(Object.fromEntries((signed ?? []).flatMap((s) => (s.signedUrl ? [[s.path as string, s.signedUrl]] : []))));
    } else setPhotos({});
  }, [supabase]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const channel = supabase
      .channel(`notas-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `household_id=eq.${householdId}` }, queue)
      .subscribe();
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
  const visible = useMemo(() => notes.filter((n) => (!tag || n.tag === tag) && matchesQuery(n, query)), [notes, tag, query]);
  const pinned = visible.filter((n) => n.pinned);
  const others = visible.filter((n) => !n.pinned);
  const searching = !!query.trim() || !!tag;

  const toggleShown = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const card = (note: HomeNote) => {
    const t = noteTag(note.tag);
    const Icon = t.icon;
    const photo = note.photo_path ? photos[note.photo_path] : null;
    const hidden = note.is_secret && !shown.has(note.id);
    return (
      <li key={note.id} className="mb-3 break-inside-avoid">
        <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <button onClick={() => setSheet({ open: true, note })} className="block w-full text-left transition active:scale-[0.99]" aria-label={`Abrir la nota «${note.title}»`}>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            )}
            <div className="flex items-start gap-2.5 px-3.5 pt-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(t.color), color: colorFor(t.color) }}>
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-[15px] font-bold leading-snug">{note.title}</h3>
                <p className="text-[11px] text-ink-soft">{t.label}</p>
              </div>
              {note.pinned && <Pin size={14} className="mt-1 shrink-0 fill-forest text-forest" aria-label="Fijada" />}
            </div>
            {note.body && (
              <p className={`px-3.5 pb-3 pt-2 text-sm leading-relaxed text-ink-soft ${hidden ? "select-none tracking-[0.25em]" : "line-clamp-6 whitespace-pre-line"}`}>
                {hidden ? "••••••••" : note.body}
              </p>
            )}
            {!note.body && <div className="pb-3" />}
          </button>

          {note.is_secret && note.body && (
            <button
              onClick={() => toggleShown(note.id)}
              aria-label={hidden ? "Mostrar el texto" : "Ocultar el texto"}
              className="flex min-h-10 w-full items-center justify-center gap-2 border-t border-line text-xs font-medium text-forest"
            >
              {hidden ? <Eye size={14} /> : <EyeOff size={14} />} {hidden ? "Mostrar" : "Ocultar"}
            </button>
          )}
        </article>
      </li>
    );
  };

  const grid = (list: HomeNote[]) => <ul className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">{list.map(card)}</ul>;

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Notas"
        subtitle={notes.length === 0 ? "Medidas y datos útiles de la casa" : `${notes.length} ${notes.length === 1 ? "nota" : "notas"}`}
        actions={
          <button
            onClick={() => setSheet({ open: true, note: null })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> Nota
          </button>
        }
      />

      {notes.length > 0 && (
        <>
          <div className="relative lg:max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar una nota…"
              aria-label="Buscar una nota"
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-10 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Borrar la búsqueda" className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 chip-row">
            <button
              onClick={() => setTag("")}
              aria-pressed={!tag}
              className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition ${!tag ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"}`}
            >
              Todas
            </button>
            {NOTE_TAGS.filter((t) => notes.some((n) => n.tag === t.key)).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTag(tag === t.key ? "" : t.key)}
                  aria-pressed={tag === t.key}
                  className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                    tag === t.key ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
                  }`}
                >
                  <Icon size={13} style={{ color: colorFor(t.color) }} /> {t.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {notes.length === 0 ? (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center lg:mt-10">
          <span className="text-5xl" aria-hidden>
            📏
          </span>
          <p className="font-display text-xl font-bold">Lo que siempre se olvida, anotado</p>
          <p className="text-sm text-ink-soft">
            «Las fotos de los cuadros miden 40 × 40», «la cama es de 170 × 190», la clave del wifi de invitados… Guárdenlo aquí y búsquenlo cuando lo necesiten.
          </p>
          <button
            onClick={() => setSheet({ open: true, note: null })}
            className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95"
          >
            Escribir la primera nota
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
          No encontramos notas{query.trim() ? ` con «${query.trim()}»` : ""}.
        </p>
      ) : (
        <div className="mt-4">
          {pinned.length > 0 && (
            <>
              {!searching && <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wider text-ink-soft"><Pin size={12} /> Fijadas</h2>}
              {grid(pinned)}
            </>
          )}
          {others.length > 0 && (
            <>
              {pinned.length > 0 && !searching && <h2 className="mb-2 mt-4 px-1 text-xs font-medium uppercase tracking-wider text-ink-soft">Todas</h2>}
              {grid(others)}
            </>
          )}
        </div>
      )}

      <NoteSheet
        open={sheet.open}
        onClose={() => setSheet({ open: false, note: null })}
        note={sheet.note}
        photoUrl={sheet.note?.photo_path ? (photos[sheet.note.photo_path] ?? null) : null}
        householdId={householdId}
        onSaved={() => {
          setSheet({ open: false, note: null });
          refetch();
        }}
      />
    </section>
  );
}
