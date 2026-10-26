import { DIFFICULTIES } from "@/lib/cocina/labels";
import { IngredientsEditor, type IngredientRow } from "./IngredientsEditor";

const field =
  "w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const input = `${field} min-h-11`;
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

export type RecipeValues = {
  id: string;
  name: string;
  servings: number;
  prep_minutes: number | null;
  difficulty: string;
  tags: string[];
  notes: string | null;
  ingredients: IngredientRow[];
  steps: string;
};

/** Formulario de receta, para crear una nueva o editar una guardada. */
export function RecipeForm({
  action,
  submitLabel,
  recipe,
  products,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  recipe?: RecipeValues;
  /** Nombres de la lista de productos, para elegir ingredientes. */
  products: string[];
}) {
  return (
    <form action={action} className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-5">
      {recipe && <input type="hidden" name="id" value={recipe.id} />}

      <div className="lg:col-span-2">
        <label className={label} htmlFor="name">Nombre</label>
        <input id="name" name="name" className={input} placeholder="Tortilla de patatas" required maxLength={120} defaultValue={recipe?.name} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label} htmlFor="servings">Porciones</label>
          <input id="servings" name="servings" type="number" min={1} defaultValue={recipe?.servings ?? 2} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="prep_minutes">Minutos</label>
          <input id="prep_minutes" name="prep_minutes" type="number" min={0} placeholder="30" defaultValue={recipe?.prep_minutes ?? undefined} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="difficulty">Dificultad</label>
          <select id="difficulty" name="difficulty" defaultValue={recipe?.difficulty ?? "media"} className={input}>
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="tags">Etiquetas (separadas por comas)</label>
        <input id="tags" name="tags" className={input} placeholder="rápida, vegetariana, para invitados" defaultValue={recipe?.tags.join(", ")} />
      </div>

      <div>
        <span className={label}>Ingredientes</span>
        <IngredientsEditor products={products} initial={recipe?.ingredients ?? []} />
      </div>

      <div>
        <label className={label} htmlFor="steps">Pasos (uno por línea)</label>
        <textarea
          id="steps"
          name="steps"
          rows={8}
          className={`${field} py-3`}
          placeholder={"Pelar y cortar las patatas.\nFreír a fuego medio.\nBatir los huevos y mezclar."}
          defaultValue={recipe?.steps}
        />
      </div>

      <div className="lg:col-span-2">
        <label className={label} htmlFor="notes">Notas</label>
        <textarea id="notes" name="notes" rows={3} className={`${field} py-3`} defaultValue={recipe?.notes ?? ""} />
      </div>

      <button className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 lg:col-span-2 lg:w-fit">
        {submitLabel}
      </button>
    </form>
  );
}
