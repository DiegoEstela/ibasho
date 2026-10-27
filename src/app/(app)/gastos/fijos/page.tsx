import { Suspense } from "react";
import { GastosTabs } from "@/components/ui/GastosTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import type { Fixed, FixedEntry } from "@/lib/fijos/schedule";
import { createClient } from "@/lib/supabase/server";
import type { Card, Person } from "../tarjetas/types";
import { FixedView } from "./FixedView";

function Unavailable({ step, detail }: { step: string; detail: string }) {
  console.error(`[fijos] ${step}: ${detail}`);
  return (
    <section>
      <PageHeader title="Gastos" subtitle="Gastos fijos" />
      <GastosTabs active="fijos" />
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
        <p className="font-medium text-ink">No pudimos cargar los gastos fijos.</p>
        <p className="mt-2">
          Paso que falló: <span className="font-mono">{step}</span>
        </p>
        <p className="mt-1 break-words font-mono text-xs">{detail}</p>
        <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0024 en Supabase.</p>
      </div>
    </section>
  );
}

async function Fijos() {
  const supabase = await createClient();

  const [{ user, household }, fixeds, entries, cards, members, profiles] = await Promise.all([
    requireHousehold(),
    supabase.from("fixed_expenses").select("*").eq("archived", false).order("created_at").limit(500),
    supabase.from("fixed_expense_entries").select("id, fixed_id, month, amount, expense_id, file_path, file_name").order("month", { ascending: false }).limit(5000),
    supabase.from("cards").select("*").eq("archived", false).order("created_at"),
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
  ]);

  const failed = [
    ["leer los gastos fijos (¿ejecutaste la migración 0024?)", fixeds.error],
    ["leer los importes de cada mes", entries.error],
    ["leer las tarjetas", cards.error],
    ["leer los miembros del hogar", members.error],
  ].find(([, e]) => e) as [string, { code: string; message: string }] | undefined;
  if (failed) return <Unavailable step={failed[0]} detail={`${failed[1].code}: ${failed[1].message}`} />;

  const palette = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f"];
  const people: Person[] = (members.data ?? []).map((m, i) => {
    const profile = profiles.data?.find((p) => p.id === m.user_id);
    const fallback = m.user_id === user.id ? user.email.split("@")[0] : "";
    return { id: m.user_id, name: profile?.display_name || fallback || "Alguien", color: profile?.color || palette[i % palette.length] };
  });

  return (
    <FixedView
      householdId={household.id}
      userId={user.id}
      people={people}
      cards={(cards.data ?? []) as Card[]}
      initialFixeds={(fixeds.data ?? []) as Fixed[]}
      initialEntries={(entries.data ?? []) as FixedEntry[]}
    />
  );
}

export default function FijosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Fijos />
    </Suspense>
  );
}
