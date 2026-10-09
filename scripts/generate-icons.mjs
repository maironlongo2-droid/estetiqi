// Gera os ícones PNG usados pelo manifest PWA e pelo iOS a partir dos SVGs
// versionados em /public. Os PNGs resultantes também são versionados, então
// este script só precisa ser executado quando a marca mudar.
//
// Uso: node scripts/generate-icons.mjs
// Depende de "sharp", que já vem instalado como dependência do Next.js.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function render(svgPath, size, outPath) {
  const svg = await readFile(svgPath);
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`gerado ${path.relative(root, outPath)} (${size}x${size})`);
}

const iconSvg = path.join(root, "public", "icon.svg");
const maskableSvg = path.join(root, "public", "icon-maskable.svg");

await render(iconSvg, 192, path.join(root, "public", "icon-192.png"));
await render(iconSvg, 512, path.join(root, "public", "icon-512.png"));
await render(maskableSvg, 512, path.join(root, "public", "icon-maskable-512.png"));
// apple-touch-icon: o iOS aplica a própria máscara de cantos, então usamos a
// versão de fundo cheio (maskable) em 180x180.
await render(maskableSvg, 180, path.join(root, "src", "app", "apple-icon.png"));
