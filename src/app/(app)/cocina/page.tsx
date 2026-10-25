import { Suspense } from "react";
import Link from "next/link";
import { Clock, Heart, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { createClient } from "@/lib/supabase/server";
import { difficultyLabel } from "@/lib/cocina/labels";

async function RecipeList() {
  const supabase = await createClient();
  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, name, prep_minutes, difficulty, tags, is_favorite")
    .order("created_at", { ascending: false });

  if (!recipes?.length) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center lg:mt-6 lg:p-8">
        <p className="font-display text-lg font-bold">Aún no hay recetas</p>
        <p className="mt-1 text-sm text-ink-soft">Guarden su primer plato y lo tendrán siempre a mano.</p>
        <Link
          href="/cocina/nueva"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-forest px-6 text-base font-medium text-surface"
        >
          <Plus size={18} /> Nueva receta
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:mt-6 lg:gap-3 xl:grid-cols-3">
      {recipes.map((r) => (
        <li key={r.id}>
          <Link
            href={`/cocina/${r.id}`}
            className="block rounded-2xl border border-line bg-surface p-3 transition active:scale-[0.99] lg:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-base font-bold leading-snug lg:text-lg">{r.name}</h2>
              {r.is_favorite && <Heart size={18} className="shrink-0 fill-hanko text-hanko" />}
            </div>
            <p className="mt-1.5 flex items-center gap-3 text-xs text-ink-soft lg:mt-2 lg:text-sm">
              {r.prep_minutes != null && (
                <span className="flex items-center gap-1">
                  <Clock size={14} /> {r.prep_minutes} min
                </span>
              )}
              <span>{difficultyLabel(r.difficulty)}</span>
            </p>
            {r.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.tags.map((t: string) => (
                  <span key={t} className="rounded-full bg-moss/15 px-2.5 py-0.5 text-xs text-forest">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function CocinaPage() {
  return (
    <section>
      <PageHeader
        title="Cocina"
        actions={
          <Link
            href="/cocina/nueva"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest px-3.5 text-sm font-medium text-surface shadow-sm transition active:scale-95 lg:min-h-11 lg:rounded-2xl lg:px-5"
          >
            <Plus size={16} /> Nueva receta
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <RecipeList />
      </Suspense>
    </section>
  );
}
