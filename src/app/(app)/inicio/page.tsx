import { Suspense } from "react";
import { requireHousehold } from "@/lib/household";

async function Resumen() {
  const { household, displayName } = await requireHousehold();

  return (
    <section>
      <p className="font-display text-sm text-terracotta">{household.name}</p>
      <h1 className="font-display text-3xl font-bold lg:text-4xl">
        Hola{displayName ? `, ${displayName}` : ""}
      </h1>

      <div className="mt-6 max-w-md rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-soft">Código para invitar a tu pareja</p>
        <p className="mt-1 font-display text-2xl font-bold tracking-[0.3em] text-forest">
          {household.invite_code}
        </p>
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Resumen />
    </Suspense>
  );
}
