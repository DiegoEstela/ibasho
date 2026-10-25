import { Suspense } from "react";
import { GastosTabs } from "@/components/ui/GastosTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { CardsView } from "./CardsView";
import type { Card, Installment, Person, Purchase, Share } from "./types";

function Unavailable({ step, detail }: { step: string; detail: string }) {
  console.error(`[tarjetas] ${step}: ${detail}`);
  return (
    <section>
      <PageHeader title="Gastos" subtitle="Tarjetas y cuotas" />
      <GastosTabs active="tarjetas" />
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
        <p className="font-medium text-ink">No pudimos cargar las tarjetas.</p>
        <p className="mt-2">
          Paso que falló: <span className="font-mono">{step}</span>
        </p>
        <p className="mt-1 break-words font-mono text-xs">{detail}</p>
        <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0006 en Supabase.</p>
      </div>
    </section>
  );
}

async function Tarjetas() {
  const supabase = await createClient();

  const [{ user, household }, cards, purchases, shares, installments, members, profiles] = await Promise.all([
    requireHousehold(),
    supabase.from("cards").select("*").eq("archived", false).order("created_at"),
    supabase.from("card_purchases").select("*").order("purchase_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("card_purchase_shares").select("purchase_id, user_id, percent").limit(5000),
    supabase.from("card_installments").select("id, purchase_id, number, due_date, amount, manual_paid").limit(20000),
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
  ]);

  const failed = [
    ["leer las tarjetas", cards.error],
    ["leer las compras", purchases.error],
    ["leer los repartos", shares.error],
    ["leer las cuotas", installments.error],
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
    <CardsView
      householdId={household.id}
      userId={user.id}
      people={people}
      initialCards={(cards.data ?? []) as Card[]}
      initialPurchases={(purchases.data ?? []) as Purchase[]}
      initialShares={(shares.data ?? []) as Share[]}
      initialInstallments={(installments.data ?? []) as Installment[]}
    />
  );
}

export default function TarjetasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Tarjetas />
    </Suspense>
  );
}
