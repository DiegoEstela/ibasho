"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CloudOff, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { colorFor, tint } from "@/lib/compras/icons";
import { createClient } from "@/lib/supabase/client";
import { VAULT_CATEGORIES, vaultCategory } from "@/lib/baul/categories";
import { listOfflineIds, removeOfflineDoc, saveDocOffline } from "@/lib/viajes/offline";
import { formatDate, formatTime, todayISO } from "../viajes/types";
import { OFFLINE_FOLDER, OFFLINE_NAME, type VaultDoc } from "./types";
import { VaultForm, VaultViewer } from "./VaultSheets";

type Props = { householdId: string; initialDocs: VaultDoc[] };

const byDateAsc = (a: VaultDoc, b: VaultDoc) => ((a.doc_date ?? "") + (a.doc_time ?? "")).localeCompare((b.doc_date ?? "") + (b.doc_time ?? ""));
const byDateDesc = (a: VaultDoc, b: VaultDoc) => byDateAsc(b, a);

const savable = (d: VaultDoc) => ({ ...d, trip_id: OFFLINE_FOLDER, doc_type: d.category });

export function BaulView({ householdId, initialDocs }: Props) {
  const [supabase] = useState(() => createClient());
  const [docs, setDocs] = useState(initialDocs);
  const [today] = useState(todayISO);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [form, setForm] = useState<{ open: boolean; doc: VaultDoc | null }>({ open: false, doc: null });
  const [viewing, setViewing] = useState<VaultDoc | null>(null);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);

  const refreshOffline = useCallback(async () => setOfflineIds(await listOfflineIds()), []);
  useEffect(() => {
    listOfflineIds().then(setOfflineIds);
  }, []);

  // ---------- Sincronización: lo que guarda una persona lo ve la otra ----------
  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("vault_documents")
      .select("id, name, category, doc_date, doc_time, file_path, file_name, mime_type, size_bytes, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data) setDocs(data as VaultDoc[]);
  }, [supabase]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const queue = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 350);
    };
    const channel = supabase
      .channel(`baul-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_documents", filter: `household_id=eq.${householdId}` }, queue)
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

  // ---------- Sin conexión ----------
  async function saveOffline(doc: VaultDoc): Promise<string | null> {
    const result = await saveDocOffline(supabase, savable(doc), OFFLINE_NAME);
    await refreshOffline();
    return result.ok ? null : result.message;
  }

  async function removeOffline(doc: VaultDoc) {
    await removeOfflineDoc(doc.id);
    await refreshOffline();
  }

  const missing = docs.filter((d) => !offlineIds.has(d.id));
  async function saveAll() {
    if (missing.length === 0) return;
    setSaveProgress({ done: 0, total: missing.length });
    for (const [i, doc] of missing.entries()) {
      await saveDocOffline(supabase, savable(doc), OFFLINE_NAME);
      setSaveProgress({ done: i + 1, total: missing.length });
    }
    await refreshOffline();
    setSaveProgress(null);
  }

  // ---------- Lista ----------
  const { upcoming, undated, past, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = docs.filter((d) => (!category || d.category === category) && (!q || `${d.name} ${d.notes ?? ""}`.toLowerCase().includes(q)));
    return {
      upcoming: shown.filter((d) => d.doc_date && d.doc_date >= today).sort(byDateAsc),
      undated: shown.filter((d) => !d.doc_date),
      past: shown.filter((d) => d.doc_date && d.doc_date < today).sort(byDateDesc),
      total: shown.length,
    };
  }, [docs, category, query, today]);

  function card(d: VaultDoc, faded = false) {
    const c = vaultCategory(d.category);
    const Icon = c.icon;
    const isToday = d.doc_date === today;
    return (
      <li key={d.id}>
        <button
          onClick={() => setViewing(d)}
          className={`relative flex min-h-[68px] w-full items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface py-2.5 pl-4 pr-3 text-left shadow-sm transition active:scale-[0.99] ${faded ? "opacity-70" : ""}`}
        >
          <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: colorFor(c.color) }} aria-hidden />
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(c.color), color: colorFor(c.color) }}>
            <Icon size={20} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{d.name}</span>
            <span className="block truncate text-xs text-ink-soft">
              {c.label}
              {d.doc_date && ` · ${formatDate(d.doc_date)}`}
              {d.doc_time && ` · ${formatTime(d.doc_time)}`}
            </span>
          </span>
          {offlineIds.has(d.id) && <CloudOff size={14} className="shrink-0 text-forest" aria-label="Disponible sin conexión" />}
          {isToday && <span className="shrink-0 rounded-full bg-hanko px-2 py-0.5 text-[11px] font-bold text-white">Hoy</span>}
        </button>
      </li>
    );
  }

  const section = (title: string, list: VaultDoc[], faded = false) =>
    list.length > 0 && (
      <div className="mt-4">
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-ink-soft">{title}</h2>
        <ul className="grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3">{list.map((d) => card(d, faded))}</ul>
      </div>
    );

  return (
    <section className="max-w-[1500px]">
      <PageHeader
        title="Baúl"
        subtitle="Tus entradas y documentos a mano"
        actions={
          <button
            onClick={() => setForm({ open: true, doc: null })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> Guardar
          </button>
        }
      />

      {docs.length === 0 ? (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-8 text-center">
          <span className="text-4xl" aria-hidden>🎟️</span>
          <p className="font-display text-lg font-bold">Tu cartera de documentos</p>
          <p className="text-sm text-ink-soft">
            Guarda aquí el tren del fin de semana, las entradas del cine, una reserva o un papel del médico. Quedan ordenados por fecha y los puedes tener sin conexión.
          </p>
          <button onClick={() => setForm({ open: true, doc: null })} className="mt-1 min-h-11 rounded-2xl bg-forest px-6 text-sm font-medium text-surface shadow-sm transition active:scale-95">
            Guardar el primero
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar un documento"
              aria-label="Buscar un documento"
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-base outline-none placeholder:text-ink-soft/70 focus:border-forest lg:max-w-md"
            />
          </div>

          <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCategory("")}
              aria-pressed={!category}
              className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition ${!category ? "border-forest bg-forest/15 text-forest" : "border-line bg-surface text-ink-soft"}`}
            >
              Todos · {docs.length}
            </button>
            {VAULT_CATEGORIES.filter((c) => docs.some((d) => d.category === c.key)).map((c) => {
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
          </div>

          <button
            onClick={saveAll}
            disabled={!!saveProgress || missing.length === 0}
            className={`mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition active:scale-[0.99] lg:w-auto ${
              missing.length === 0 ? "border-forest/30 bg-forest/10 text-forest" : "border-line bg-surface text-forest"
            } disabled:cursor-default`}
          >
            {saveProgress ? (
              <>Guardando {saveProgress.done} de {saveProgress.total}…</>
            ) : missing.length === 0 ? (
              <><Check size={16} /> Todo guardado para usar sin conexión</>
            ) : (
              <><CloudOff size={16} /> Guardar {missing.length === docs.length ? "todo" : `los ${missing.length} que faltan`} sin conexión</>
            )}
          </button>

          {total === 0 && <p className="mt-6 text-center text-sm text-ink-soft">No hay documentos con esa búsqueda.</p>}

          {section("Próximos", upcoming)}
          {section("Sin fecha", undated)}

          {past.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="mb-2 flex min-h-10 items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wider text-ink-soft"
              >
                Pasados · {past.length}
                <ChevronDown size={14} className={`transition ${showPast ? "rotate-180" : ""}`} />
              </button>
              {showPast && <ul className="grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3">{past.map((d) => card(d, true))}</ul>}
            </div>
          )}
        </>
      )}

      <VaultForm
        open={form.open}
        onClose={() => setForm({ open: false, doc: null })}
        doc={form.doc}
        householdId={householdId}
        onSaved={() => {
          setForm({ open: false, doc: null });
          setViewing(null);
          refetch();
        }}
      />

      <VaultViewer
        doc={viewing}
        offline={!!viewing && offlineIds.has(viewing.id)}
        onSaveOffline={saveOffline}
        onRemoveOffline={removeOffline}
        onClose={() => setViewing(null)}
        onEdit={(d) => {
          setViewing(null);
          setForm({ open: true, doc: d });
        }}
        onDeleted={() => {
          setViewing(null);
          refetch();
          refreshOffline();
        }}
      />
    </section>
  );
}
