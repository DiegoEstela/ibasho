import Link from "next/link";
import { FileText, MapPin } from "lucide-react";
import { TripCover } from "@/components/viajes/TripCover";
import { tripPhase } from "@/lib/viajes/dates";
import { formatRange } from "@/lib/viajes/dates";
import type { Trip } from "./types";

type Props = {
  trip: Trip;
  coverUrl: string | null;
  places: number;
  documents: number;
  today: string;
};

/** Cada viaje como un boleto de tren: portada arriba, perforación y los datos abajo. */
export function TripCard({ trip, coverUrl, places, documents, today }: Props) {
  const phase = tripPhase(trip.start_date, trip.end_date, today);
  const past = phase.kind === "terminado";

  return (
    <Link
      href={`/viajes/${trip.id}`}
      className={`group relative block overflow-hidden rounded-3xl bg-surface shadow-md ring-1 ring-line transition active:scale-[0.99] ${past ? "opacity-90" : ""}`}
    >
      <TripCover color={trip.color} coverUrl={coverUrl} className="h-32 px-4 pb-3 pt-4 lg:h-36">
        <div className="flex items-start justify-between gap-3">
          <span className="text-4xl drop-shadow-sm" aria-hidden>
            {trip.emoji || "🧳"}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm ${
              phase.kind === "en-curso" ? "bg-white text-ink" : "bg-black/25 text-white"
            }`}
          >
            {past ? "Recuerdo" : phase.label}
          </span>
        </div>
      </TripCover>

      {/* Perforación del boleto */}
      <div className="relative h-0" aria-hidden>
        <span className="absolute -left-3 top-0 size-6 -translate-y-1/2 rounded-full bg-background" />
        <span className="absolute -right-3 top-0 size-6 -translate-y-1/2 rounded-full bg-background" />
        <span className="absolute inset-x-5 top-0 border-t-2 border-dashed border-line" />
      </div>

      <div className="px-4 pb-4 pt-5">
        <h3 className="font-display text-lg font-bold leading-tight">{trip.name}</h3>
        {trip.destination && <p className="text-sm text-ink-soft">{trip.destination}</p>}

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-soft">
          <span>{formatRange(trip.start_date, trip.end_date)}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <MapPin size={13} /> {places}
            </span>
            <span className="flex items-center gap-1">
              <FileText size={13} /> {documents}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
