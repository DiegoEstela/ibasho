import type { createClient } from "@/lib/supabase/client";

type Client = ReturnType<typeof createClient>;

export type TemplateItem = { product_id: string; quantity: string | null };
export type Template = { id: string; name: string; items: TemplateItem[] };

type Row = { id: string; name: string; shopping_template_items: TemplateItem[] | null };

export const TEMPLATES_SELECT = "id, name, shopping_template_items(product_id, quantity)";

export function toTemplates(rows: Row[] | null): Template[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    items: (r.shopping_template_items ?? []).map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
  }));
}

/** Devuelve nulo si falla (por ejemplo, si la migración aún no se ha ejecutado). */
export async function loadTemplates(supabase: Client): Promise<Template[] | null> {
  const { data, error } = await supabase
    .from("shopping_templates")
    .select(TEMPLATES_SELECT)
    .order("position")
    .order("created_at");
  if (error) return null;
  return toTemplates(data as Row[]);
}

/** Crea o actualiza una plantilla. Al editar, se reemplazan todos sus productos. */
export async function saveTemplate(
  supabase: Client,
  householdId: string,
  template: { id?: string; name: string; items: TemplateItem[] },
): Promise<boolean> {
  let id = template.id;
  if (id) {
    const { error } = await supabase.from("shopping_templates").update({ name: template.name }).eq("id", id);
    if (error) return false;
    const { error: delError } = await supabase.from("shopping_template_items").delete().eq("template_id", id);
    if (delError) return false;
  } else {
    const { data, error } = await supabase
      .from("shopping_templates")
      .insert({ household_id: householdId, name: template.name })
      .select("id")
      .single();
    if (error || !data) return false;
    id = data.id as string;
  }

  if (template.items.length === 0) return true;
  const { error } = await supabase.from("shopping_template_items").insert(
    template.items.map((i) => ({ household_id: householdId, template_id: id, product_id: i.product_id, quantity: i.quantity })),
  );
  return !error;
}

export async function deleteTemplate(supabase: Client, id: string): Promise<boolean> {
  const { error } = await supabase.from("shopping_templates").delete().eq("id", id);
  return !error;
}
