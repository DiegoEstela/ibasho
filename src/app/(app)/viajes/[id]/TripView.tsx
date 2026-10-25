"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { TripCover } from "@/components/viajes/TripCover";
import { createClient } from "@/lib/supabase/client";
import { formatRange, tripDays, tripPhase } from "@/lib/viajes/dates";
import { listOfflineIds, removeOfflineDoc, saveDocOffline } from "@/lib/viajes/offline";
import { DocSheet } from "./DocSheet";
import { DocViewer, DocsTab } from "./DocsTab";
import { ListSheet } from "./ListSheet";
import { PlaceSheet } from "./PlaceSheet";
import { PlacesTab } from "./PlacesTab";
import { SummaryTab } from "./SummaryTab";
import { TripExpensesTab } from "./TripExpensesTab";
import { TripSheet } from "../TripSheet";
import { todayISO, type Trip, type TripDoc, type TripList, type TripPlace } from "../types";

type Props = {
  trip: Trip;
  coverUrl: string | null;
  householdId: string;
  userId: string;
  userEmail: string;
  initialLists: TripList[];
  initialPlaces: TripPlace[];
  initialDocs: TripDoc[];
};

type Tab = "resumen" | "lugares" | "documentos" | "gastos";

export function TripView({ trip, coverUrl, householdId, userId, userEmail, initialLists, initialPlaces, initialDocs }: Props) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [today] = useState(todayISO);

  const [lists, setLists] = useState(initialLists);
  const [places, setPlaces] = useState(initialPlaces);
  const [docs, setDocs] = useState(initialDocs);
  const [tab, setTab] = useState<Tab>("resumen");

  const [tripSheet, setTripSheet] = useState(false);
  const [listSheet, setListSheet] = useState<{ open: boolean; list: TripList | null }>({ open: false, list: null });
  const [placeSheet, setPlaceSheet] = useState<{ open: boolean; place: TripPlace | null }>({ open: false, place: null });
  const [docSheet, setDocSheet] = useState<{ open: boolean; doc: TripDoc | null; type: string }>({ open: false, doc: null, type: "entrada" });
  const [viewDoc, setViewDoc] = useState<TripDoc | null>(null);

  // Copias de documentos guardadas en este teléfono para usarse sin conexión.
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const refreshOffline = useCallback(async () => setOfflineIds(await listOfflineIds()), []);
  useEffect(() => {
    let cancelled = false;
    listOfflineIds().then((ids) => {
      if (!cancelled) setOfflineIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOne(doc: TripDoc): Promise<string | null> {
    const result = await saveDocOffline(supabase, doc, trip.name);
    await refreshOffline();
    return result.ok ? null : result.message;
  }

  async function saveAll() {
    const missing = docs.filter((d) => !offlineIds.has(d.id));
    if (missing.length === 0) return;
    let failed = 0;
    setSaveProgress({ done: 0, total: missing.length, failed });
    for (const [i, doc] of missing.entries()) {
      const result = await saveDocOffline(supabase, doc, trip.name);
      if (!result.ok) failed++;
      setSaveProgress({ done: i + 1, total: missing.length, failed });
    }
    await refreshOffline();
    setSaveProgress(null);
  }

  const phase = tripPhase(trip.start_date, trip.end_date, today);
  const days = tripDays(trip.start_date, trip.end_date);

  // ---------- Sincronización: lo que añade una persona lo ve la otra ----------
  const refetch = useCallback(async () => {
    const [l, p, d] = await Promise.all([
      supabase.from("trip_lists").select("*").eq("trip_id", trip.id).order("position").order("created_at"),
      supabase.from("trip_places").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }),
      supabase.from("trip_documents").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }),
    ]);
    if (l.data) setLists(l.data as TripList[]);
    if (p.data) setPlaces(p.data as TripPlace[]);
    if (d.data) setDocs(d.data as TripDoc[]);
  }, [supabase, trip.id]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const filter = `trip_id=eq.${trip.id}`;
    const channel = supabase
      .channel(`viaje-${trip.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_lists", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_places", filter }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_documents", filter }, queue)
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
  }, [supabase, trip.id, refetch]);

  const closeAndRefresh = {
    list: () => { setListSheet({ open: false, list: null }); refetch(); },
    place: () => { setPlaceSheet({ open: false, place: null }); refetch(); },
    doc: () => { setDocSheet((s) => ({ ...s, open: false, doc: null })); setViewDoc(null); refetch(); },
  };

  const tabs: [Tab, string, number | null][] = [
    ["resumen", "Resumen", null],
    ["lugares", "Lugares", places.length],
    ["documentos", "Documentos", docs.length],
    ["gastos", "Gastos", null],
  ];

  return (
    <section className="max-w-[1500px]">
      {/* Portada */}
      <TripCover color={trip.color} coverUrl={coverUrl} className="flex min-h-44 flex-col justify-between rounded-3xl px-4 pb-4 pt-3 shadow-md lg:min-h-56 lg:px-6 lg:pb-6">
        <div className="flex items-center justify-between">
          <Link href="/viajes" aria-label="Volver a Viajes" className="flex size-10 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm">
            <ChevronLeft size={22} />
          </Link>
          <button onClick={() => setTripSheet(true)} aria-label="Editar el viaje" className="flex size-10 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm">
            <Pencil size={17} />
          </button>
        </div>

        <div>
          <div className="flex items-end gap-3">
            <span className="text-4xl drop-shadow-sm lg:text-5xl" aria-hidden>{trip.emoji || "🧳"}</span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold leading-tight drop-shadow-sm lg:text-4xl">{trip.name}</h1>
              {trip.destination && <p className="text-sm opacity-90">{trip.destination}</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="opacity-95">{formatRange(trip.start_date, trip.end_date)}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm ${phase.kind === "en-curso" ? "bg-white text-ink" : "bg-black/25"}`}>
              {phase.kind === "terminado" ? "Recuerdo" : phase.label}
            </span>
          </div>
        </div>
      </TripCover>

      {/* Pestañas */}
      <div className="mt-4 flex w-full gap-1 rounded-xl bg-washi-deep p-1 lg:w-fit" role="tablist" aria-label="Secciones del viaje">
        {tabs.map(([value, text, count]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition lg:flex-none lg:px-6 ${
              tab === value ? "bg-surface text-forest shadow-sm" : "text-ink-soft"
            }`}
          >
            {text}
            {count !== null && count > 0 && <span className="rounded-full bg-forest/15 px-2 text-xs text-forest">{count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "resumen" && (
          <SummaryTab
            trip={trip}
            lists={lists}
            places={places}
            docs={docs}
            today={today}
            onAddDoc={(type) => {
              setDocSheet({ open: true, doc: null, type });
            }}
            onOpenDoc={setViewDoc}
            onAddList={() => setListSheet({ open: true, list: null })}
            onEditList={(list) => setListSheet({ open: true, list })}
            onGoToPlaces={() => setTab("lugares")}
          />
        )}
        {tab === "lugares" && (
          <PlacesTab
            trip={trip}
            places={places}
            setPlaces={setPlaces}
            householdId={householdId}
            onEdit={(place) => setPlaceSheet({ open: true, place })}
            onNew={() => setPlaceSheet({ open: true, place: null })}
          />
        )}
        {tab === "gastos" && <TripExpensesTab trip={trip} householdId={householdId} userId={userId} userEmail={userEmail} />}
        {tab === "documentos" && (
          <DocsTab docs={docs} today={today} offlineIds={offlineIds} saveProgress={saveProgress} onSaveAll={saveAll} onOpen={setViewDoc} onNew={() => setDocSheet({ open: true, doc: null, type: "entrada" })} />
        )}
      </div>

      <TripSheet
        open={tripSheet}
        onClose={() => setTripSheet(false)}
        trip={trip}
        householdId={householdId}
        coverUrl={coverUrl}
        onSaved={() => {
          setTripSheet(false);
          router.refresh();
        }}
        onDeleted={() => router.push("/viajes")}
      />

      <ListSheet
        open={listSheet.open}
        onClose={() => setListSheet({ open: false, list: null })}
        list={listSheet.list}
        tripId={trip.id}
        householdId={householdId}
        position={lists.length}
        onSaved={closeAndRefresh.list}
      />

      <PlaceSheet
        open={placeSheet.open}
        onClose={() => setPlaceSheet({ open: false, place: null })}
        place={placeSheet.place}
        tripId={trip.id}
        householdId={householdId}
        days={days}
        onSaved={closeAndRefresh.place}
      />

      <DocSheet
        open={docSheet.open}
        onClose={() => setDocSheet((s) => ({ ...s, open: false, doc: null }))}
        doc={docSheet.doc}
        defaultType={docSheet.type}
        tripId={trip.id}
        householdId={householdId}
        onSaved={closeAndRefresh.doc}
      />

      <DocViewer
        doc={viewDoc}
        offline={!!viewDoc && offlineIds.has(viewDoc.id)}
        onSaveOffline={saveOne}
        onRemoveOffline={async (d) => {
          await removeOfflineDoc(d.id);
          await refreshOffline();
        }}
        onClose={() => setViewDoc(null)}
        onEdit={(doc) => {
          setViewDoc(null);
          setDocSheet({ open: true, doc, type: doc.doc_type });
        }}
        onDeleted={closeAndRefresh.doc}
      />
    </section>
  );
}
