import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { createClient } from "@/lib/supabase/server";
import { createHousehold, joinHousehold } from "./actions";

const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const buttonClass =
  "min-h-11 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95";

async function HogarContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membership) redirect("/inicio");

  return (
    <div className="flex w-full flex-col gap-8">
      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
          {error}
        </p>
      )}

      <form action={createHousehold} className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Crear un hogar</h2>
        <p className="text-sm text-ink-soft">Después podrás invitar a tu pareja con un código.</p>
        <input className={inputClass} name="name" placeholder="Nombre del hogar" maxLength={60} />
        <button className={buttonClass}>Crear hogar</button>
      </form>

      <div className="flex items-center gap-3 text-sm text-ink-soft">
        <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
      </div>

      <form action={joinHousehold} className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Unirme con un código</h2>
        <input
          className={`${inputClass} uppercase tracking-widest`}
          name="code"
          placeholder="Código de invitación"
          maxLength={12}
          autoCapitalize="characters"
        />
        <button className={buttonClass}>Unirme</button>
      </form>
    </div>
  );
}

export default function HogarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-6 px-6 py-10">
      <Logo size={72} />
      <h1 className="text-center font-display text-2xl font-bold">Tu hogar</h1>
      <Suspense>
        <HogarContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
