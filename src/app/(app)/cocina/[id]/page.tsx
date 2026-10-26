import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock, Heart, Pencil, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/household";
import { difficultyLabel } from "@/lib/cocina/labels";
import { formatQuantity } from "@/lib/cocina/parse";
import { deleteRecipe, toggleFavorite } from "../actions";
import { MissingIngredients, type RecipeIngredient } from "./MissingIngredients";

async function Recipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ household, displayName }, { data: pending }, { data: recipe }] = await Promise.all([
    requireHousehold(),
    supabase.from("shopping_items").select("name").eq("done", false).limit(500),
    supabase
    .from("recipes")
    .select(
      "id, name, servings, prep_minutes, difficulty, tags, notes, is_favorite, recipe_ingredients(id, name, quantity, unit, position, product_id, products(in_stock, category)), recipe_steps(id, body, position)",
    )
    .eq("id", id)
    .maybeSingle(),
  ]);
  if (!recipe) notFound();

  const ingredients = [...recipe.recipe_ingredients].sort((a, b) => a.position - b.position);
  const pendingNames = new Set((pending ?? []).map((i) => i.name.trim().toLowerCase()));
  const checks: RecipeIngredient[] = ingredients.map((i) => {
    const product = Array.isArray(i.products) ? i.products[0] : i.products;
    return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    product_id: i.product_id,
    inStock: product?.in_stock ?? false,
    category: product?.category ?? null,
    inList: pendingNames.has(i.name.trim().toLowerCase()),
    };
  });
  const steps = [...recipe.recipe_steps].sort((a, b) => a.position - b.position);

  return (
    <article className="max-w-2xl lg:max-w-6xl">
      <PageHeader
        title={recipe.name}
        back="/cocina"
        actions={
          <div className="flex items-center gap-2">
          <Link
            href={`/cocina/${recipe.id}/editar`}
            aria-label="Editar receta"
            className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition active:scale-90"
          >
            <Pencil size={17} />
          </Link>
          <form action={toggleFavorite}>
            <input type="hidden" name="id" value={recipe.id} />
            <input type="hidden" name="favorite" value={String(!recipe.is_favorite)} />
            <button
              aria-label={recipe.is_favorite ? "Quitar de favoritos" : "Marcar como favorito"}
              className="flex size-10 items-center justify-center rounded-full border border-line bg-surface transition active:scale-90"
            >
              <Heart size={18} className={recipe.is_favorite ? "fill-hanko text-hanko" : "text-ink-soft"} />
            </button>
          </form>
          </div>
        }
      />

      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft lg:mt-2 lg:text-sm">
        <span className="flex items-center gap-1"><Users size={14} /> {recipe.servings} porciones</span>
        {recipe.prep_minutes != null && (
          <span className="flex items-center gap-1"><Clock size={14} /> {recipe.prep_minutes} min</span>
        )}
        <span>{difficultyLabel(recipe.difficulty)}</span>
      </p>

      <MissingIngredients householdId={household.id} meName={displayName} ingredients={checks} />

      {recipe.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recipe.tags.map((t: string) => (
            <span key={t} className="rounded-full bg-moss/15 px-2.5 py-0.5 text-xs text-forest">{t}</span>
          ))}
        </div>
      )}

      <div className="lg:mt-8 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div>
      <h2 className="mt-5 font-display text-base font-bold lg:mt-0 lg:text-xl">Ingredientes</h2>
      {ingredients.length ? (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-[15px] lg:mt-3 lg:text-base">
          {ingredients.map((i) => (
            <li key={i.id} className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5 lg:min-h-11 lg:px-4 lg:py-2">
              <span>{i.name}</span>
              <span className="text-xs text-ink-soft lg:text-sm">{formatQuantity(i.quantity, i.unit)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Sin ingredientes.</p>
      )}

      </div>
      <div>
      <h2 className="mt-5 font-display text-base font-bold lg:mt-0 lg:text-xl">Pasos</h2>
      {steps.length ? (
        <ol className="mt-2 flex flex-col gap-2 lg:mt-3 lg:gap-3">
          {steps.map((s, n) => (
            <li key={s.id} className="flex gap-3 rounded-2xl border border-line bg-surface p-3 lg:p-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-forest/15 text-xs font-bold text-forest lg:size-7 lg:text-sm">
                {n + 1}
              </span>
              <p className="text-[15px] leading-relaxed lg:text-base">{s.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Sin pasos.</p>
      )}

      </div>
      </div>

      {recipe.notes && (
        <>
          <h2 className="mt-5 font-display text-base font-bold lg:mt-8 lg:text-xl">Notas</h2>
          <p className="mt-2 whitespace-pre-line text-ink-soft">{recipe.notes}</p>
        </>
      )}

      <form action={deleteRecipe} className="mt-6 lg:mt-10">
        <input type="hidden" name="id" value={recipe.id} />
        <button className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-hanko">
          <Trash2 size={16} /> Eliminar receta
        </button>
      </form>
    </article>
  );
}

export default function RecetaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Recipe params={params} />
    </Suspense>
  );
}
