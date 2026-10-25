"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, Check, Minus, Pencil, Plus, Share2 } from "lucide-react";
import { ShareCode } from "@/components/onboarding/ShareCode";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils/time";
import { MIN_SLOTS, WIDGETS, type WidgetDef, type WidgetId } from "./catalog";

export type Stats = {
  pendingCount: number;
  topPending: string[];
  recipesCount: number;
  favoritesCount: number;
  lastRecipe: string | null;
};

export type RecentItem = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
};

type Member = { id: string; name: string; color: string };

type Props = {
  userId: string;
  displayName: string;
  householdName: string;
  inviteCode: string;
  initialWidgets: WidgetId[];
  stats: Stats;
  recentItems: RecentItem[];
  members: Member[];
};

type Event = { key: string; memberId: string; text: string; at: string };

const EVENT_WINDOW_DAYS = 3;
const SEEN_KEY = "ibasho.avisos.vistos";

// Marca de "último aviso visto": solo es una comodidad del navegador, no un dato importante.
const seenListeners = new Set<() => void>();
let seenInMemory: number | null = null;

function subscribeSeen(callback: () => void) {
  seenListeners.add(callback);
  return () => seenListeners.delete(callback);
}

function getSeen(): number {
  if (seenInMemory !== null) return seenInMemory;
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function markSeen(at: number) {
  seenInMemory = at;
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // Ignorar.
  }
  seenListeners.forEach((listener) => listener());
}

const colorOf = (key: string) => `var(--${key})`;
const tint = (key: string, percent = 16) => `color-mix(in srgb, ${colorOf(key)} ${percent}%, var(--surface))`;

export function Dashboard({
  userId,
  displayName,
  householdName,
  inviteCode,
  initialWidgets,
  stats,
  recentItems,
  members,
}: Props) {
  const [supabase] = useState(() => createClient());
  const [now] = useState(() => Date.now());
  const [widgets, setWidgets] = useState<WidgetId[]>(initialWidgets);
  const [editMode, setEditMode] = useState(false);
  const [sheet, setSheet] = useState<"avisos" | "compartir" | "catalogo" | null>(null);
  const [seenAtOpen, setSeenAtOpen] = useState(0);
  const [error, setError] = useState("");
  const seen = useSyncExternalStore(subscribeSeen, getSeen, () => 0);

  // ---------- Novedades de la pareja ----------
  const events = useMemo<Event[]>(() => {
    const limit = now - EVENT_WINDOW_DAYS * 86400_000;
    const list: Event[] = [];
    for (const item of recentItems) {
      if (item.created_by && item.created_by !== userId && new Date(item.created_at).getTime() > limit) {
        list.push({ key: `c-${item.id}`, memberId: item.created_by, text: `agregó «${item.name}» a la lista`, at: item.created_at });
      }
      if (item.done && item.done_by && item.done_by !== userId && item.done_at && new Date(item.done_at).getTime() > limit) {
        list.push({ key: `d-${item.id}`, memberId: item.done_by, text: `compró «${item.name}»`, at: item.done_at });
      }
    }
    return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  }, [recentItems, userId, now]);

  const unread = events.filter((e) => new Date(e.at).getTime() > seen).length;
  const member = (id: string) => members.find((m) => m.id === id);

  function openAvisos() {
    setSeenAtOpen(seen);
    setSheet("avisos");
    markSeen(Date.now());
  }

  // ---------- Widgets ----------
  async function persist(next: WidgetId[]) {
    const previous = widgets;
    setWidgets(next);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update({ dashboard_widgets: next }).eq("id", userId);
    if (updateError) {
      setWidgets(previous);
      setError("No se pudo guardar tu resumen. Inténtalo de nuevo.");
    }
  }

  const add = (id: WidgetId) => widgets.includes(id) || persist([...widgets, id]);
  const remove = (id: WidgetId) => persist(widgets.filter((w) => w !== id));

  const chosen = widgets.map((id) => WIDGETS.find((w) => w.id === id)).filter((w): w is WidgetDef => !!w);
  const emptySlots = Math.max(0, MIN_SLOTS - chosen.length);
  const canAddMore = chosen.length < WIDGETS.length;

  const iconButton =
    "relative flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90";

  return (
    <section className="max-w-[1500px]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-sm text-terracotta">{householdName}</p>
          <h1 className="font-display text-3xl font-bold lg:text-4xl">Hola{displayName ? `, ${displayName}` : ""}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={openAvisos} aria-label={unread ? `Novedades: ${unread} sin leer` : "Novedades"} className={iconButton}>
            <Bell size={20} strokeWidth={1.75} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-hanko px-1 text-[11px] font-bold text-surface">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <button onClick={() => setSheet("compartir")} aria-label="Invitar a tu pareja" className={iconButton}>
            <Share2 size={20} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Mi resumen</h2>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-forest"
        >
          {editMode ? <Check size={16} /> : <Pencil size={16} />}
          {editMode ? "Listo" : "Editar"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
          {error}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {chosen.map((def) => (
          <WidgetCard key={def.id} def={def} stats={stats} editMode={editMode} onRemove={() => remove(def.id)} />
        ))}

        {Array.from({ length: emptySlots }, (_, n) => (
          <AddTile key={`slot-${n}`} label="Agregar widget" onClick={() => setSheet("catalogo")} />
        ))}
        {emptySlots === 0 && canAddMore && <AddTile label="Agregar más" onClick={() => setSheet("catalogo")} />}
      </div>

      {/* Novedades */}
      <BottomSheet open={sheet === "avisos"} onClose={() => setSheet(null)} title="Novedades">
        {events.length === 0 ? (
          <div className="py-6 text-center">
            <Bell className="mx-auto text-ink-soft" size={32} strokeWidth={1.5} />
            <p className="mt-3 font-display text-lg font-bold">Todo tranquilo</p>
            <p className="mt-1 text-sm text-ink-soft">
              Cuando tu pareja agregue o compre algo de la lista, lo verás aquí. Los avisos al teléfono llegarán más adelante.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {events.map((e) => {
              const who = member(e.memberId);
              const isNew = new Date(e.at).getTime() > seenAtOpen;
              return (
                <li key={e.key} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-surface"
                    style={{ background: who?.color ?? "var(--moss)" }}
                  >
                    {(who?.name ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{who?.name ?? "Alguien"}</span> {e.text}
                    </p>
                    <p className="text-xs text-ink-soft" suppressHydrationWarning>
                      {timeAgo(e.at, now)}
                    </p>
                  </div>
                  {isNew && <span className="size-2 shrink-0 rounded-full bg-hanko" aria-label="Nuevo" />}
                </li>
              );
            })}
          </ul>
        )}
      </BottomSheet>

      {/* Compartir el código del hogar */}
      <BottomSheet open={sheet === "compartir"} onClose={() => setSheet(null)} title="Invitar a tu pareja">
        <p className="mb-4 text-sm text-ink-soft">
          Pásale este código. Cuando cree su cuenta, solo tiene que elegir «Tengo un código».
        </p>
        <ShareCode code={inviteCode} householdName={householdName} />
      </BottomSheet>

      {/* Catálogo de widgets */}
      <BottomSheet open={sheet === "catalogo"} onClose={() => setSheet(null)} title="Agregar widget">
        <ul className="flex flex-col gap-2">
          {WIDGETS.map((def) => {
            const added = widgets.includes(def.id);
            return (
              <li key={def.id}>
                <button
                  disabled={added}
                  onClick={() => {
                    add(def.id);
                    setSheet(null);
                  }}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition active:scale-[0.99] disabled:opacity-60"
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: tint(def.color, 22), color: colorOf(def.color) }}
                  >
                    <def.icon size={22} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{def.label}</span>
                    <span className="block text-sm text-ink-soft">
                      {def.description}
                      {!def.available && " · Próximamente"}
                    </span>
                  </span>
                  {added ? <Check size={18} className="text-forest" /> : <Plus size={18} className="text-ink-soft" />}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </section>
  );
}

function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-ink-soft/40 text-ink-soft transition active:scale-[0.98] lg:min-h-52"
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-washi-deep">
        <Plus size={22} />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function WidgetCard({
  def,
  stats,
  editMode,
  onRemove,
}: {
  def: WidgetDef;
  stats: Stats;
  editMode: boolean;
  onRemove: () => void;
}) {
  const body = (
    <div
      className="flex h-full min-h-44 flex-col rounded-3xl border border-line p-4 lg:min-h-52 lg:p-5"
      style={{ background: tint(def.color) }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ background: tint(def.color, 28), color: colorOf(def.color) }}
        >
          <def.icon size={20} strokeWidth={1.75} />
        </span>
        <span className="font-display text-base font-bold">{def.label}</span>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <WidgetBody def={def} stats={stats} />
      </div>
    </div>
  );

  if (editMode) {
    return (
      <div className="relative">
        {body}
        <button
          onClick={onRemove}
          aria-label={`Quitar ${def.label}`}
          className="absolute -left-2 -top-2 flex size-10 items-center justify-center rounded-full bg-hanko text-surface shadow-md transition active:scale-90"
        >
          <Minus size={20} />
        </button>
      </div>
    );
  }

  return (
    <Link href={def.href} className="block transition active:scale-[0.98]">
      {body}
    </Link>
  );
}

function WidgetBody({ def, stats }: { def: WidgetDef; stats: Stats }) {
  if (def.id === "compras") {
    if (stats.pendingCount === 0) {
      return <p className="mt-auto font-display text-lg font-bold">Todo comprado</p>;
    }
    return (
      <>
        <p className="font-display text-4xl font-bold leading-none">{stats.pendingCount}</p>
        <p className="mt-1 text-sm text-ink-soft">{stats.pendingCount === 1 ? "producto por comprar" : "productos por comprar"}</p>
        <p className="mt-auto truncate pt-3 text-sm text-ink-soft">{stats.topPending.join(", ")}</p>
      </>
    );
  }

  if (def.id === "cocina") {
    if (stats.recipesCount === 0) {
      return <p className="mt-auto text-sm text-ink-soft">Guarden su primera receta.</p>;
    }
    return (
      <>
        <p className="font-display text-4xl font-bold leading-none">{stats.recipesCount}</p>
        <p className="mt-1 text-sm text-ink-soft">{stats.recipesCount === 1 ? "receta guardada" : "recetas guardadas"}</p>
        <p className="mt-auto truncate pt-3 text-sm text-ink-soft">
          {stats.favoritesCount > 0
            ? `${stats.favoritesCount} ${stats.favoritesCount === 1 ? "favorita" : "favoritas"}`
            : `Última: ${stats.lastRecipe}`}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-ink-soft">{def.description}</p>
      <span className="mt-auto w-fit rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-ink-soft">Próximamente</span>
    </>
  );
}
