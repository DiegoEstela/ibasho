import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { createClient } from "@/lib/supabase/server";
import { formatQuantity } from "@/lib/cocina/parse";
import { updateRecipe } from "../../actions";
import { RecipeForm } from "../../RecipeForm";

async function EditRecipe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const [{ data: products }, { data: recipe }] = await Promise.all([
    supabase.from("products").select("name").order("name").limit(2000),
    supabase
    .from("recipes")
    .select(
      "id, name, servings, prep_minutes, difficulty, tags, notes, recipe_ingredients(name, quantity, unit, position), recipe_steps(body, position)",
    )
    .eq("id", id)
    .maybeSingle(),
  ]);
  if (!recipe) notFound();

  const ingredients = [...recipe.recipe_ingredients]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ name: i.name as string, quantity: i.quantity == null ? "" : formatQuantity(i.quantity, null), unit: (i.unit as string | null) ?? "" }));
  const steps = [...recipe.recipe_steps].sort((a, b) => a.position - b.position).map((s) => s.body).join("\n");

  return (
    <section className="max-w-2xl lg:max-w-5xl">
      <PageHeader title="Editar receta" back={`/cocina/${id}`} />

      <div className="mt-3 lg:mt-6">
        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
            {error}
          </p>
        )}
        <RecipeForm
          action={updateRecipe}
          submitLabel="Guardar cambios"
          recipe={{ ...recipe, ingredients, steps }}
          products={(products ?? []).map((p) => p.name as string)}
        />
      </div>
    </section>
  );
}

export default function EditarRecetaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditRecipe params={params} searchParams={searchParams} />
    </Suspense>
  );
}
