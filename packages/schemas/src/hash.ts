import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted at every depth, no incidental whitespace.
 *
 * Two systems must agree byte-for-byte on what was hashed, or the hash anchored
 * on chain proves nothing. Array order is meaningful and preserved.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([k, v]) => [k, sortDeep(v)]));
}

/** Hex sha256 of the canonical form. */
export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

/** The `sha256:<hex>` form used inside reports. */
export function sha256Prefixed(value: unknown): string {
  return `sha256:${sha256Hex(value)}`;
}

/**
 * Hex sha256 of a document, for anchoring on chain.
 *
 * `criteria_hash` and `evidence_hash` in the contract are exactly this value.
 */
export function documentHash(doc: unknown): string {
  return sha256Hex(doc);
}

/** Convert a hex hash to the byte array the Soroban client expects. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("sha256:") ? hex.slice(7) : hex;
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`Expected a 32-byte hex hash, received: ${hex}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
