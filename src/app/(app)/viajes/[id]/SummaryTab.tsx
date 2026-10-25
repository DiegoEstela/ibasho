"use client";

import { Check, ChevronRight, ExternalLink, Heart, Pencil, Plus } from "lucide-react";
import { colorFor, tint } from "@/lib/compras/icons";
import { docType, placeCategory, preparationStatus } from "@/lib/viajes/categories";
import { addDays } from "@/lib/viajes/dates";
import { isGoogleMaps, mapsSearchUrl } from "@/lib/viajes/maps";
import { formatDate, formatTime, type Trip, type TripDoc, type TripList, type TripPlace } from "../types";

type Props = {
  trip: Trip;
  lists: TripList[];
  places: TripPlace[];
  docs: TripDoc[];
  today: string;
  onAddDoc: (type: string) => void;
  onOpenDoc: (doc: TripDoc) => void;
  onAddList: () => void;
  onEditList: (list: TripList) => void;
  onGoToPlaces: () => void;
};

const card = "rounded-2xl border border-line bg-surface p-4 lg:p-5";
const heading = "mb-2.5 font-display text-base font-bold lg:text-lg";

export function SummaryTab({ trip, lists, places, docs, today, onAddDoc, onOpenDoc, onAddList, onEditList, onGoToPlaces }: Props) {
  const prep = preparationStatus(docs.map((d) => d.doc_type));
  const percent = Math.round((prep.done / prep.total) * 100);

  // Lo que se necesita en los próximos dos días (o hoy, si ya se está de viaje).
  const limit = addDays(today, 2);
  const soon = docs
    .filter((d) => d.doc_date && d.doc_date >= today && d.doc_date <= limit)
    .sort((a, b) => (a.doc_date! + (a.doc_time ?? "")).localeCompare(b.doc_date! + (b.doc_time ?? "")));

  const favorites = places.filter((p) => p.favorite);
  const done = places.filter((p) => p.done).length;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {/* Preparación del viaje */}
      <section className={card}>
        <h2 className={heading}>Preparación del viaje</h2>
        <div className="flex items-center gap-4">
          <div
            className="relative flex size-20 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(var(--forest) ${percent}%, var(--line) 0)` }}
            role="img"
            aria-label={`${prep.done} de ${prep.total} listos`}
          >
            <div className="flex size-[4.1rem] flex-col items-center justify-center rounded-full bg-surface">
              <span className="font-display text-lg font-bold leading-none">{prep.done}/{prep.total}</span>
              <span className="text-[10px] text-ink-soft">listos</span>
            </div>
          </div>
          <ul className="flex min-w-0 flex-1 flex-col gap-1">
            {prep.items.map((item) => (
              <li key={item.key}>
                <button
                  onClick={() => !item.done && onAddDoc(item.types[0])}
                  disabled={item.done}
                  className="flex min-h-9 w-full items-center gap-2 text-left text-sm disabled:cursor-default"
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      item.done ? "border-forest bg-forest text-surface" : "border-ink-soft/40"
                    }`}
                  >
                    {item.done && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className={item.done ? "text-ink-soft line-through" : ""}>{item.label}</span>
                  {!item.done && <span className="ml-auto flex items-center text-xs text-forest">Subir <ChevronRight size={14} /></span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-2 text-xs text-ink-soft">Se marca solo cuando guardas el documento correspondiente.</p>
      </section>

      {/* Lo que se necesita pronto */}
      {soon.length > 0 && (
        <section className={card}>
          <h2 className={heading}>Lo que necesitas pronto</h2>
          <ul className="flex flex-col gap-2">
            {soon.map((d) => {
              const t = docType(d.doc_type);
              const Icon = t.icon;
              return (
                <li key={d.id}>
                  <button onClick={() => onOpenDoc(d)} className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-background px-3 py-2 text-left transition active:scale-[0.99]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(t.color), color: colorFor(t.color) }}>
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{d.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {d.doc_date === today ? "Hoy" : formatDate(d.doc_date!)}
                        {d.doc_time && ` · ${formatTime(d.doc_time)}`}
                      </span>
                    </span>
                    <ChevronRight size={18} className="text-ink-soft" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Listas de Google Maps */}
      <section className={`${card} lg:col-span-2`}>
        <h2 className={heading}>Listas de Google Maps</h2>
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((l) => (
            <li key={l.id} className="flex items-stretch overflow-hidden rounded-2xl border border-line bg-background">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition active:scale-[0.99]"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky/25 text-2xl" aria-hidden>
                  {l.emoji || "📍"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-bold">{l.name}</span>
                  <span className="flex items-center gap-1 text-xs text-forest">
                    {isGoogleMaps(l.url) ? "Abrir en Google Maps" : "Abrir enlace"} <ExternalLink size={12} />
                  </span>
                </span>
              </a>
              <button
                onClick={() => onEditList(l)}
                aria-label={`Editar ${l.name}`}
                className="flex w-11 shrink-0 items-center justify-center border-l border-line text-ink-soft"
              >
                <Pencil size={15} />
              </button>
            </li>
          ))}
          <li>
            <button
              onClick={onAddList}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-dashed border-ink-soft/40 px-3 text-left text-sm text-ink-soft transition active:scale-[0.99]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-washi-deep">
                <Plus size={20} />
              </span>
              <span>
                <span className="block font-medium text-ink">Añadir una lista de Maps</span>
                <span className="block text-xs">Por ejemplo «Mis lugares de Japón»</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      {/* Favoritos y avance de los lugares */}
      {places.length > 0 && (
        <section className={`${card} lg:col-span-2`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={heading}>Lugares</h2>
            <button onClick={onGoToPlaces} className="mb-2.5 flex items-center text-sm font-medium text-forest">
              Ver todos <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-washi-deep">
              <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${(done / places.length) * 100}%` }} />
            </div>
            <span className="shrink-0 text-xs text-ink-soft">{done} de {places.length} visitados</span>
          </div>

          {favorites.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {favorites.slice(0, 8).map((p) => {
                const c = placeCategory(p.category);
                const Icon = c.icon;
                return (
                  <li key={p.id}>
                    <a
                      href={p.maps_url ?? mapsSearchUrl(p.name, trip.destination)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-background px-3 text-[13px]"
                    >
                      <Heart size={13} className="fill-hanko text-hanko" />
                      <Icon size={13} style={{ color: colorFor(c.color) }} />
                      {p.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
