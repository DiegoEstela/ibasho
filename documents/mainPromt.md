Actúa como un desarrollador full-stack senior y diseñador de producto. Quiero que construyas "Ibasho" (居場所, en japonés "el lugar al que perteneces, donde te sientes en casa"), una app web progresiva (PWA) para gestionar la vida en pareja en el hogar: compras, gastos, viajes, deseos, notas y tareas. La usaremos 2 personas (mi pareja y yo) desde el móvil, en España (idioma español, moneda EUR, formato de fecha dd/mm/aaaa).

## 1. Stack y requisitos técnicos

- Framework: Next.js (última versión estable, App Router) + TypeScript + Tailwind CSS. Antes de escribir código revisa la documentación de la versión instalada.
- Mobile-first: diseñado para pantallas de 375–430 px; en escritorio se ve centrado como un móvil.
- PWA instalable: manifest, iconos, service worker, pantalla de splash, funciona offline en modo lectura (lista de compras y notas cacheadas) y sincroniza al volver la conexión. Debe poder "Añadir a pantalla de inicio" en iOS y Android.
- Hosting: Vercel (plan gratis). Variables de entorno documentadas en `.env.example`.
- Backend: Supabase (plan gratis):
  - Auth por email (magic link + opción de contraseña).
  - Postgres con Row Level Security: cada dato pertenece a un "hogar" (household) y solo lo ven sus miembros.
  - Storage para archivos (tickets de supermercado, entradas, billetes, PDFs).
  - Realtime para que los cambios de uno aparezcan al instante en el móvil del otro.
- IA: Google Gemini (plan gratis, modelo con visión) para leer tickets y para interpretar mensajes en lenguaje natural del bot. Encapsula la llamada en un módulo `lib/ai` para poder cambiar de proveedor.
- Notificaciones: Web Push (funciona en iOS 16.4+ con la PWA instalada) para recordatorios de tareas y mensajes del día.
- Código limpio, componentes reutilizables, migraciones SQL versionadas en `supabase/migrations`, datos de ejemplo (seed) y un README con pasos de instalación y despliegue.

## 2. Diseño: iOS + inspiración Studio Ghibli + cultura japonesa

La base de interacción es iOS (usabilidad, claridad, gestos); la piel visual y la esencia son japonesas, con la calidez de las películas de Studio Ghibli.

**Estructura iOS (no negociable)**

- Patrones nativos de iOS: listas agrupadas tipo "Settings", tarjetas con bordes redondeados, barra de pestañas inferior con iconos, cabeceras grandes ("Large Title") que se encogen al hacer scroll, hojas modales (bottom sheets) para crear y editar, gestos de deslizar para borrar o completar.
- Muy intuitiva: crear cualquier cosa en máximo 2 toques (botón "+" flotante o en la cabecera), feedback háptico/visual al completar.
- Navegación: tab bar con Inicio · Compras · Cocina · Gastos · Más (Más contiene Viajes, Wishlist, Notas, Tareas, Ajustes).

**Estética inspirada en Studio Ghibli** (solo inspiración: no usar personajes, logos, fotogramas ni ningún material con copyright de Ghibli; todo debe ser original)

- Paleta cálida y natural tipo acuarela: verdes de bosque y musgo, azul cielo, crema/papel washi, terracota, toques de rosa sakura. Fondos con textura suave de papel en lugar de gris plano.
- Ilustraciones originales de estilo pintado a mano para estados vacíos, splash y cabeceras de módulo (por ejemplo: una casita con jardín para Inicio, una cocina humeante para Cocina, un tren entre colinas para Viajes, plantas para Tareas). Si no puedes generar ilustraciones, deja componentes `<Illustration name="…">` con SVG sencillos y placeholders bien documentados para sustituirlos.
- Microanimaciones suaves y orgánicas: hojas o pétalos que caen al completar una tarea, nubes que se mueven lentamente en el Inicio, transiciones con easing suave. Respetar `prefers-reduced-motion`.
- Modo oscuro como "noche de verano": azules profundos, luciérnagas o estrellas sutiles, tonos cálidos en los acentos.

**Cultura japonesa en el nombre, el logo y la esencia**

- Nombre: "Ibasho" con los kanji 居場所 visibles en el logo, el splash y la pantalla de bienvenida.
- Logo/icono de app: original y sencillo, por ejemplo una casita japonesa (tejado tradicional) con una ventana iluminada y dos figuras o una rama de sakura, dentro de un círculo tipo hanko (sello japonés) rojo. Entregar SVG y los PNG necesarios para la PWA.
- Esencia: cada módulo con un nombre secundario en japonés (por ejemplo Compras · 買い物 Kaimono, Cocina · 台所 Daidokoro, Gastos · お金 Okane, Viajes · 旅 Tabi, Wishlist · 願い Negai, Notas · メモ Memo, Tareas · 家事 Kaji, Mensajes · 手紙 Tegami).
- Detalles culturales: saludo de Inicio según la hora ("Ohayō", "Konnichiwa", "Konbanwa"), un pequeño detalle estacional (sakura en primavera, hojas de arce en otoño, nieve en invierno), separadores con motivos tradicionales (seigaiha, asanoha) muy sutiles, y principios de calma tipo _ma_ (espacio vacío) y _wabi-sabi_ (sencillez, imperfección bonita).
- Tipografía: sistema iOS (-apple-system / SF Pro) para el texto y una fuente japonesa de Google Fonts (por ejemplo Zen Maru Gothic o Klee One) solo para títulos, kanji y detalles decorativos.
- Iconos claros y consistentes (estilo lineal redondeado, por ejemplo lucide-react), cada módulo con su color de acento de la paleta.
- La legibilidad y la accesibilidad (contraste AA, tamaños táctiles de 44 px) mandan por encima de la decoración.

## 3. Usuarios y hogar

- Registro e inicio de sesión con email.
- Un usuario crea un "Hogar" y genera un enlace o código de invitación; la pareja se une con su email.
- Cada usuario tiene nombre, avatar y color (para identificar visualmente quién hizo o pagó qué).
- Preparar el modelo para que un hogar pueda tener más de 2 miembros, aunque el caso principal sea la pareja.

## 4. Pantalla de Inicio

- Al abrir la app aparece primero el **mensaje del día** que dejó la pareja (ver módulo 8), como una tarjeta o modal bonito; al cerrarlo queda marcado como leído.
- Resumen: cuántas cosas faltan en la lista de compras, balance actual ("Le debes 23,40 € a Ana"), próximas cuotas de la tarjeta, tareas de hoy y próximo viaje.

## 5. Módulos

### Módulo 1 · Compras del hogar

1. **Lista de lo que falta**:
   - Añadir producto rapidísimo: un campo siempre visible tipo "Añadir…", autocompletado con productos usados antes y sugerencias frecuentes.
   - Categorías automáticas (limpieza, higiene, frutería, lácteos, congelados…), cantidad opcional, nota opcional, supermercado preferido opcional.
   - Marcar como comprado con un toque o deslizando; queda registrado quién y cuándo.
   - Sincronización en tiempo real entre los dos móviles.
2. **Bot de Telegram** (integración de chat):
   - Bot que escucha mensajes en un chat privado o en un grupo de los dos.
   - Vinculación: desde Ajustes de la app se genera un código y se envía al bot (`/vincular CODIGO`) para asociar la cuenta de Telegram al usuario y al hogar.
   - Mensajes en lenguaje natural: "falta dentífrico", "comprar leche y 2 de yogures", "añade papel higiénico" → se agregan a la lista (usar Gemini para separar productos y cantidades, con un fallback de reglas simples).
   - Comandos: `/lista` (muestra lo que falta), `/comprado X`, `/borrar X`.
   - Enviar una foto o PDF de un ticket al bot también lo procesa (ver punto 3).
   - Implementación con webhook en una API route de Next.js (`/api/telegram`), verificando el secret token.
   - Diseñar la capa de mensajería desacoplada (`lib/messaging`) para poder añadir WhatsApp Cloud API en el futuro.
3. **Lectura de tickets (Mercadona, Consum, Dia y otros)**:
   - Subir una foto o el PDF del ticket (desde la app o el bot).
   - Gemini con visión extrae: supermercado, fecha, total y líneas (nombre del producto, cantidad, precio unitario, importe). Respuesta en JSON validado con un esquema (zod).
   - Pantalla de revisión antes de guardar: el usuario puede corregir líneas.
   - **Normalización**: cada línea del ticket se asocia a un "producto canónico" (por ejemplo "DENTIFRICO COLGATE 75ML" → "Dentífrico"). La app aprende las asociaciones que corrige el usuario.
   - Al confirmar: los productos de la lista que aparecen en el ticket se marcan automáticamente como comprados, y el ticket se guarda en Storage.
   - Opcional: crear automáticamente un gasto compartido con el total del ticket, indicando quién pagó.
4. **Estadísticas**:
   - Por producto: cuántas veces se compra al mes, frecuencia media entre compras, precio medio y su evolución.
   - Gasto mensual por supermercado y por categoría (gráficos simples).
   - Top productos más comprados.
5. **V2 (dejar preparado, no implementar todavía)**: "Compra sugerida" que, a partir del historial y la frecuencia de cada producto, proponga qué comprar esta semana y avise de lo que probablemente se esté acabando.

### Módulo 2 · Tarjeta de crédito y cuotas

- Registrar compras con tarjeta: descripción, comercio, fecha, importe total, número de cuotas, interés opcional, tarjeta (puede haber varias) y **quién la pagó o a quién corresponde** (yo, mi pareja, compartida al 50% o con otro porcentaje).
- Calcular automáticamente: importe de cada cuota, cuotas pagadas, **cuotas restantes** y fecha de la última cuota.
- Vista "Próximos meses": cuánto se pagará cada mes por tarjeta y por persona (proyección).
- Marcar cuotas como pagadas (automático por fecha, con posibilidad de ajuste manual).
- Resumen: total pendiente por persona y por tarjeta.
- Opción de enviar una compra compartida al módulo de gastos compartidos.

### Módulo 3 · Gastos compartidos (estilo Tricount / Splitwise)

- Registrar gasto: concepto, importe, fecha, categoría, **quién pagó**, entre quiénes se divide (partes iguales, porcentajes o importes exactos) y foto del recibo opcional.
- **Balance en tiempo real**: quién debe a quién y cuánto, con algoritmo de simplificación de deudas.
- Registrar "liquidaciones" (pagos para saldar la deuda).
- Historial filtrable por mes, categoría y persona; resumen mensual del gasto del hogar.
- Exportar a CSV.

### Módulo 4 · Viajes

Cada viaje (nombre, destino, fechas, foto de portada, participantes) tiene 3 pestañas:

1. **Gastos del viaje**: mismo motor que el Tricount del módulo 3 (reutilizar el código), con balance propio del viaje. Permitir participantes invitados que no tienen cuenta (por ejemplo, amigos que viajan con nosotros). Soporte de varias monedas con conversión a EUR.
2. **Documentos**: subir y organizar billetes de tren o avión, entradas de museo, reservas de hotel, seguros… (PDF o imagen), con nombre, tipo, fecha y hora. Vista ordenada por fecha para tenerlo todo a mano durante el viaje, disponible offline.
3. **Lugares y cosas por hacer**: lista de sitios (restaurantes, museos, miradores…) con nombre, enlace a Google Maps, nota, categoría y estado (pendiente, hecho o favorito).

### Módulo 5 · Wishlist

- Elementos con título, URL del producto, precio aproximado opcional, prioridad, para quién o de quién es, y estado (deseado o comprado).
- Al pegar la URL, intentar obtener automáticamente la imagen y el título (metadatos Open Graph) desde una API route.
- Varias listas posibles (por ejemplo, "Casa", "Regalos", "Tecnología").

### Módulo 6 · Notas importantes (medidas y datos de la casa)

- Notas rápidas para guardar información útil: "fotos para los cuadros 40 × 40 cm", "cama 170 × 190 cm (comprar sábanas de esa medida)", "contraseña del wifi de invitados", "talla de zapatos".
- Título, contenido, categoría o etiqueta (Medidas, Casa, Electrodomésticos, Salud…), foto opcional y fijar arriba.
- Buscador rápido.

### Módulo 7 · Tareas y actividades del hogar

- Tareas como "regar las plantas", "tender la ropa", "sacar la basura", "cambiar las sábanas".
- Recurrencia (diaria, cada X días, semanal en días concretos, mensual), asignación a una persona o a cualquiera, hora de recordatorio con notificación push.
- Vista "Hoy" y "Próximos días"; al completarla se registra quién la hizo y se programa la siguiente.
- Pequeño contador o estadística de quién hizo cada tarea (en tono amistoso).

### Módulo 8 · Mensajes del día (notitas)

- Escribir una notita para la pareja ("¡Que tengas un hermoso día!").
- Se muestra al otro la próxima vez que abra la app (modal o tarjeta destacada en Inicio) y opcionalmente con notificación push.
- Opción de programarla para una fecha concreta.
- Reacciones con emoji y un historial de notitas, como un pequeño "diario" de la pareja.

### Módulo 9 · Cocina: platos y recetas (台所 Daidokoro)

- **Recetario**: cada receta con nombre, foto, porciones, tiempo de preparación, dificultad, ingredientes (cantidad + unidad + producto, enlazados a los productos canónicos del módulo de compras), pasos numerados, etiquetas (rápida, vegetariana, japonesa, para invitados…) y notas.
- Importar receta desde una URL (leer el schema.org/Recipe de la web, con Gemini como fallback) o desde una foto de un libro de cocina (Gemini con visión).
- **"Añadir a la lista"**: con un toque, los ingredientes que faltan pasan a la lista de compras (preguntar cuáles ya tenemos), ajustando cantidades según las porciones.
- **Menú semanal**: calendario de lunes a domingo (comida y cena) donde arrastrar o elegir recetas; botón para generar la lista de compras de toda la semana agrupando ingredientes.
- **Platos favoritos** y "¿qué cocinamos hoy?": sugerencia aleatoria entre favoritos o según lo que ya hay en casa.
- Valoración de cada plato por cada uno (para saber cuáles repetir) e historial de cuándo se cocinó.
- Modo cocina: pantalla de pasos grande, sin que se apague la pantalla (Wake Lock API).

## 6. Módulos extra (sugeridos, implementar después de los anteriores)

- **Recibos y suscripciones fijas**: luz, agua, gas, internet, alquiler, Netflix, Spotify… con importe, día de cobro, quién paga y aviso antes del vencimiento; se suman a la vista mensual de gastos.
- **Inventario y garantías**: electrodomésticos y muebles con fecha de compra, ticket o factura, garantía y manual (avisar cuando caduca la garantía).
- **Calendario compartido**: eventos de la casa (visita del técnico, cumpleaños, ITV del coche), con vista que integre tareas, cuotas y viajes.
- **Presupuesto mensual**: límite por categoría (supermercado, ocio…) con barra de progreso.

## 7. Modelo de datos (orientativo)

households, household_members, profiles, shopping_items, products (canónicos), produSct_aliases, receipts, receipt_lines, purchases_history, cards, card_purchases, card_installments, expense_groups (hogar o viaje), expenses, expense_Ssplits, settlements, trips, trip_participants, trip_documents, trip_places, wishlists, wishlist_items, recipes, recipe_ingredients, recipe_steps, meal_plan_entries, recipe_ratings, notes, tasks, task_completions, daily_messages, telegram_links, push_subscriptions. Todas las tablas con `household_id`, `created_by`, timestamps y RLS.

## 8. Plan de entrega por fases

1. Base + Cocina: proyecto Next.js + Supabase, auth, hogar e invitación, sistema de diseño (paleta Ghibli, tipografías, logo 居場所, ilustraciones base), layout iOS con tab bar, PWA instalable, despliegue en Vercel y **módulo de Cocina (platos, recetas y menú semanal)**. Como la lista de compras completa llega en la fase 2, en esta fase crea ya la tabla de productos canónicos y una lista de compras mínima para que "Añadir a la lista" funcione desde el principio.
2. Lista de compras con tiempo real + bot de Telegram.
3. Gastos compartidos (motor Tricount) + tarjeta de crédito y cuotas.
4. Lectura de tickets con IA + estadísticas.
5. Viajes (reutilizando el motor de gastos), wishlist, notas, tareas y mensajes del día.
6. Notificaciones push, modo offline y pulido visual.
7. Módulos extra y V2 de compra sugerida.

Al terminar cada fase: explica qué hiciste, cómo probarlo y qué variables o configuración externa necesito (Supabase, bot de Telegram con BotFather, API key de Gemini, claves VAPID para push). Antes de empezar, hazme las preguntas que consideres necesarias y propón la estructura de carpetas.
