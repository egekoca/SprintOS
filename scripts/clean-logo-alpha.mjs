/**
 * Remove the soft fringe baked into the extracted wordmark's alpha channel.
 *
 * The supplied artwork has no alpha at all — its background is real grey pixels
 * — so the mask that pulled the logo out of it left tens of thousands of
 * partially transparent pixels around every letter. On a dark header those read
 * as a pale rectangle behind the logo.
 *
 * Anything below the cut becomes fully transparent; anything above it becomes
 * fully opaque with its colour restored, since a half-transparent pixel over a
 * grey plate is a grey pixel, not a soft edge worth keeping.
 *
 * Usage: node scripts/clean-logo-alpha.mjs SOURCE_PNG OUTPUT_PNG
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("../node_modules/.pnpm/pngjs@5.0.0/node_modules/pngjs");

const [, , sourcePath, outputPath] = process.argv;
if (!sourcePath || !outputPath) {
  throw new Error("Usage: node scripts/clean-logo-alpha.mjs SOURCE_PNG OUTPUT_PNG");
}

const png = PNG.sync.read(fs.readFileSync(sourcePath));
const ALPHA_CUT = 150;

let cleared = 0;
let kept = 0;
for (let i = 0; i < png.data.length; i += 4) {
  if (png.data[i + 3] < ALPHA_CUT) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
    cleared += 1;
  } else {
    png.data[i + 3] = 255;
    kept += 1;
  }
}

fs.writeFileSync(outputPath, PNG.sync.write(png));
console.log(`cleared ${cleared} fringe pixels, kept ${kept} opaque`);
