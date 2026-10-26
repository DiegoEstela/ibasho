import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { createRecipe } from "../actions";
import { RecipeForm } from "../RecipeForm";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
      {error}
    </p>
  );
}

async function NewRecipeForm() {
  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("name").order("name").limit(2000);
  return <RecipeForm action={createRecipe} submitLabel="Guardar receta" products={(products ?? []).map((p) => p.name as string)} />;
}

export default function NuevaRecetaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <section className="max-w-2xl lg:max-w-5xl">
      <PageHeader title="Nueva receta" back="/cocina" />

      <div className="mt-3 lg:mt-6">
        <Suspense>
          <ErrorMessage searchParams={searchParams} />
        </Suspense>

        <Suspense>
          <NewRecipeForm />
        </Suspense>
      </div>
    </section>
  );
}
