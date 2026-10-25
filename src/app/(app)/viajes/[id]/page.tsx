import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { BUCKET } from "@/lib/viajes/storage";
import { createClient } from "@/lib/supabase/server";
import { TripView } from "./TripView";
import type { Trip, TripDoc, TripList, TripPlace } from "../types";

async function Viaje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ user, household }, trip, lists, places, docs] = await Promise.all([
    requireHousehold(),
    supabase.from("trips").select("id, household_id, name, destination, emoji, color, start_date, end_date, cover_path, notes, currency").eq("id", id).maybeSingle(),
    supabase.from("trip_lists").select("*").eq("trip_id", id).order("position").order("created_at"),
    supabase.from("trip_places").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
    supabase.from("trip_documents").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
  ]);

  if (trip.error) {
    console.error(`[viajes] leer el viaje: ${trip.error.code}: ${trip.error.message}`);
    return (
      <section>
        <PageHeader title="Viaje" back="/viajes" />
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
          No pudimos cargar el viaje ({trip.error.code}). Si dice que una tabla no existe, ejecuta la migración 0010 en Supabase.
        </p>
      </section>
    );
  }
  if (!trip.data) notFound();

  const data = trip.data as Trip;
  const signed = data.cover_path ? await supabase.storage.from(BUCKET).createSignedUrl(data.cover_path, 3600) : null;

  return (
    <TripView
      trip={data}
      coverUrl={signed?.data?.signedUrl ?? null}
      householdId={household.id}
      userId={user.id}
      userEmail={user.email}
      initialLists={(lists.data ?? []) as TripList[]}
      initialPlaces={(places.data ?? []) as TripPlace[]}
      initialDocs={(docs.data ?? []) as TripDoc[]}
    />
  );
}

export default function ViajePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Viaje params={params} />
    </Suspense>
  );
}
