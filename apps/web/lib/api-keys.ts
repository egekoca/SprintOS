import { createHash, randomBytes } from "node:crypto";

/**
 * Review API keys.
 *
 * The key itself is shown to its issuer exactly once, at mint time, and
 * never again — the store only ever holds its sha256 hash, so a leaked
 * document store (or a leaked backup of it) hands an attacker nothing
 * usable, the same reasoning session tokens get hashed for.
 */

export function generateApiKey(): string {
  return `sk_${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
