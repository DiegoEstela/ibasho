"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { parseIngredient, parseLines } from "@/lib/cocina/parse";

function fail(message: string): never {
  redirect(`/cocina/nueva?error=${encodeURIComponent(message)}`);
}

export async function createRecipe(formData: FormData) {
  const { supabase, household } = await requireHousehold();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) fail("Ponle un nombre a la receta.");

  const difficulty = String(formData.get("difficulty") ?? "media");
  const servings = Math.max(1, Number(formData.get("servings")) || 2);
  const prepMinutes = Number(formData.get("prep_minutes")) || null;
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({
      household_id: household.id,
      name,
      servings,
      prep_minutes: prepMinutes,
      difficulty,
      tags,
      notes,
    })
    .select("id")
    .single();
  if (error || !recipe) fail(error?.message ?? "No se pudo guardar la receta.");

  const ingredients = parseLines(String(formData.get("ingredients") ?? ""))
    .map(parseIngredient)
    .filter((i): i is NonNullable<typeof i> => i !== null);

  if (ingredients.length) {
    // Productos canónicos: crea los que no existan y enlaza cada ingrediente
    const uniqueNames = [...new Set(ingredients.map((i) => i.name.toLowerCase()))];
    await supabase.from("products").upsert(
      uniqueNames.map((n) => ({ household_id: household.id, name: n })),
      { onConflict: "household_id,name_key", ignoreDuplicates: true },
    );
    const { data: products } = await supabase
      .from("products")
      .select("id, name_key")
      .eq("household_id", household.id)
      .in("name_key", uniqueNames);
    const productByKey = new Map((products ?? []).map((p) => [p.name_key, p.id]));

    const { error: ingError } = await supabase.from("recipe_ingredients").insert(
      ingredients.map((i, position) => ({
        household_id: household.id,
        recipe_id: recipe.id,
        product_id: productByKey.get(i.name.toLowerCase()) ?? null,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        position,
      })),
    );
    if (ingError) fail(ingError.message);
  }

  const steps = parseLines(String(formData.get("steps") ?? ""));
  if (steps.length) {
    const { error: stepError } = await supabase.from("recipe_steps").insert(
      steps.map((body, position) => ({
        household_id: household.id,
        recipe_id: recipe.id,
        position,
        body,
      })),
    );
    if (stepError) fail(stepError.message);
  }

  revalidatePath("/cocina");
  redirect(`/cocina/${recipe.id}`);
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
