import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { BaulView } from "./BaulView";
import type { VaultDoc } from "./types";

async function Baul() {
  const supabase = await createClient();
  const [{ household }, docs] = await Promise.all([
    requireHousehold(),
    supabase
      .from("vault_documents")
      .select("id, name, category, doc_date, doc_time, file_path, file_name, mime_type, size_bytes, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (docs.error) {
    console.error(`[baul] leer los documentos: ${docs.error.code}: ${docs.error.message}`);
    return (
      <section>
        <PageHeader title="Baúl" />
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
          <p className="font-medium text-ink">No pudimos cargar el baúl.</p>
          <p className="mt-1 break-words font-mono text-xs">{docs.error.code}: {docs.error.message}</p>
          <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0017 en Supabase.</p>
        </div>
      </section>
    );
  }

  return <BaulView householdId={household.id} initialDocs={(docs.data ?? []) as VaultDoc[]} />;
}

export default function BaulPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Baul />
    </Suspense>
  );
}
