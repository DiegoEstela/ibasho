import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { BUCKET } from "@/lib/viajes/storage";
import { createClient } from "@/lib/supabase/server";
import { TripsView, type TripWithCounts } from "./TripsView";
import type { Trip } from "./types";

function Unavailable({ step, detail }: { step: string; detail: string }) {
  console.error(`[viajes] ${step}: ${detail}`);
  return (
    <section>
      <PageHeader title="Viajes" />
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
        <p className="font-medium text-ink">No pudimos cargar los viajes.</p>
        <p className="mt-2">Paso que falló: <span className="font-mono">{step}</span></p>
        <p className="mt-1 break-words font-mono text-xs">{detail}</p>
        <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0010 en Supabase.</p>
      </div>
    </section>
  );
}

type Row = Trip & { trip_places: { count: number }[]; trip_documents: { count: number }[] };

async function Viajes() {
  const supabase = await createClient();

  const [{ household }, trips] = await Promise.all([
    requireHousehold(),
    supabase
      .from("trips")
      .select("id, household_id, name, destination, emoji, color, start_date, end_date, cover_path, notes, currency, trip_places(count), trip_documents(count)")
      .order("start_date", { ascending: true, nullsFirst: false }),
  ]);
  if (trips.error) return <Unavailable step="leer los viajes" detail={`${trips.error.code}: ${trips.error.message}`} />;

  const rows = (trips.data ?? []) as unknown as Row[];

  // Las portadas están en un almacenamiento privado: se piden enlaces temporales.
  const paths = rows.map((r) => r.cover_path).filter((p): p is string => !!p);
  const signed = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const withCounts: TripWithCounts[] = rows.map((r) => ({
    id: r.id,
    household_id: r.household_id,
    name: r.name,
    destination: r.destination,
    emoji: r.emoji,
    color: r.color,
    start_date: r.start_date,
    end_date: r.end_date,
    cover_path: r.cover_path,
    notes: r.notes,
    currency: r.currency ?? "EUR",
    coverUrl: r.cover_path ? (urlByPath.get(r.cover_path) ?? null) : null,
    places: r.trip_places?.[0]?.count ?? 0,
    documents: r.trip_documents?.[0]?.count ?? 0,
  }));

  return <TripsView householdId={household.id} trips={withCounts} />;
}

export default function ViajesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Viajes />
    </Suspense>
  );
}
