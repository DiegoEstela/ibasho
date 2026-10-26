import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireHousehold } from "@/lib/household";
import { fetchMisCuentas } from "@/lib/personal/queries";
import { createClient } from "@/lib/supabase/server";
import { MisCuentasView } from "./MisCuentasView";

async function MisCuentas() {
  const supabase = await createClient();
  const { user } = await requireHousehold();

  let data;
  try {
    data = await fetchMisCuentas(supabase, user.id);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Error desconocido";
    console.error(`[mis-cuentas] ${detail}`);
    return (
      <section>
        <PageHeader title="Mis cuentas" back="/inicio" />
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
          <p className="font-medium text-ink">No pudimos cargar tus cuentas.</p>
          <p className="mt-1 break-words font-mono text-xs">{detail}</p>
          <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0022 en Supabase.</p>
        </div>
      </section>
    );
  }

  return <MisCuentasView userId={user.id} initialData={data} />;
}

export default function MisCuentasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MisCuentas />
    </Suspense>
  );
}
