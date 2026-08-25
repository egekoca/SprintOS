/**
 * Traces the raster fox mark into layered vector paths.
 *
 * The supplied PNG is 278x306 with a soft, semi-transparent fringe baked into
 * its alpha channel, so any render above ~278px shows a halo and soft edges.
 * This script recovers the flat colour regions the artwork was drawn from and
 * emits them as paths, which stay crisp at any size and can be shaded.
 *
 * Usage: node scripts/vectorize-fox.mjs SOURCE_PNG OUTPUT_TS
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("../node_modules/.pnpm/pngjs@5.0.0/node_modules/pngjs");

const [, , sourcePath, outputPath] = process.argv;
if (!sourcePath || !outputPath) {
  throw new Error("Usage: node scripts/vectorize-fox.mjs SOURCE_PNG OUTPUT_TS");
}

const png = PNG.sync.read(fs.readFileSync(sourcePath));
const { width, height, data } = png;

const at = (x, y) => (y * width + x) * 4;

/* ------------------------------------------------------------------ layers */
/* The mark is drawn from four flat fills. Classify every solid pixel into one
   of them; the fringe pixels (alpha below the cut) are discarded outright,
   which is what removes the halo. */
const ALPHA_CUT = 140;

function classify(x, y) {
  const i = at(x, y);
  if (data[i + 3] < ALPHA_CUT) return -1;
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  if (r < 110 && b >= g - 12) return 3;          // navy — eye and nose
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 105) return 2;                       // deepest orange — tail shadow
  if (luma < 132) return 1;                       // mid orange
  return 0;                                       // brightest orange
}

const labels = new Int8Array(width * height).fill(-1);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) labels[y * width + x] = classify(x, y);
}

/* Median filter: the source is a JPEG-ish gradient, so raw thresholds produce
   speckle along every tier boundary. Three passes settle it down. */
for (let pass = 0; pass < 3; pass += 1) {
  const next = Int8Array.from(labels);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const tally = new Map();
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const v = labels[(y + dy) * width + (x + dx)];
          tally.set(v, (tally.get(v) || 0) + 1);
        }
      }
      let best = labels[y * width + x];
      let bestCount = 0;
      for (const [v, c] of tally) if (c > bestCount) [best, bestCount] = [v, c];
      next[y * width + x] = best;
    }
  }
  labels.set(next);
}

/* Drop islands smaller than this many pixels — trace noise, not artwork. */
function despeckle(minArea) {
  const seen = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start]) continue;
      const label = labels[start];
      const queue = [start];
      const cells = [];
      seen[start] = 1;
      const border = new Map();
      for (let c = 0; c < queue.length; c += 1) {
        const idx = queue[c];
        cells.push(idx);
        const cx = idx % width;
        const cy = (idx / width) | 0;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (labels[n] === label) {
            if (!seen[n]) { seen[n] = 1; queue.push(n); }
          } else {
            border.set(labels[n], (border.get(labels[n]) || 0) + 1);
          }
        }
      }
      if (cells.length >= minArea || border.size === 0) continue;
      let winner = label;
      let winnerCount = 0;
      for (const [v, c] of border) if (c > winnerCount) [winner, winnerCount] = [v, c];
      for (const idx of cells) labels[idx] = winner;
    }
  }
}
despeckle(110);

/* ---------------------------------------------------------------- contours */
/* Walk the unit edges between inside and outside cells and chain them into
   closed loops. Outer boundaries and holes both fall out of this, and SVG's
   evenodd fill rule resolves them without tracking winding. */
function contoursOf(inside) {
  const key = (x, y) => x * 4096 + y;
  const starts = new Map();
  const push = (ax, ay, bx, by) => {
    const k = key(ax, ay);
    if (!starts.has(k)) starts.set(k, []);
    starts.get(k).push([ax, ay, bx, by]);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) push(x, y, x + 1, y);
      if (!inside(x + 1, y)) push(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) push(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) push(x, y + 1, x, y);
    }
  }

  const loops = [];
  for (const [, list] of starts) {
    while (list.length) {
      const first = list.pop();
      const loop = [[first[0], first[1]]];
      let [, , cx, cy] = first;
      while (!(cx === first[0] && cy === first[1])) {
        const options = starts.get(key(cx, cy));
        if (!options || !options.length) break;
        const edge = options.pop();
        loop.push([edge[0], edge[1]]);
        cx = edge[2];
        cy = edge[3];
      }
      if (loop.length >= 8) loops.push(loop);
    }
  }
  return loops;
}

/* ------------------------------------------------- simplify and smooth */

/* Chaikin corner cutting. The raw contour is a staircase of axis-aligned unit
   steps; rounding it twice before simplifying is what lets the line fitter see
   the underlying curve instead of the pixel grid. */
function chaikin(points, passes = 3) {
  let current = points;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 1) {
      const [ax, ay] = current[i];
      const [bx, by] = current[(i + 1) % current.length];
      next.push([ax + (bx - ax) * 0.25, ay + (by - ay) * 0.25]);
      next.push([ax + (bx - ax) * 0.75, ay + (by - ay) * 0.75]);
    }
    current = next;
  }
  return current;
}

function simplify(points, epsilon) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1;
    let farDist = epsilon;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      const dist = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (dist > farDist) { farDist = dist; far = i; }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/* Corner-preserving Catmull-Rom: sharp turns (the ears, the tail tips) stay
   sharp, everything else becomes a curve. */
function toPath(points, cornerAngle = 68) {
  const n = points.length;
  if (n < 3) return "";
  const angleAt = (i) => {
    const [px, py] = points[(i - 1 + n) % n];
    const [cx, cy] = points[i];
    const [nx, ny] = points[(i + 1) % n];
    const a1 = Math.atan2(cy - py, cx - px);
    const a2 = Math.atan2(ny - cy, nx - cx);
    let d = Math.abs(a2 - a1) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    return d;
  };
  const sharp = points.map((_, i) => angleAt(i) > cornerAngle);
  const fmt = (v) => Math.round(v * 100) / 100;

  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    if (sharp[i] && sharp[(i + 1) % n]) {
      d += `L${fmt(p2[0])} ${fmt(p2[1])}`;
      continue;
    }
    const t = 1 / 6;
    const c1 = sharp[i] ? p1 : [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = sharp[(i + 1) % n] ? p2 : [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return `${d}Z`;
}

function traceLayer(predicate, epsilon = 1.15) {
  return contoursOf(predicate)
    .map((loop) => toPath(simplify(chaikin(loop), epsilon)))
    .filter(Boolean)
    .join(" ");
}

/* Each tier is traced together with every tier stacked above it, so the layers
   overlap instead of meeting at a hairline seam. */
const solid = (x, y) => labels[y * width + x] >= 0;
const tierAtLeast = (max) => (x, y) => {
  const v = labels[y * width + x];
  return v >= 0 && v <= max;
};

const out = {
  width,
  height,
  silhouette: traceLayer(solid),
  bright: traceLayer(tierAtLeast(0)),
  mid: traceLayer(tierAtLeast(1)),
  deep: traceLayer(tierAtLeast(2)),
  navy: traceLayer((x, y) => labels[y * width + x] === 3, 0.8),
};

const banner = `/**
 * Generated by scripts/vectorize-fox.mjs from public/brand/sprintos-fox.png.
 * Do not edit by hand — re-run the script if the source artwork changes.
 *
 * Coordinates are in the ${out.width}x${out.height} space of the original mark.
 * Every path is filled with fill-rule="evenodd" so the ear and muzzle cut-outs
 * read as holes.
 */
`;

const body = ["width", "height", "silhouette", "mid", "bright", "navy"]
  .map((key) => {
    const value = typeof out[key] === "number" ? out[key] : JSON.stringify(out[key]);
    return `export const ${key.toUpperCase()} = ${value};`;
  })
  .join("\n\n");

fs.writeFileSync(outputPath, `${banner}\n${body}\n`);
for (const k of ["silhouette", "bright", "mid", "deep", "navy"]) {
  console.log(k.padEnd(11), `${out[k].length} chars`);
}
