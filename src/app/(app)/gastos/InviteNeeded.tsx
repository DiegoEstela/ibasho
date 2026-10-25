import { Users } from "lucide-react";
import { ShareCode } from "@/components/onboarding/ShareCode";
import { PageHeader } from "@/components/ui/PageHeader";

/** Aviso para hogares con una sola persona: repartir gastos necesita al menos a dos. */
export function InviteNeeded({ code, householdName }: { code: string; householdName: string }) {
  return (
    <section>
      <PageHeader title="Gastos" />
      <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-4 text-center lg:mt-10">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-moss/20 text-moss">
          <Users size={30} strokeWidth={1.5} />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold">Disponible cuando tu pareja se una</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Los gastos compartidos reparten cuentas entre dos o más personas. Cuando alguien más entre a tu hogar, podrán
            apuntar gastos y ver quién le debe a quién.
          </p>
        </div>
        <ShareCode code={code} householdName={householdName} />
      </div>
    </section>
  );
}
