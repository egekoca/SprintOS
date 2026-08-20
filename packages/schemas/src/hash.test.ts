import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, sha256Hex, hexToBytes } from "./hash.ts";

test("key order does not change the canonical form", () => {
  assert.equal(
    canonicalize({ b: 1, a: 2 }),
    canonicalize({ a: 2, b: 1 }),
  );
});

test("nested keys are sorted too", () => {
  assert.equal(canonicalize({ x: { z: 1, y: 2 } }), '{"x":{"y":2,"z":1}}');
});

test("array order is preserved because it carries meaning", () => {
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]));
});

test("undefined fields are dropped rather than hashed as null", () => {
  assert.equal(canonicalize({ a: 1, b: undefined }), '{"a":1}');
});

test("the same document always hashes to the same value", () => {
  const doc = { title: "Milestone", criteria: [{ id: "c1", text: "Tests pass" }] };
  assert.equal(sha256Hex(doc), sha256Hex({ ...doc }));
  assert.match(sha256Hex(doc), /^[0-9a-f]{64}$/);
});

test("a changed document hashes differently", () => {
  assert.notEqual(
    sha256Hex({ text: "Tests pass" }),
    sha256Hex({ text: "Tests pass." }),
  );
});

test("hex converts to the 32 bytes the contract expects", () => {
  const bytes = hexToBytes(sha256Hex({ a: 1 }));
  assert.equal(bytes.length, 32);
});

test("a malformed hash is rejected rather than silently truncated", () => {
  assert.throws(() => hexToBytes("not-a-hash"));
  assert.throws(() => hexToBytes("abc123"));
});
