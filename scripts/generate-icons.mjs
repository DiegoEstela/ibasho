// Genera los PNG de la PWA a partir de public/icons/logo.svg
// Uso: node scripts/generate-icons.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icons/logo.svg", import.meta.url));
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;

const logo = (size) => sharp(svg, { density: 512 }).resize(size, size).png().toBuffer();

// Iconos normales: sello sobre fondo transparente
for (const size of [192, 512]) {
  await sharp(await logo(size)).toFile(out(`icon-${size}.png`));
}

// Maskable: fondo rojo a sangre, sello dentro de la zona segura (~72%)
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#c8382f" },
})
  .composite([{ input: await logo(368), gravity: "center" }])
  .png()
  .toFile(out("maskable-512.png"));

// iOS: sin transparencia, sobre papel washi
await sharp({
  create: { width: 180, height: 180, channels: 4, background: "#f7f0e1" },
})
  .composite([{ input: await logo(150), gravity: "center" }])
  .png()
  .toFile(out("apple-touch-icon.png"));

console.log("Iconos generados en public/icons");
