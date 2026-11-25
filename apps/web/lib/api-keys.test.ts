import { test } from "node:test";
import assert from "node:assert/strict";
import { generateApiKey, hashApiKey } from "./api-keys.ts";

test("a generated key matches the sk_<hex> shape the route's Bearer regex expects", () => {
  const key = generateApiKey();
  assert.match(key, /^sk_[0-9a-f]{48}$/);
});

test("two generated keys are never the same", () => {
  assert.notEqual(generateApiKey(), generateApiKey());
});

test("hashing the same key twice gives the same hash", () => {
  const key = generateApiKey();
  assert.equal(hashApiKey(key), hashApiKey(key));
});

test("different keys hash differently", () => {
  assert.notEqual(hashApiKey(generateApiKey()), hashApiKey(generateApiKey()));
});

test("the hash is a 64-character lowercase hex sha256, matching ApiKeyRecord's own schema", () => {
  assert.match(hashApiKey(generateApiKey()), /^[0-9a-f]{64}$/);
});
