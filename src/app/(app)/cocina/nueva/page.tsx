import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DIFFICULTIES } from "@/lib/cocina/labels";
import { createRecipe } from "../actions";

const field =
  "w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-soft/70 focus:border-forest";
const input = `${field} min-h-11`;
const label = "mb-1.5 block text-sm font-medium text-ink-soft";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-hanko/10 px-4 py-3 text-sm text-hanko">
      {error}
    </p>
  );
}

export default function NuevaRecetaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <section className="max-w-2xl">
      <Link href="/cocina" className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft">
        <ChevronLeft size={18} /> Cocina
      </Link>
      <h1 className="font-display text-3xl font-bold">Nueva receta</h1>

      <div className="mt-6">
        <Suspense>
          <ErrorMessage searchParams={searchParams} />
        </Suspense>

        <form action={createRecipe} className="flex flex-col gap-5">
          <div>
            <label className={label} htmlFor="name">Nombre</label>
            <input id="name" name="name" className={input} placeholder="Tortilla de patatas" required maxLength={120} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label} htmlFor="servings">Porciones</label>
              <input id="servings" name="servings" type="number" min={1} defaultValue={2} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="prep_minutes">Minutos</label>
              <input id="prep_minutes" name="prep_minutes" type="number" min={0} placeholder="30" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="difficulty">Dificultad</label>
              <select id="difficulty" name="difficulty" defaultValue="media" className={input}>
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="tags">Etiquetas (separadas por comas)</label>
            <input id="tags" name="tags" className={input} placeholder="rápida, vegetariana, para invitados" />
          </div>

          <div>
            <label className={label} htmlFor="ingredients">Ingredientes (uno por línea)</label>
            <textarea
              id="ingredients"
              name="ingredients"
              rows={6}
              className={`${field} py-3`}
              placeholder={"4 huevos\n500 g de patatas\n1/2 cebolla\n1 pizca de sal"}
            />
          </div>

          <div>
            <label className={label} htmlFor="steps">Pasos (uno por línea)</label>
            <textarea
              id="steps"
              name="steps"
              rows={6}
              className={`${field} py-3`}
              placeholder={"Pelar y cortar las patatas.\nFreír a fuego medio.\nBatir los huevos y mezclar."}
            />
          </div>

          <div>
            <label className={label} htmlFor="notes">Notas</label>
            <textarea id="notes" name="notes" rows={3} className={`${field} py-3`} />
          </div>

          <button className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95">
            Guardar receta
          </button>
        </form>
      </div>
    </section>
  );
}
