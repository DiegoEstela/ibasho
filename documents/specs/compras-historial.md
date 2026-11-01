# Compras · carrito, terminar compra e historial

Estado: implementada · Migración: `0030_compras_historial.sql`

- Tachar un producto lo mete al **carrito** (`shopping_items.en_carrito`). Una barra inferior muestra «Carrito · N» y «Terminar compra».
- **Terminar compra** (`FinishPane`): precio total + tienda opcional. Guarda `shopping_purchases` + copia del detalle en `shopping_purchase_items`, vacía el carrito y devuelve a la lista lo no tachado de «Para el súper».
- **Historial** (`HistoryPane`, botón «Historial»): compras por mes con su detalle. «Pasar a Gastos» (`actions.ts`) crea un gasto «Supermercado» con `save_expense`, reparto a partes iguales, con la tarjeta y el pagador elegidos; enlaza `expense_id` y deshace el gasto si el enlace falla.
- Lo tachado antes de la migración no entra al historial. Sin migración, tachar funciona igual y terminar compra avisa de error.
- **Buscador**: lupa junto al «+» de la lista de compras; filtra sin tildes ni mayúsculas.
- **Tarjetas**: la lista se llama «Por pagar» y las compras sin cuotas pendientes van a «Pagadas · N» (desplegable).
