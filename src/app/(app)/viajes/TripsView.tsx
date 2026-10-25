"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { tripPhase } from "@/lib/viajes/dates";
import { TripCard } from "./TripCard";
import { TripSheet } from "./TripSheet";
import { todayISO, type Trip } from "./types";

export type TripWithCounts = Trip & { coverUrl: string | null; places: number; documents: number };

type Props = { householdId: string; trips: TripWithCounts[] };

export function TripsView({ householdId, trips }: Props) {
  const router = useRouter();
  const [today] = useState(todayISO);
  const [sheetOpen, setSheetOpen] = useState(false);

  const withPhase = trips.map((t) => ({ trip: t, phase: tripPhase(t.start_date, t.end_date, today) }));
  const live = withPhase
    .filter((x) => x.phase.kind === "en-curso")
    .sort((a, b) => (a.trip.start_date ?? "").localeCompare(b.trip.start_date ?? ""));
  const upcoming = withPhase
    .filter((x) => x.phase.kind === "proximo")
    .sort((a, b) => (a.trip.start_date ?? "").localeCompare(b.trip.start_date ?? ""));
  const undated = withPhase.filter((x) => x.phase.kind === "sin-fechas");
  const past = withPhase
    .filter((x) => x.phase.kind === "terminado")
    .sort((a, b) => (b.trip.start_date ?? "").localeCompare(a.trip.start_date ?? ""));

  const section = (title: string, list: typeof withPhase) =>
    list.length > 0 && (
      <div key={title}>
        <h2 className="mb-3 px-1 font-display text-base font-bold text-ink-soft lg:text-lg">{title}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(({ trip }) => (
            <li key={trip.id}>
              <TripCard trip={trip} coverUrl={trip.coverUrl} places={trip.places} documents={trip.documents} today={today} />
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Viajes"
        subtitle={trips.length === 0 ? "Planifiquen juntos" : `${trips.length} ${trips.length === 1 ? "viaje" : "viajes"}`}
        actions={
          <button
            onClick={() => setSheetOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> Nuevo viaje
          </button>
        }
      />

      {trips.length === 0 ? (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center lg:mt-10">
          <span className="text-5xl" aria-hidden>
            🧳
          </span>
          <div>
            <p className="font-display text-xl font-bold">El primer viaje de ustedes</p>
            <p className="mt-1 text-sm text-ink-soft">
              Guarden sus listas de Google Maps, los lugares que quieren visitar y todas las entradas y reservas en un solo sitio.
            </p>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95"
          >
            Planificar un viaje
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-7">
          {section("De viaje ahora", live)}
          {section("Próximos viajes", upcoming)}
          {section("Sin fechas todavía", undated)}
          {section("Recuerdos", past)}
        </div>
      )}

      <TripSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        trip={null}
        householdId={householdId}
        coverUrl={null}
        onSaved={(id) => {
          setSheetOpen(false);
          router.push(`/viajes/${id}`);
        }}
        onDeleted={() => setSheetOpen(false)}
      />
    </section>
  );
}
