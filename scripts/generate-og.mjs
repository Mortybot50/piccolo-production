// Generates public/og.png — 1200x630 social card with Piccolo Production wordmark.
// Runs as part of `npm run prebuild`. Idempotent.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "public");
const outFile = path.join(outDir, "og.png");

await mkdir(outDir, { recursive: true });

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fafaf9"/>
      <stop offset="100%" stop-color="#f5f5f4"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(80, 240)">
    <text x="0" y="0" font-family="Inter Tight, system-ui, sans-serif" font-weight="800" font-size="120" fill="#18181b">
      <tspan fill="#d97706">P</tspan>iccolo
    </text>
    <text x="0" y="120" font-family="Inter Tight, system-ui, sans-serif" font-weight="500" font-size="64" fill="#52525b">
      Production
    </text>
    <text x="0" y="220" font-family="Inter, system-ui, sans-serif" font-weight="400" font-size="22" fill="#78716c">
      Production and wholesale operations for Piccolo Panini Bar.
    </text>
  </g>
</svg>
`;

await sharp(Buffer.from(svg)).png().toFile(outFile);
console.log(`og.png generated -> ${outFile}`);
