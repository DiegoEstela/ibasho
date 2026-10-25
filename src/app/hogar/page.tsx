import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { createClient } from "@/lib/supabase/server";
import { createHousehold, joinHousehold } from "./actions";

const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const buttonClass =
  "min-h-12 w-full rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95";

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
    <div className="flex w-full flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
          {error}
        </p>
      )}

      <form action={createHousehold} className="flex flex-col gap-3">
        <input
          className={inputClass}
          name="name"
          placeholder="Nombre del hogar (ej. Casa de Ana y Luis)"
          maxLength={60}
          required
        />
        <button className={buttonClass}>Crear mi hogar</button>
      </form>

      <details className="group rounded-2xl border border-line bg-surface/60">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center px-4 text-sm text-ink-soft">
          Mi pareja ya creó el hogar: tengo un código
        </summary>
        <form action={joinHousehold} className="flex flex-col gap-3 px-4 pb-4">
          <input
            className={`${inputClass} text-center uppercase tracking-[0.3em]`}
            name="code"
            placeholder="CÓDIGO"
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button className={buttonClass}>Unirme al hogar</button>
        </form>
      </details>
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
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Crea tu hogar</h1>
        <p className="mt-2 text-ink-soft">
          Es el espacio que compartirán. Después te daremos un código para que tu pareja se una.
        </p>
      </div>
      <Suspense>
        <HogarContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
