export const CATEGORIES = [
  "Frutas y verduras",
  "Carnes y pescados",
  "Lácteos y huevos",
  "Panadería",
  "Despensa",
  "Bebidas",
  "Congelados",
  "Limpieza",
  "Higiene",
  "Otros",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Icono (clave de src/lib/compras/icons.ts) y color de cada categoría predeterminada. */
export const DEFAULT_CATEGORY_STYLE: Record<Category, { icon: string; color: string }> = {
  "Frutas y verduras": { icon: "Apple", color: "moss" },
  "Carnes y pescados": { icon: "Beef", color: "hanko" },
  "Lácteos y huevos": { icon: "Milk", color: "sky" },
  "Panadería": { icon: "Croissant", color: "terracotta" },
  "Despensa": { icon: "Wheat", color: "terracotta" },
  "Bebidas": { icon: "Wine", color: "sakura" },
  "Congelados": { icon: "Snowflake", color: "sky" },
  "Limpieza": { icon: "SprayCan", color: "forest" },
  "Higiene": { icon: "Bath", color: "sakura" },
  "Otros": { icon: "Package", color: "moss" },
};

// El orden importa: las reglas más específicas van primero.
const RULES: [Category, string[]][] = [
  ["Limpieza", [
    "detergente", "lejia", "lavavajillas", "fregasuelos", "suavizante", "limpiador", "limpiacristales",
    "bayeta", "estropajo", "bolsas de basura", "bolsa de basura", "papel de cocina", "desinfectante",
    "esponja", "ambientador", "quitagrasas", "multiusos", "pastillas lavavajillas",
  ]],
  ["Higiene", [
    "dentifrico", "pasta de dientes", "cepillo", "champu", "gel de ducha", "gel", "jabon", "desodorante",
    "papel higienico", "compresas", "tampones", "afeitar", "algodon", "hisopos", "colonia",
    "acondicionador", "panuelos", "toallitas", "enjuague", "hilo dental", "crema", "protector solar",
  ]],
  ["Congelados", ["congelado", "congelada", "congelados", "congeladas", "helado", "helados", "pizza", "croquetas", "nuggets", "empanadillas"]],
  ["Lácteos y huevos", ["leche", "yogur", "yogurt", "yogures", "queso", "mantequilla", "nata", "huevo", "kefir", "cuajada", "requeson", "crema de leche"]],
  ["Despensa", [
    "arroz", "pasta", "fideos", "espagueti", "macarrones", "harina", "azucar", "sal", "aceite", "vinagre",
    "legumbre", "lenteja", "garbanzo", "alubia", "frijol", "tomate frito", "tomate triturado", "conserva",
    "atun", "cafe", "cacao", "cereal", "galleta", "miel", "mermelada", "salsa", "especia", "pimienta",
    "avena", "frutos secos", "chocolate", "sopa", "caldo", "mayonesa", "ketchup", "mostaza", "aceituna",
    "snack", "papas fritas", "patatas fritas", "tortilla de maiz", "levadura", "pure",
  ]],
  ["Bebidas", [
    "agua", "cerveza", "vino", "refresco", "cola", "zumo", "jugo", "tonica", "sidra", "licor", "whisky",
    "ron", "ginebra", "gaseosa", "isotonica", "infusion", "te", "bebida",
  ]],
  ["Panadería", ["pan", "baguette", "tostada", "bollo", "bolleria", "croissant", "magdalena", "bizcocho", "barra", "pan de molde"]],
  ["Carnes y pescados", [
    "pollo", "pavo", "ternera", "cerdo", "cordero", "jamon", "chorizo", "salchicha", "bacon", "panceta",
    "carne", "hamburguesa", "solomillo", "chuleta", "costilla", "pescado", "salmon", "merluza", "bacalao",
    "gamba", "langostino", "mejillon", "calamar", "pulpo", "sardina", "lubina", "dorada", "trucha",
    "fiambre", "salchichon", "lomo", "pechuga", "muslo", "embutido", "mortadela", "marisco",
  ]],
  ["Frutas y verduras", [
    "manzana", "platano", "banana", "naranja", "limon", "pera", "uva", "fresa", "melon", "sandia",
    "melocoton", "kiwi", "aguacate", "palta", "tomate", "cebolla", "ajo", "patata", "papa", "zanahoria",
    "lechuga", "pepino", "pimiento", "calabacin", "berenjena", "brocoli", "coliflor", "espinaca",
    "champinon", "seta", "apio", "puerro", "calabaza", "judias verdes", "ensalada", "perejil", "cilantro",
    "albahaca", "mandarina", "cereza", "mango", "pina", "fruta", "verdura", "maiz", "rucula", "jengibre",
  ]],
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(normalized: string, words: string[], keyword: string) {
  if (keyword.includes(" ")) return normalized.includes(keyword);
  // Palabras cortas: coincidencia exacta (con plural), para que "pan" no atrape "panceta".
  if (keyword.length <= 4) {
    return words.some((w) => w === keyword || w === `${keyword}s` || w === `${keyword}es`);
  }
  return words.some((w) => w.startsWith(keyword));
}

/** Asigna una categoría a partir del nombre del producto. */
export function classify(name: string): Category {
  const normalized = normalize(name);
  const words = normalized.split(" ");
  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => matches(normalized, words, k))) return category;
  }
  return "Otros";
}
