import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDocumentHash, validateEngagementKey } from "./store.ts";

test("document hashes are normalized and malformed hashes are rejected", () => {
  const hash = "a".repeat(64);
  assert.equal(normalizeDocumentHash(`sha256:${hash.toUpperCase()}`), hash);
  assert.throws(() => normalizeDocumentHash("not-a-hash"));
});

test("store keys cannot traverse outside the data root", () => {
  assert.doesNotThrow(() => validateEngagementKey("42", 2));
  assert.throws(() => validateEngagementKey("../../tmp/pwn", 0));
  assert.throws(() => validateEngagementKey("1", -1));
  assert.throws(() => validateEngagementKey("1", 3));
});
