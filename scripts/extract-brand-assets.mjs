import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("../node_modules/.pnpm/pngjs@5.0.0/node_modules/pngjs");

const sourcePath = process.argv[2];
const outputDirectory = process.argv[3];

if (!sourcePath || !outputDirectory) {
  throw new Error("Usage: node scripts/extract-brand-assets.mjs SOURCE_PNG OUTPUT_DIRECTORY");
}

const source = PNG.sync.read(fs.readFileSync(sourcePath));

// Measured once against the supplied 1536×1024 artwork. The source file has a
// checkerboard baked into RGB, so the masks below deliberately select the logo
// itself rather than pretending those background pixels are transparency.
const fullBounds = { x: 288, y: 340, width: 978, height: 306 };
const foxBounds = { x: 288, y: 340, width: 278, height: 306 };
const wordBounds = { x0: 565, y0: 420, x1: 1260, y1: 610 };

function pixelIndex(x, y) {
  return (y * source.width + x) * 4;
}

function isWordSeed(x, y) {
  if (x < wordBounds.x0 || x >= wordBounds.x1 || y < wordBounds.y0 || y >= wordBounds.y1) return false;
  const i = pixelIndex(x, y);
  return source.data[i] > 245 && source.data[i + 1] > 245 && source.data[i + 2] > 245;
}

function findWordMask() {
  const visited = new Uint8Array(source.width * source.height);
  const mask = new Uint8Array(source.width * source.height);
  const components = [];

  for (let y = wordBounds.y0; y < wordBounds.y1; y += 1) {
    for (let x = wordBounds.x0; x < wordBounds.x1; x += 1) {
      const start = y * source.width + x;
      if (visited[start] || !isWordSeed(x, y)) continue;

      const queue = [[x, y]];
      const pixels = [];
      visited[start] = 1;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [qx, qy] = queue[cursor];
        pixels.push(qy * source.width + qx);
        for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) {
          if (nx < wordBounds.x0 || nx >= wordBounds.x1 || ny < wordBounds.y0 || ny >= wordBounds.y1) continue;
          const next = ny * source.width + nx;
          if (!visited[next] && isWordSeed(nx, ny)) {
            visited[next] = 1;
            queue.push([nx, ny]);
          }
        }
      }
      if (pixels.length >= 400) components.push(pixels);
    }
  }

  for (const component of components) {
    for (const point of component) mask[point] = 255;
  }

  // Restore the source artwork's antialiased outline without allowing the
  // adjacent checker tiles to become connected foreground shapes.
  const expanded = mask.slice();
  for (let y = wordBounds.y0; y < wordBounds.y1; y += 1) {
    for (let x = wordBounds.x0; x < wordBounds.x1; x += 1) {
      const point = y * source.width + x;
      if (!mask[point]) continue;
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          const distance = Math.hypot(ox, oy);
          if (distance > 2.25 || nx < 0 || nx >= source.width || ny < 0 || ny >= source.height) continue;
          const next = ny * source.width + nx;
          expanded[next] = Math.max(expanded[next], distance < 1.25 ? 205 : 105);
        }
      }
    }
  }
  return expanded;
}

const wordMask = findWordMask();

function foxAlpha(x, y) {
  if (x < foxBounds.x || x >= foxBounds.x + foxBounds.width || y < foxBounds.y || y >= foxBounds.y + foxBounds.height) return 0;
  const i = pixelIndex(x, y);
  const r = source.data[i];
  const g = source.data[i + 1];
  const b = source.data[i + 2];
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const luminance = (r + g + b) / 3;
  return Math.max(0, Math.min(255, Math.max(chroma * 5.5, (215 - luminance) * 8)));
}

function render(bounds, includeWordmark) {
  const output = new PNG({ width: bounds.width, height: bounds.height, colorType: 6 });
  output.data.fill(0);

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const sx = bounds.x + x;
      const sy = bounds.y + y;
      const sourceIndex = pixelIndex(sx, sy);
      const outputIndex = (y * bounds.width + x) * 4;
      const wordAlpha = includeWordmark ? wordMask[sy * source.width + sx] : 0;
      const alpha = Math.max(foxAlpha(sx, sy), wordAlpha);

      if (wordAlpha > foxAlpha(sx, sy)) {
        output.data[outputIndex] = 255;
        output.data[outputIndex + 1] = 255;
        output.data[outputIndex + 2] = 255;
      } else {
        output.data[outputIndex] = source.data[sourceIndex];
        output.data[outputIndex + 1] = source.data[sourceIndex + 1];
        output.data[outputIndex + 2] = source.data[sourceIndex + 2];
      }
      output.data[outputIndex + 3] = alpha;
    }
  }
  return PNG.sync.write(output);
}

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "sprintos-logo.png"), render(fullBounds, true));
fs.writeFileSync(path.join(outputDirectory, "sprintos-fox.png"), render(foxBounds, false));
