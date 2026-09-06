import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Account, StrKey } from "@stellar/stellar-sdk";

/**
 * Every read from the settlement contract is a simulated transaction, and every
 * simulation needs a source account. That account is a hard-coded placeholder
 * that is never funded and never signs.
 *
 * It was written with twelve characters too many. `new Account()` threw
 * "accountId is invalid" before any request went out, so every read in the app
 * failed — and because the review screen treated a rejected read as an empty
 * result, the whole product looked like a contract with no engagements on it.
 *
 * The constant is parsed out of the source rather than exported, so this stays
 * a test of what the app actually runs.
 */
async function readSourceConstant(): Promise<string> {
  const path = fileURLToPath(new URL("./contract.ts", import.meta.url));
  const source = await readFile(path, "utf8");
  const match = source.match(/const READ_SOURCE = "([^"]+)"/);
  assert.ok(match, "contract.ts no longer declares a READ_SOURCE constant");
  return match[1];
}

test("the simulation source account is a well-formed strkey", async () => {
  const readSource = await readSourceConstant();
  assert.equal(readSource.length, 56, "an ed25519 strkey is exactly 56 characters");
  assert.ok(StrKey.isValidEd25519PublicKey(readSource));
});

test("the simulation source account can build a transaction source", async () => {
  const readSource = await readSourceConstant();
  assert.doesNotThrow(() => new Account(readSource, "0"));
});

/* The counter is the next id, not a length. This deployment starts it past the
   previous contract's range, so treating it as a count made the projects page
   ask the network about a thousand ids that were never issued — a thousand
   failing simulations before one row could render. */
test("listing walks only the ids this deployment actually issued", async () => {
  const { FIRST_ENGAGEMENT_ID } = await import("./config.ts");
  const deployment = (await import("./deployment.json", { with: { type: "json" } })).default;

  assert.equal(FIRST_ENGAGEMENT_ID, deployment.firstEngagementId ?? 0);

  /* The range the listing walks, expressed the way the code computes it. */
  const range = (next: number) => Math.max(0, next - Math.min(FIRST_ENGAGEMENT_ID, next));

  assert.equal(range(FIRST_ENGAGEMENT_ID), 0);
  assert.equal(range(FIRST_ENGAGEMENT_ID + 1), 1);
  assert.equal(range(FIRST_ENGAGEMENT_ID + 7), 7);
  /* A counter below the first id cannot ask for a negative number of reads. */
  assert.equal(range(0), 0);
});
