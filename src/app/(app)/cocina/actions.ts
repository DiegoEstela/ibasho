"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { parseIngredient, parseLines, toNumber, type ParsedIngredient } from "@/lib/cocina/parse";
import { classify } from "@/lib/compras/categories";

function fail(message: string, back = "/cocina/nueva"): never {
  redirect(`${back}?error=${encodeURIComponent(message)}`);
}

type Supabase = Awaited<ReturnType<typeof requireHousehold>>["supabase"];

function readFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    difficulty: String(formData.get("difficulty") ?? "media"),
    servings: Math.max(1, Number(formData.get("servings")) || 2),
    prep_minutes: Number(formData.get("prep_minutes")) || null,
    tags: [...new Set(String(formData.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))],
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

/** Ingredientes del formulario: lista elegida de productos (JSON) o, por compatibilidad, líneas de texto. */
function readIngredients(formData: FormData): ParsedIngredient[] {
  const raw = String(formData.get("ingredients_json") ?? "");
  if (raw) {
    try {
      const list = JSON.parse(raw) as { name?: unknown; quantity?: unknown; unit?: unknown }[];
      return list
        .slice(0, 100)
        .map((i) => ({
          name: String(i.name ?? "").trim().slice(0, 100),
          quantity: String(i.quantity ?? "").trim() ? toNumber(String(i.quantity)) : null,
          unit: String(i.unit ?? "").trim().toLowerCase() || null,
        }))
        .filter((i) => i.name);
    } catch {
      return [];
    }
  }
  return parseLines(String(formData.get("ingredients") ?? ""))
    .map(parseIngredient)
    .filter((i): i is ParsedIngredient => i !== null);
}

/** Guarda los ingredientes y los pasos de una receta (los anteriores, si los hay, ya se quitaron). */
async function saveParts(supabase: Supabase, householdId: string, recipeId: string, formData: FormData, back: string) {
  const ingredients = readIngredients(formData);

  if (ingredients.length) {
    // Productos canónicos: crea los que no existan y enlaza cada ingrediente
    const uniqueNames = [...new Set(ingredients.map((i) => i.name.toLowerCase()))];
    await supabase.from("products").upsert(
      uniqueNames.map((n) => ({ household_id: householdId, name: n, category: classify(n) })),
      { onConflict: "household_id,name_key", ignoreDuplicates: true },
    );
    const { data: products } = await supabase
      .from("products")
      .select("id, name_key")
      .eq("household_id", householdId)
      .in("name_key", uniqueNames);
    const productByKey = new Map((products ?? []).map((p) => [p.name_key, p.id]));

    const { error: ingError } = await supabase.from("recipe_ingredients").insert(
      ingredients.map((i, position) => ({
        household_id: householdId,
        recipe_id: recipeId,
        product_id: productByKey.get(i.name.toLowerCase()) ?? null,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        position,
      })),
    );
    if (ingError) fail(ingError.message, back);
  }

  const steps = parseLines(String(formData.get("steps") ?? ""));
  if (steps.length) {
    const { error: stepError } = await supabase.from("recipe_steps").insert(
      steps.map((body, position) => ({ household_id: householdId, recipe_id: recipeId, position, body })),
    );
    if (stepError) fail(stepError.message, back);
  }
}

export async function createRecipe(formData: FormData) {
  const { supabase, household } = await requireHousehold();

  const fields = readFields(formData);
  if (!fields.name) fail("Ponle un nombre a la receta.");

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({ household_id: household.id, ...fields })
    .select("id")
    .single();
  if (error || !recipe) fail(error?.message ?? "No se pudo guardar la receta.");

  await saveParts(supabase, household.id, recipe.id, formData, "/cocina/nueva");

  revalidatePath("/cocina");
  redirect(`/cocina/${recipe.id}`);
}

export async function updateRecipe(formData: FormData) {
  const { supabase, household } = await requireHousehold();

  const id = String(formData.get("id") ?? "");
  const back = `/cocina/${id}/editar`;
  const fields = readFields(formData);
  if (!fields.name) fail("Ponle un nombre a la receta.", back);

  const { data: updated, error } = await supabase.from("recipes").update(fields).eq("id", id).select("id");
  if (error || !updated?.length) fail(error?.message ?? "No se pudo guardar la receta.", back);

  // Se reemplazan los ingredientes y pasos por lo que quedó en el formulario.
  await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
  await supabase.from("recipe_steps").delete().eq("recipe_id", id);
  await saveParts(supabase, household.id, id, formData, back);

  revalidatePath("/cocina");
  revalidatePath(`/cocina/${id}`);
  redirect(`/cocina/${id}`);
}

export async function toggleFavorite(formData: FormData) {
  const { supabase } = await requireHousehold();
  const id = String(formData.get("id"));
  const next = formData.get("favorite") === "true";
  await supabase.from("recipes").update({ is_favorite: next }).eq("id", id);
  revalidatePath("/cocina");
  revalidatePath(`/cocina/${id}`);
}

export async function deleteRecipe(formData: FormData) {
  const { supabase } = await requireHousehold();
  await supabase.from("recipes").delete().eq("id", String(formData.get("id")));
  revalidatePath("/cocina");
  redirect("/cocina");
}
