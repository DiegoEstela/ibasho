import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";
import { BUCKET } from "@/lib/viajes/storage";
import { createClient } from "@/lib/supabase/server";
import { NotesBoard } from "./NotesBoard";
import type { HomeNote } from "./types";

async function Notas() {
  const supabase = await createClient();

  const [{ household }, notes] = await Promise.all([
    requireHousehold(),
    supabase
      .from("notes")
      .select("id, title, body, tag, pinned, is_secret, photo_path, updated_at")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  if (notes.error) {
    console.error(`[notas] leer las notas: ${notes.error.code}: ${notes.error.message}`);
    return (
      <section>
        <PageHeader title="Notas" />
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-sm text-ink-soft">
          <p className="font-medium text-ink">No pudimos cargar las notas.</p>
          <p className="mt-1 break-words font-mono text-xs">{notes.error.code}: {notes.error.message}</p>
          <p className="mt-2 text-xs">Si dice que una tabla no existe, ejecuta la migración 0013 en Supabase.</p>
        </div>
      </section>
    );
  }

  const list = (notes.data ?? []) as HomeNote[];
  // Las fotos están en un almacenamiento privado: se piden enlaces temporales.
  const paths = list.map((n) => n.photo_path).filter((p): p is string => !!p);
  const signed = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const photos: Record<string, string> = Object.fromEntries((signed.data ?? []).flatMap((s) => (s.signedUrl ? [[s.path as string, s.signedUrl]] : [])));

  return <NotesBoard householdId={household.id} initialNotes={list} initialPhotos={photos} />;
}

export default function NotasPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Notas />
    </Suspense>
  );
}
