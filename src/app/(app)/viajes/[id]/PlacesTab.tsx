"use client";

import { useState } from "react";
import { Check, Heart, MapPin, Plus } from "lucide-react";
import { colorFor, tint } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { PLACE_CATEGORIES, placeCategory } from "@/lib/viajes/categories";
import { dayLabel, tripDays } from "@/lib/viajes/dates";
import { extractUrl, mapsSearchUrl, normalizeUrl } from "@/lib/viajes/maps";
import type { Trip, TripPlace } from "../types";

type Props = {
  trip: Trip;
  places: TripPlace[];
  setPlaces: React.Dispatch<React.SetStateAction<TripPlace[]>>;
  householdId: string;
  onEdit: (place: TripPlace) => void;
  onNew: () => void;
};

type View = "categoria" | "dia";

export function PlacesTab({ trip, places, setPlaces, householdId, onEdit, onNew }: Props) {
  const [supabase] = useState(() => createClient());
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<View>("categoria");
  const [error, setError] = useState("");

  const shown = places.filter((p) => !category || p.category === category);

  /** Añade un lugar al instante: acepta solo el nombre, o un enlace de Maps (con o sin texto). */
  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setError("");

    const found = extractUrl(value);
    const url = found ? normalizeUrl(found) : null;
    const name = (found ? value.replace(found, "") : value).replace(/\s+/g, " ").trim() || "Lugar guardado";

    setText("");
    const { data, error: insertError } = await supabase
      .from("trip_places")
      .insert({ trip_id: trip.id, household_id: householdId, name, category: "otro", maps_url: url })
      .select()
      .single();
    if (insertError || !data) return setError("No se pudo añadir el lugar. Revisa tu conexión.");
    setPlaces((prev) => (prev.some((p) => p.id === data.id) ? prev : [data as TripPlace, ...prev]));
  }

  async function patch(place: TripPlace, change: Partial<Pick<TripPlace, "done" | "favorite">>) {
    setPlaces((prev) => prev.map((p) => (p.id === place.id ? { ...p, ...change } : p)));
    const { error: updateError } = await supabase.from("trip_places").update(change).eq("id", place.id);
    if (updateError) setPlaces((prev) => prev.map((p) => (p.id === place.id ? place : p)));
  }

  const row = (place: TripPlace) => {
    const c = placeCategory(place.category);
    const Icon = c.icon;
    return (
      <li key={place.id} className="flex min-h-14 items-center">
        <button
          onClick={() => patch(place, { done: !place.done })}
          aria-label={place.done ? `Marcar «${place.name}» como pendiente` : `Marcar «${place.name}» como hecho`}
          aria-pressed={place.done}
          className="flex size-12 shrink-0 items-center justify-center"
        >
          <span
            className={`flex size-6 items-center justify-center rounded-full border-2 transition ${
              place.done ? "check-pop border-forest bg-forest text-surface" : "border-ink-soft/50"
            }`}
          >
            {place.done && <Check size={14} strokeWidth={3} />}
          </span>
        </button>

        <button onClick={() => onEdit(place)} className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(c.color), color: colorFor(c.color) }}>
            <Icon size={18} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[15px] ${place.done ? "text-ink-soft line-through" : ""}`}>{place.name}</span>
            {(place.note || (view === "categoria" && place.planned_day)) && (
              <span className="block truncate text-xs text-ink-soft">
                {[view === "categoria" && place.planned_day ? dayLabel(place.planned_day) : null, place.note].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        </button>

        <button
          onClick={() => patch(place, { favorite: !place.favorite })}
          aria-label={place.favorite ? `Quitar «${place.name}» de favoritos` : `Marcar «${place.name}» como favorito`}
          aria-pressed={place.favorite}
          className="flex size-10 shrink-0 items-center justify-center"
        >
          <Heart size={18} className={place.favorite ? "fill-hanko text-hanko" : "text-ink-soft/60"} />
        </button>

        <a
          href={place.maps_url ?? mapsSearchUrl(place.name, trip.destination)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ver «${place.name}» en el mapa`}
          className="mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-forest"
        >
          <MapPin size={18} />
        </a>
      </li>
    );
  };

  const group = (key: string, title: React.ReactNode, list: TripPlace[]) => (
    <div key={key}>
      <h3 className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft lg:text-xs">{title}</h3>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{list.map(row)}</ul>
    </div>
  );

  // Vista por categoría
  const byCategory = PLACE_CATEGORIES.map((c) => ({ c, list: shown.filter((p) => p.category === c.key) })).filter((x) => x.list.length > 0);

  // Vista por día: los días del viaje que tienen lugares, y al final los que aún no tienen día.
  const days = [...new Set([...tripDays(trip.start_date, trip.end_date), ...shown.map((p) => p.planned_day).filter((d): d is string => !!d)])].sort();
  const byDay = days.map((d) => ({ d, list: shown.filter((p) => p.planned_day === d) })).filter((x) => x.list.length > 0);
  const unplanned = shown.filter((p) => !p.planned_day);

  return (
    <div>
      <form onSubmit={quickAdd} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Añadir un lugar o pegar un enlace de Maps…"
          aria-label="Añadir un lugar"
          enterKeyHint="done"
          autoComplete="off"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest"
        />
        <button aria-label="Añadir" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest text-surface shadow-sm transition active:scale-95">
          <Plus size={22} />
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-hanko">{error}</p>}

      <div className="mt-3 flex items-center gap-2 chip-row">
        <button
          onClick={() => setCategory("")}
          aria-pressed={!category}
          className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition ${!category ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"}`}
        >
          Todos
        </button>
        {PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c.key)).map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(category === c.key ? "" : c.key)}
              aria-pressed={category === c.key}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                category === c.key ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"
              }`}
            >
              <Icon size={13} style={{ color: colorFor(c.color) }} /> {c.label}
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px shrink-0 bg-line" />
        {(
          [
            ["categoria", "Por tipo"],
            ["dia", "Por día"],
          ] as const
        ).map(([value, text2]) => (
          <button
            key={value}
            onClick={() => setView(value)}
            aria-pressed={view === value}
            className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition ${view === value ? "bg-ink text-background" : "text-ink-soft"}`}
          >
            {text2}
          </button>
        ))}
      </div>

      {places.length === 0 ? (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            📍
          </span>
          <p className="font-display text-lg font-bold">Los lugares que no se quieren perder</p>
          <p className="text-sm text-ink-soft">
            Escribe un nombre arriba, o pega el enlace que copias de Google Maps. Después los marcan como hechos, favoritos o los asignan a un día.
          </p>
          <button onClick={onNew} className="min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95">
            Añadir con más detalle
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No hay lugares de este tipo.</p>
      ) : view === "categoria" ? (
        <div className="mt-3 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {byCategory.map(({ c, list }) => {
            const Icon = c.icon;
            return group(c.key, <><Icon size={13} style={{ color: colorFor(c.color) }} /> {c.label} · {list.length}</>, list);
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {byDay.map(({ d, list }) => group(d, dayLabel(d), list))}
          {unplanned.length > 0 && group("sin-dia", <>Sin día asignado · {unplanned.length}</>, unplanned)}
        </div>
      )}
    </div>
  );
}
