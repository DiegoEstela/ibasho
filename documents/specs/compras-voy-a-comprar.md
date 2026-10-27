# Compras · «Voy a comprar» (la salida al súper)

Estado: aprobada · Migración: `0027_compras_salida.sql`

## Problema

Entre lo que hay en casa y lo que falta, la lista de compras puede tener 140–200 productos.
Dentro del súper, buscar en esa lista es lento. Hace falta una lista **corta** para ese día,
sacada de la lista que ya existe.

## Idea

«Voy a comprar» **no es una lista nueva ni elige desde el maestro de productos**. Es un filtro guardado
sobre los productos que ya están pendientes en la lista de compras: se apartan unos pocos
en una **salida**. El resto de la lista sigue ahí, pero no estorba.

## Decisiones

| Tema | Decisión |
|---|---|
| Selección | A mano, sobre la lista, con atajo «Marcar todo» por categoría |
| Cuántas salidas | Una sola activa a la vez |
| Compartida | Sí, en tiempo real entre los dos (misma tabla `shopping_items`) |
| Plantillas | Se mantienen: sirven para llenar la lista de compras («Desayuno») |
| Selector desde el maestro | Se retira (`QuickPickSheet`), junto con «Te suele hacer falta» |
| Aviso a la pareja | No se manda push al preparar la salida |

## Modelo de datos

`shopping_items.en_salida boolean not null default false`. Solo tiene sentido en productos pendientes
(`done = false`). Al marcar un producto como comprado, `en_salida` pasa a `false`.

## Flujo

1. **Preparar (en casa).** En la pestaña *Lista de compras* el botón «Voy a comprar» abre el modo de selección:
   las filas pasan a tener check, cada categoría ofrece «Marcar todo / Quitar todo», y una barra inferior
   muestra *Cancelar* y *Guardar salida (N)*. Si ya hay una salida, sus productos llegan marcados (así se edita).
2. **En el súper.** Con salida activa aparece un selector *Toda la lista · N* / *Salida · M*. Al guardar se
   entra directo en *Salida*: solo esos productos, agrupados por categoría y ordenados por lo que más se compra.
3. **Comprar.** Tachar un producto (toque o deslizar) lo marca comprado en la lista común (quién y cuándo)
   y lo saca de la salida. La pareja lo ve desaparecer al instante.
4. **Añadir sobre la marcha.** Lo que se escribe en el campo mientras se ve la *Salida* entra directamente en la salida.
   Un producto de la salida se puede devolver a la lista desde su hoja de edición («Quitar de la salida»).
5. **Cerrar.** El botón «Cerrar salida» devuelve todo lo no comprado a la lista normal (siguen pendientes),
   con opción de deshacer. Al comprar el último producto, la salida se cierra sola.

## Reglas

- Un producto nuevo en la lista **no** entra solo en la salida.
- Si la salida queda vacía (por compras de cualquiera de los dos), la vista vuelve a *Toda la lista*.
- Mientras se prepara la salida se ve siempre la lista completa (sin importar la vista de categorías del móvil).
- Si falta la migración, la lista funciona igual; guardar la salida muestra un aviso de error.

## Ajustes posteriores

- **Nombre:** en pantalla la salida se llama **«Para el súper»** (selector *Toda la lista* / *Para el súper*, botón «Cerrar compra»). En código y base de datos sigue siendo `en_salida`.
- **Plantillas:** en el detalle se puede marcar cualquier producto (también los que ya están en la lista) y elegir entre *A la lista* o *Ya lo compré*. «Ya lo compré» tacha lo pendiente y registra como comprado y en casa lo demás, por lo que cuenta para el ranking.

## Fuera de alcance

Varias salidas con nombre, salidas por supermercado automáticas, cambios en el maestro o en «En casa».

## Archivos

- `supabase/migrations/0027_compras_salida.sql`
- `src/app/(app)/compras/ShoppingList.tsx` (selección, vista Salida, cerrar, plantillas en hoja propia)
- `src/app/(app)/compras/TemplatePane.tsx`, `PickRow.tsx` (se reutilizan)
- Se elimina `QuickPickSheet.tsx`; `lib/compras/suggestions.ts` conserva solo las estadísticas del ranking.

## Cómo probar

1. Con ≥10 productos pendientes: «Voy a comprar» → marca 4 → *Guardar salida*. Debe verse solo esos 4.
2. En otro móvil, la pareja ve la misma salida; al tachar uno, desaparece en ambos.
3. Escribe un producto en *Salida*: entra en la salida.
4. «Cerrar salida»: todo vuelve a *Toda la lista* y «Deshacer» la restaura.
5. Mira móvil (375–430 px) y escritorio.
