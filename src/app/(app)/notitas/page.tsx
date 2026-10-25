import { Suspense } from "react";
import { InviteNeeded } from "@/components/notitas/InviteNeeded";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { NotesView } from "./NotesView";
import type { Note, NoteReaction, NoteRead, Person } from "./types";

function Unavailable({ step, detail }: { step: string; detail: string }) {
  console.error(`[notitas] ${step}: ${detail}`);
  return (
    <section>
      <PageHeader title="Notitas" />
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
        <p className="font-medium text-ink">No pudimos cargar las notitas.</p>
        <p className="mt-2">
          Paso que falló: <span className="font-mono">{step}</span>
        </p>
        <p className="mt-1 break-words font-mono text-xs">{detail}</p>
        <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0008 en Supabase.</p>
      </div>
    </section>
  );
}

async function Notitas({ searchParams }: { searchParams: Promise<{ escribir?: string }> }) {
  const { escribir } = await searchParams;
  const supabase = await createClient();

  const [{ user, household }, notes, reads, reactions, members, profiles] = await Promise.all([
    requireHousehold(),
    supabase.from("daily_messages").select("*").order("deliver_on", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("daily_message_reads").select("message_id, user_id, read_at").limit(5000),
    supabase.from("daily_message_reactions").select("message_id, user_id, emoji").limit(5000),
    supabase.from("household_members").select("user_id").order("joined_at"),
    supabase.from("profiles").select("id, display_name, color"),
  ]);

  const failed = [
    ["leer las notitas", notes.error],
    ["leer las lecturas", reads.error],
    ["leer las reacciones", reactions.error],
    ["leer los miembros del hogar", members.error],
  ].find(([, e]) => e) as [string, { code: string; message: string }] | undefined;
  if (failed) return <Unavailable step={failed[0]} detail={`${failed[1].code}: ${failed[1].message}`} />;

  // Con una sola persona no hay a quién escribirle: se invita a la pareja.
  if ((members.data?.length ?? 0) < 2) return <InviteNeeded code={household.invite_code} householdName={household.name} />;

  const palette = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f"];
  const people: Person[] = (members.data ?? []).map((m, i) => {
    const profile = profiles.data?.find((p) => p.id === m.user_id);
    const fallback = m.user_id === user.id ? user.email.split("@")[0] : "";
    return { id: m.user_id, name: profile?.display_name || fallback || "Alguien", color: profile?.color || palette[i % palette.length] };
  });

  return (
    <NotesView
      householdId={household.id}
      userId={user.id}
      people={people}
      initialNotes={(notes.data ?? []) as Note[]}
      initialReads={(reads.data ?? []) as NoteRead[]}
      initialReactions={(reactions.data ?? []) as NoteReaction[]}
      startWriting={escribir === "1"}
    />
  );
}

export default function NotitasPage({ searchParams }: { searchParams: Promise<{ escribir?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Notitas searchParams={searchParams} />
    </Suspense>
  );
}
