import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import type { Participant } from "@/lib/gastos/balance";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { ExpensesView } from "./ExpensesView";
import { InviteNeeded } from "./InviteNeeded";
import type { Expense, Settlement, Split } from "./types";

/** Pantalla de error con el motivo real, para saber qué falló en vez de ver una página vacía. */
function Unavailable({ step, detail }: { step: string; detail: string }) {
  console.error(`[gastos] ${step}: ${detail}`);
  return (
    <section>
      <PageHeader title="Gastos" />
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
        <p className="font-medium text-ink">No pudimos cargar los gastos del hogar.</p>
        <p className="mt-2">
          Paso que falló: <span className="font-mono">{step}</span>
        </p>
        <p className="mt-1 break-words font-mono text-xs">{detail}</p>
      </div>
    </section>
  );
}

const PALETTE = ["#6f8f5e", "#c9704f", "#8fbfd4", "#f2b8c6", "#c8382f"];

async function Gastos() {
  const supabase = await createClient();

  // Primera ronda (a la vez): hogar, grupo de gastos, miembros y sus perfiles.
  const [{ user, household }, { data: group, error: groupError }, { data: members, error: membersError }, { data: profiles }] =
    await Promise.all([
      requireHousehold(),
      supabase.from("expense_groups").select("id").eq("kind", "household").maybeSingle(),
      supabase.from("household_members").select("user_id").order("joined_at"),
      supabase.from("profiles").select("id, display_name, color"),
    ]);

  if (groupError) return <Unavailable step="buscar el grupo de gastos" detail={`${groupError.code}: ${groupError.message}`} />;
  if (membersError) return <Unavailable step="leer los miembros del hogar" detail={`${membersError.code}: ${membersError.message}`} />;

  // Con una sola persona no hay nada que repartir: se invita a la pareja.
  if ((members?.length ?? 0) < 2) return <InviteNeeded code={household.invite_code} householdName={household.name} />;

  // El grupo de gastos del hogar se crea la primera vez.
  let groupId = group?.id as string | undefined;
  if (!groupId) {
    const { data: created, error } = await supabase
      .from("expense_groups")
      .insert({ household_id: household.id, kind: "household", name: "Hogar" })
      .select("id")
      .single();
    if (error) {
      // Si los dos entran a la vez, el otro ya lo habrá creado: se vuelve a buscar.
      const { data: again } = await supabase.from("expense_groups").select("id").eq("kind", "household").maybeSingle();
      if (!again) return <Unavailable step="crear el grupo de gastos" detail={`${error.code}: ${error.message}`} />;
      groupId = again.id as string;
    } else {
      groupId = created.id as string;
    }
  }

  const loadParticipants = (id: string) =>
    supabase.from("expense_participants").select("id, user_id, name, color").eq("group_id", id).order("created_at");

  let participants = await loadParticipants(groupId);
  if (participants.error) return <Unavailable step="leer los participantes" detail={`${participants.error.code}: ${participants.error.message}`} />;

  // Cada miembro del hogar debe ser participante; se añaden los que falten (por ejemplo, quien acaba de unirse).
  const known = new Set((participants.data ?? []).map((p) => p.user_id));
  const missing = (members ?? []).filter((m) => !known.has(m.user_id));
  if (missing.length > 0) {
    const rows = missing.map((m, i) => {
      const profile = profiles?.find((p) => p.id === m.user_id);
      const fallback = m.user_id === user.id ? user.email.split("@")[0] : "";
      return {
        household_id: household.id,
        group_id: groupId,
        user_id: m.user_id,
        name: profile?.display_name || fallback || "Alguien",
        color: profile?.color || PALETTE[(known.size + i) % PALETTE.length],
      };
    });
    const { error } = await supabase
      .from("expense_participants")
      .upsert(rows, { onConflict: "group_id,user_id", ignoreDuplicates: true });
    if (error) return <Unavailable step="añadir a los participantes" detail={`${error.code}: ${error.message}`} />;
    participants = await loadParticipants(groupId);
    if (participants.error) return <Unavailable step="leer los participantes" detail={`${participants.error.code}: ${participants.error.message}`} />;
  }

  // Segunda ronda: movimientos del grupo.
  const [expenses, splits, settlements] = await Promise.all([
    supabase.from("expenses").select("*").eq("group_id", groupId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("expense_splits").select("expense_id, participant_id, amount, expenses!inner(group_id)").eq("expenses.group_id", groupId).limit(10000),
    supabase.from("settlements").select("*").eq("group_id", groupId).order("settled_on", { ascending: false }).limit(500),
  ]);

  const failed = [
    ["leer los gastos", expenses.error],
    ["leer los repartos", splits.error],
    ["leer los pagos", settlements.error],
  ].find(([, e]) => e) as [string, { code: string; message: string }] | undefined;
  if (failed) return <Unavailable step={failed[0]} detail={`${failed[1].code}: ${failed[1].message}`} />;

  if ((participants.data?.length ?? 0) === 0) {
    return <Unavailable step="comprobar los participantes" detail="No se pudo crear ningún participante para este hogar." />;
  }

  console.log(`[gastos] ok: ${participants.data?.length} participantes, ${expenses.data?.length ?? 0} gastos`);

  return (
    <ExpensesView
      householdId={household.id}
      groupId={groupId}
      userId={user.id}
      participants={(participants.data ?? []) as Participant[]}
      initialExpenses={(expenses.data ?? []) as Expense[]}
      initialSplits={((splits.data ?? []) as unknown as Split[]).map(({ expense_id, participant_id, amount }) => ({
        expense_id,
        participant_id,
        amount,
      }))}
      initialSettlements={(settlements.data ?? []) as Settlement[]}
    />
  );
}

export default function GastosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Gastos />
    </Suspense>
  );
}
