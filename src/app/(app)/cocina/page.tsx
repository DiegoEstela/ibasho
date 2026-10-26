import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { createClient } from "@/lib/supabase/server";
import { RecipeBrowser } from "./RecipeBrowser";

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

  return <RecipeBrowser recipes={recipes} />;
}

export default function CocinaPage() {
  return (
    <section>
      <PageHeader
        title="Recetas"
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
