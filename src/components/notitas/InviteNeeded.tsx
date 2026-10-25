import { ShareCode } from "@/components/onboarding/ShareCode";
import { PageHeader } from "@/components/ui/PageHeader";

/** Las notitas son para dejárselas a alguien: sin pareja en el hogar, se la invita. */
export function InviteNeeded({ code, householdName }: { code: string; householdName: string }) {
  return (
    <section>
      <PageHeader title="Notitas" />
      <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-4 text-center lg:mt-10">
        <span className="text-5xl" aria-hidden>
          💌
        </span>
        <div>
          <h2 className="font-display text-xl font-bold">Las notitas empiezan cuando tu pareja se une</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Son cartitas que se dejan el uno al otro y aparecen al abrir la app. Pásale este código para que entre al hogar.
          </p>
        </div>
        <ShareCode code={code} householdName={householdName} />
      </div>
    </section>
  );
}
