import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Heart, Trash2, Users } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { difficultyLabel } from "@/lib/cocina/labels";
import { formatQuantity } from "@/lib/cocina/parse";
import { deleteRecipe, toggleFavorite } from "../actions";

async function Recipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireHousehold();

  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, name, servings, prep_minutes, difficulty, tags, notes, is_favorite, recipe_ingredients(id, name, quantity, unit, position), recipe_steps(id, body, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!recipe) notFound();

  const ingredients = [...recipe.recipe_ingredients].sort((a, b) => a.position - b.position);
  const steps = [...recipe.recipe_steps].sort((a, b) => a.position - b.position);

  return (
    <article className="max-w-2xl">
      <Link href="/cocina" className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft">
        <ChevronLeft size={18} /> Cocina
      </Link>

      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">{recipe.name}</h1>
        <form action={toggleFavorite}>
          <input type="hidden" name="id" value={recipe.id} />
          <input type="hidden" name="favorite" value={String(!recipe.is_favorite)} />
          <button
            aria-label={recipe.is_favorite ? "Quitar de favoritos" : "Marcar como favorito"}
            className="flex size-11 items-center justify-center rounded-full border border-line bg-surface transition active:scale-90"
          >
            <Heart size={20} className={recipe.is_favorite ? "fill-hanko text-hanko" : "text-ink-soft"} />
          </button>
        </form>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span className="flex items-center gap-1"><Users size={14} /> {recipe.servings} porciones</span>
        {recipe.prep_minutes != null && (
          <span className="flex items-center gap-1"><Clock size={14} /> {recipe.prep_minutes} min</span>
        )}
        <span>{difficultyLabel(recipe.difficulty)}</span>
      </p>

      {recipe.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recipe.tags.map((t: string) => (
            <span key={t} className="rounded-full bg-moss/15 px-2.5 py-0.5 text-xs text-forest">{t}</span>
          ))}
        </div>
      )}

      <h2 className="mt-8 font-display text-xl font-bold">Ingredientes</h2>
      {ingredients.length ? (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {ingredients.map((i) => (
            <li key={i.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
              <span>{i.name}</span>
              <span className="text-sm text-ink-soft">{formatQuantity(i.quantity, i.unit)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Sin ingredientes.</p>
      )}

      <h2 className="mt-8 font-display text-xl font-bold">Pasos</h2>
      {steps.length ? (
        <ol className="mt-3 flex flex-col gap-3">
          {steps.map((s, n) => (
            <li key={s.id} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest/15 text-sm font-bold text-forest">
                {n + 1}
              </span>
              <p className="leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Sin pasos.</p>
      )}

      {recipe.notes && (
        <>
          <h2 className="mt-8 font-display text-xl font-bold">Notas</h2>
          <p className="mt-2 whitespace-pre-line text-ink-soft">{recipe.notes}</p>
        </>
      )}

      <form action={deleteRecipe} className="mt-10">
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
    <Suspense fallback={<p className="text-ink-soft">Cargando…</p>}>
      <Recipe params={params} />
    </Suspense>
  );
}
