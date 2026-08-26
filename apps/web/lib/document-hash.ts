/**
 * Canonical document hashing that runs in the browser.
 *
 * `@sprintos/schemas` hashes with `node:crypto`, so it only ever runs on the
 * server. That left the reviewer desk able to trust exactly one source — this
 * deployment's own document store — and unable to check a bundle fetched from
 * the pointer the contract itself anchored.
 *
 * The canonical form here must stay byte-identical to the server's, or a hash
 * computed on one side proves nothing on the other. `document-hash.test.ts`
 * asserts the two agree.
 */

/** Object keys sorted at every depth, no incidental whitespace, array order kept. */
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

/** Hex sha256 of the canonical form, via WebCrypto. */
export async function documentHashInBrowser(doc: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(doc));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Case- and prefix-insensitive comparison of two anchored hashes. */
export function hashesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const strip = (value: string) => value.replace(/^sha256:/i, "").toLowerCase();
  return strip(a) === strip(b);
}
