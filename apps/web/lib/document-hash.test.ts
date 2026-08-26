import test from "node:test";
import assert from "node:assert/strict";
import { documentHash, canonicalize as serverCanonicalize } from "@sprintos/schemas";
import { canonicalize, documentHashInBrowser, hashesMatch } from "./document-hash.ts";

/**
 * The whole point of anchoring a hash is that two systems agree on it. The
 * browser copy of the canonical form exists only so the reviewer desk can
 * verify a document it did not fetch from its own store; the moment it drifts
 * from the server's, it would start rejecting good documents or — far worse —
 * accepting altered ones.
 */
const SAMPLES: unknown[] = [
  { schema_version: "1.0.0", engagement_id: "7", milestone_idx: 0, title: "Ship it", criteria: [{ id: "c1", text: "Tests pass" }] },
  { z: 1, a: 2, m: { y: [3, 2, 1], b: null } },
  { links: [{ url: "https://example.com/a", type: "repo" }, { url: "https://example.com/b", type: "docs" }] },
  { nested: { deeply: { sorted: { keys: true, and: "values" } } }, top: [1, "two", false] },
  { unicode: "ölçüm — “quoted” 🦊", empty: {}, emptyList: [] },
  {},
];

test("the browser canonical form matches the server's byte for byte", () => {
  for (const sample of SAMPLES) {
    assert.equal(canonicalize(sample), serverCanonicalize(sample));
  }
});

test("the browser hash matches the hash anchored on chain", async () => {
  for (const sample of SAMPLES) {
    assert.equal(await documentHashInBrowser(sample), documentHash(sample));
  }
});

test("key order in the source object does not change the hash", async () => {
  const a = { b: 2, a: 1, c: { y: 2, x: 1 } };
  const b = { c: { x: 1, y: 2 }, a: 1, b: 2 };
  assert.equal(await documentHashInBrowser(a), await documentHashInBrowser(b));
});

test("array order does change the hash", async () => {
  assert.notEqual(
    await documentHashInBrowser({ l: [1, 2] }),
    await documentHashInBrowser({ l: [2, 1] }),
  );
});

test("hash comparison ignores case and the sha256: prefix", () => {
  const hex = "a".repeat(64);
  assert.ok(hashesMatch(hex, `sha256:${hex.toUpperCase()}`));
  assert.ok(!hashesMatch(hex, "b".repeat(64)));
  assert.ok(!hashesMatch(null, hex));
  assert.ok(!hashesMatch(hex, undefined));
});
