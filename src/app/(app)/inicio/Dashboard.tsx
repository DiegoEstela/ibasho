"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, Check, House, Minus, Pencil, Plus, Share2, Trash2, X } from "lucide-react";
import { ShareCode } from "@/components/onboarding/ShareCode";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";
import { formatEUR } from "@/lib/gastos/money";
import { timeAgo } from "@/lib/utils/time";
import { formatRange, tripPhase } from "@/lib/viajes/dates";
import { CuentasButton } from "./CuentasButton";
import { Reminders, type ReminderTask } from "./Reminders";
import { MIN_SLOTS, WIDGETS, type WidgetDef, type WidgetId } from "./catalog";

export type Stats = {
  wishlist: { count: number; top: string | null };
  notas: { count: number; latest: string | null };
  tareas: { overdue: number; today: number; first: string | null };
  viajes: { id: string; name: string; emoji: string | null; start_date: string | null; end_date: string | null }[];
  mensajes: { hasPartner: boolean; unread: number; latest: { body: string; from: string } | null };
  tarjeta: { hasData: boolean; pendingCents: number; nextDue: string | null; nextCents: number };
  gastos: { state: "none" | "even" | "owe" | "owed"; cents: number; name: string | null };
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
  householdName: string;
  inviteCode: string;
  initialWidgets: WidgetId[];
  stats: Stats;
  recentItems: RecentItem[];
  members: Member[];
  /** Tareas de esta semana (y atrasadas) de quien mira. */
  reminders: ReminderTask[];
  /** Hoy en España ("aaaa-mm-dd"), el mismo día con el que se calculó la semana. */
  madridToday: string;
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

// Novedades que ya se borraron en este dispositivo (se guardan sus claves).
const DISMISSED_KEY = "ibasho.avisos.borrados";
const dismissedListeners = new Set<() => void>();
let dismissedInMemory: string | null = null;

function subscribeDismissed(callback: () => void) {
  dismissedListeners.add(callback);
  return () => dismissedListeners.delete(callback);
}

function getDismissed(): string {
  if (dismissedInMemory !== null) return dismissedInMemory;
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function setDismissed(keys: string[]) {
  // Solo se recuerdan las últimas, para que la lista no crezca sin fin.
  dismissedInMemory = JSON.stringify(keys.slice(-200));
  try {
    localStorage.setItem(DISMISSED_KEY, dismissedInMemory);
  } catch {
    // Ignorar: borrar es una comodidad del navegador.
  }
  dismissedListeners.forEach((listener) => listener());
}

const colorOf = (key: string) => `var(--${key})`;
const tint = (key: string, percent = 16) => `color-mix(in srgb, ${colorOf(key)} ${percent}%, var(--surface))`;

export function Dashboard({
  userId,
  householdName,
  inviteCode,
  initialWidgets,
  stats,
  recentItems,
  members,
  reminders,
  madridToday,
}: Props) {
  const [supabase] = useState(() => createClient());
  const [now] = useState(() => Date.now());
  // Hoy según el dispositivo ("aaaa-mm-dd"), para calcular cuenta atrás y fases de los viajes.
  const today = (() => {
    const d = new Date(now);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
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

  const dismissedRaw = useSyncExternalStore(subscribeDismissed, getDismissed, () => "[]");
  const dismissed = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(dismissedRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [dismissedRaw]);
  const visibleEvents = useMemo(() => events.filter((e) => !dismissed.includes(e.key)), [events, dismissed]);

  const unread = visibleEvents.filter((e) => new Date(e.at).getTime() > seen).length;
  const member = (id: string) => members.find((m) => m.id === id);

  const dismissEvent = (key: string) => setDismissed([...dismissed, key]);
  const dismissAll = () => setDismissed([...dismissed, ...visibleEvents.map((e) => e.key)]);

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
    "relative flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90";

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2 lg:gap-3">
            <House className="size-5 shrink-0 text-forest lg:size-8" strokeWidth={1.75} aria-label="Hogar" />
            <span className="truncate">{householdName}</span>
          </span>
        }
        actions={
          <>
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
          </>
        }
      />

      <CuentasButton />

      <Reminders tasks={reminders} today={madridToday} />

      <div className="mt-3 flex items-center justify-between lg:mt-8">
        <h2 className="font-display text-base font-bold lg:text-xl">Mi resumen</h2>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-medium text-forest"
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

      <div className="mt-2 grid grid-cols-2 gap-2.5 lg:mt-3 lg:grid-cols-4 lg:gap-5">
        {chosen.map((def) => (
          <WidgetCard key={def.id} def={def} stats={stats} today={today} editMode={editMode} onRemove={() => remove(def.id)} />
        ))}

        {Array.from({ length: emptySlots }, (_, n) => (
          <AddTile key={`slot-${n}`} label="Agregar widget" onClick={() => setSheet("catalogo")} />
        ))}
        {emptySlots === 0 && canAddMore && <AddTile label="Agregar más" onClick={() => setSheet("catalogo")} />}
      </div>

      {/* Novedades */}
      <BottomSheet open={sheet === "avisos"} onClose={() => setSheet(null)} title="Novedades">
        {visibleEvents.length === 0 ? (
          <div className="py-6 text-center">
            <Bell className="mx-auto text-ink-soft" size={32} strokeWidth={1.5} />
            <p className="mt-3 font-display text-lg font-bold">Todo tranquilo</p>
            <p className="mt-1 text-sm text-ink-soft">
              Cuando tu pareja agregue o compre algo de la lista, lo verás aquí.
            </p>
          </div>
        ) : (
          <>
          <div className="mb-2 flex justify-end">
            <button onClick={dismissAll} className="flex min-h-9 items-center gap-1.5 px-2 text-sm text-hanko">
              <Trash2 size={15} /> Borrar todas
            </button>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {visibleEvents.map((e) => {
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
                  <button
                    onClick={() => dismissEvent(e.key)}
                    aria-label="Borrar esta novedad"
                    className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition active:scale-90"
                  >
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
          </>
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
      className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-soft/40 text-ink-soft transition active:scale-[0.98] lg:min-h-52 lg:rounded-3xl"
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
  today,
  editMode,
  onRemove,
}: {
  def: WidgetDef;
  stats: Stats;
  today: string;
  editMode: boolean;
  onRemove: () => void;
}) {
  const body = (
    <div
      className="flex h-full min-h-32 flex-col rounded-2xl border border-line p-3 lg:min-h-52 lg:rounded-3xl lg:p-5"
      style={{ background: tint(def.color) }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-8 items-center justify-center rounded-lg lg:size-10 lg:rounded-xl"
          style={{ background: tint(def.color, 28), color: colorOf(def.color) }}
        >
          <def.icon className="size-4 lg:size-5" strokeWidth={1.75} />
        </span>
        <span className="font-display text-sm font-bold lg:text-base">{def.label}</span>
      </div>
      <div className="mt-2 flex flex-1 flex-col lg:mt-3">
        <WidgetBody def={def} stats={stats} today={today} />
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

  // Un módulo que aún no existe no lleva a ninguna parte: la tarjeta solo informa.
  if (!def.available) return body;

  return (
    <Link href={def.href} className="block transition active:scale-[0.98]">
      {body}
    </Link>
  );
}

function WidgetBody({ def, stats, today }: { def: WidgetDef; stats: Stats; today: string }) {
  if (def.id === "compras") {
    if (stats.pendingCount === 0) {
      return <p className="mt-auto font-display text-lg font-bold">Todo comprado</p>;
    }
    return (
      <>
        <p className="font-display text-3xl font-bold leading-none lg:text-4xl">{stats.pendingCount}</p>
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
        <p className="font-display text-3xl font-bold leading-none lg:text-4xl">{stats.recipesCount}</p>
        <p className="mt-1 text-sm text-ink-soft">{stats.recipesCount === 1 ? "receta guardada" : "recetas guardadas"}</p>
        <p className="mt-auto truncate pt-3 text-sm text-ink-soft">
          {stats.favoritesCount > 0
            ? `${stats.favoritesCount} ${stats.favoritesCount === 1 ? "favorita" : "favoritas"}`
            : `Última: ${stats.lastRecipe}`}
        </p>
      </>
    );
  }

  if (def.id === "wishlist") {
    const w = stats.wishlist;
    if (w.count === 0) return <p className="mt-auto text-sm text-ink-soft">Anoten lo que sueñan tener.</p>;
    return (
      <>
        <p className="font-display text-3xl font-bold leading-none lg:text-4xl">{w.count}</p>
        <p className="mt-1 text-sm text-ink-soft">{w.count === 1 ? "deseo pendiente" : "deseos pendientes"}</p>
        {w.top && <p className="mt-auto truncate pt-3 text-sm text-ink-soft">♥ {w.top}</p>}
      </>
    );
  }

  if (def.id === "notas") {
    const n = stats.notas;
    if (n.count === 0) return <p className="mt-auto text-sm text-ink-soft">Guarden medidas y datos útiles de la casa.</p>;
    return (
      <>
        <p className="font-display text-3xl font-bold leading-none lg:text-4xl">{n.count}</p>
        <p className="mt-1 text-sm text-ink-soft">{n.count === 1 ? "nota guardada" : "notas guardadas"}</p>
        {n.latest && <p className="mt-auto truncate pt-3 text-sm text-ink-soft">{n.latest}</p>}
      </>
    );
  }

  if (def.id === "tareas") {
    const t = stats.tareas;
    const pending = t.overdue + t.today;
    if (pending === 0) return <p className="mt-auto font-display text-lg font-bold">Todo hecho por hoy 🌿</p>;
    return (
      <>
        <p className="font-display text-3xl font-bold leading-none lg:text-4xl">{pending}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {pending === 1 ? "tarea para hoy" : "tareas para hoy"}
          {t.overdue > 0 && <span className="text-hanko"> · {t.overdue} {t.overdue === 1 ? "atrasada" : "atrasadas"}</span>}
        </p>
        {t.first && <p className="mt-auto truncate pt-3 text-sm text-ink-soft">{t.first}</p>}
      </>
    );
  }

  if (def.id === "viajes") {
    // El que está en curso; si no hay, el próximo más cercano.
    const phases = stats.viajes.map((t) => ({ t, phase: tripPhase(t.start_date, t.end_date, today) }));
    const pick =
      phases.find((x) => x.phase.kind === "en-curso") ??
      phases.filter((x) => x.phase.kind === "proximo").sort((a, b) => (a.t.start_date ?? "").localeCompare(b.t.start_date ?? ""))[0] ??
      phases.find((x) => x.phase.kind === "sin-fechas");
    if (!pick) {
      return <p className="mt-auto text-sm text-ink-soft">{stats.viajes.length > 0 ? "Sin viajes por delante." : "Planifiquen su primer viaje."}</p>;
    }
    return (
      <>
        <p className="text-3xl leading-none" aria-hidden>{pick.t.emoji || "🧳"}</p>
        <p className="mt-2 line-clamp-2 font-display text-[15px] font-bold leading-snug">{pick.t.name}</p>
        <p className="mt-auto truncate pt-2 text-xs text-ink-soft">
          {pick.phase.label} · {formatRange(pick.t.start_date, pick.t.end_date)}
        </p>
      </>
    );
  }

  if (def.id === "mensajes") {
    const m = stats.mensajes;
    if (!m.hasPartner) return <p className="mt-auto text-sm text-ink-soft">Invita a tu pareja para dejarse notitas.</p>;
    if (!m.latest) return <p className="mt-auto text-sm text-ink-soft">Escribe la primera notita para tu pareja.</p>;
    return (
      <>
        {m.unread > 0 && (
          <span className="mb-1.5 w-fit rounded-full bg-hanko px-2 py-0.5 text-[11px] font-bold text-white">
            {m.unread === 1 ? "1 nueva" : `${m.unread} nuevas`}
          </span>
        )}
        <p className="line-clamp-3 text-[15px] leading-snug" style={{ fontFamily: "var(--font-note)" }}>
          «{m.latest.body}»
        </p>
        <p className="mt-auto truncate pt-2 text-xs text-ink-soft">— {m.latest.from}</p>
      </>
    );
  }

  if (def.id === "tarjeta") {
    const t = stats.tarjeta;
    if (!t.hasData) return <p className="mt-auto text-sm text-ink-soft">Agreguen su primera tarjeta.</p>;
    if (t.pendingCents === 0) return <p className="mt-auto font-display text-lg font-bold">Sin cuotas pendientes</p>;
    return (
      <>
        <p className="text-xs text-ink-soft">Te queda por pagar</p>
        <p className="font-display text-3xl font-bold leading-none lg:text-4xl">{formatEUR(t.pendingCents)}</p>
        <p className="mt-auto truncate pt-3 text-sm text-ink-soft">
          {t.nextDue ? `Próximo pago ${t.nextDue.slice(8, 10)}/${t.nextDue.slice(5, 7)} · ${formatEUR(t.nextCents)}` : ""}
        </p>
      </>
    );
  }

  if (def.id === "gastos") {
    const g = stats.gastos;
    if (g.state === "none") return <p className="mt-auto text-sm text-ink-soft">Apunten su primer gasto.</p>;
    if (g.state === "even") return <p className="mt-auto font-display text-lg font-bold">Están a mano</p>;
    return (
      <>
        <p className="text-xs text-ink-soft">{g.state === "owe" ? "Debes" : "Te deben"}</p>
        <p className={`font-display text-3xl font-bold leading-none lg:text-4xl ${g.state === "owe" ? "text-hanko" : "text-forest"}`}>
          {formatEUR(g.cents)}
        </p>
        <p className="mt-auto truncate pt-3 text-sm text-ink-soft">
          {g.name ? (g.state === "owe" ? `a ${g.name}` : `${g.name} te debe`) : "entre varias personas"}
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
