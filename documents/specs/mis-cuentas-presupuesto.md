# Mis cuentas · tarjetas privadas, fijos y presupuesto

Estado: implementada · Migración: `0033_mis_cuentas_tarjetas_fijos_presupuesto.sql`

Cuatro pestañas: **Este mes** (resumen real y gráficos), **Movimientos** (lista, filtros, búsqueda), **Presupuesto** (mes elegido, arranca en el que viene) y **Tarjetas y fijos**.

- **Tarjetas privadas** (`personal_cards`, RLS `user_id = auth.uid()`): débito con saldo (inicial + ingresos − gastos) y crédito con días de cierre/pago. Se usan en «Pagado con» (`personal_entries.personal_card_id`). También salen las tarjetas del hogar de las que eres titular o compartidas.
- **Fijos propios** (`personal_fixed`): se convierten en movimientos `source: "fijo"` desde su mes de inicio, con fecha de cobro.
- **Mitad de los fijos del hogar** (`personal_fixed_shares`, 50 % por defecto, editable): solo del mes actual en adelante, y solo si ese mes aún no se pasó a Gastos (si ya se pasó, entra por tu parte del gasto compartido: no se cuenta dos veces). Los meses pasados salen de los gastos compartidos reales.
- **Presupuesto** (`lib/personal/presupuesto.ts`): ingresos (plan + extra) − fijos propios − mitad de fijos del hogar − cuotas − otros gastos − ahorro (meta mensual). Topes por categoría en `personal_budgets`.
- **Cuenta de hoy**: también resta los fijos que ya vencieron desde que indicaste el saldo.
- **Descarga CSV**: lo que ves, todo el historial (hasta este mes) y el presupuesto del mes elegido.
- Sin la migración 0033, Mis cuentas muestra el aviso de error (la consulta de movimientos ya pide `personal_card_id`).
