import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ShareCode } from "@/components/onboarding/ShareCode";
import { requireHousehold } from "@/lib/household";

async function Listo() {
  const { household } = await requireHousehold();

  return (
    <>
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">¡Hogar creado!</h1>
        <p className="mt-2 text-ink-soft">
          Pásale este código a tu pareja. Cuando cree su cuenta, solo tiene que elegir «Tengo un código».
        </p>
      </div>
      <ShareCode code={household.invite_code} householdName={household.name} />
      <Link
        href="/bienvenida"
        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95"
      >
        Continuar
      </Link>
      <p className="text-center text-xs text-ink-soft">
        Podrás volver a ver el código cuando quieras desde Inicio.
      </p>
    </>
  );
}

export default function ListoPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-6 px-6 py-10">
      <Logo size={72} />
      <Suspense>
        <Listo />
      </Suspense>
    </main>
  );
}
