import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireJobLock, clearJobLocksForTests, clearRateLimitsForTests, releaseJobLock, takeRateLimit } from "./rate-limit.ts";

test("advisory requests are limited within a window and reset afterwards", () => {
  clearRateLimitsForTests();
  assert.equal(takeRateLimit("client", 2, 1_000, 0).allowed, true);
  assert.equal(takeRateLimit("client", 2, 1_000, 10).allowed, true);
  assert.equal(takeRateLimit("client", 2, 1_000, 20).allowed, false);
  assert.equal(takeRateLimit("client", 2, 1_000, 1_001).allowed, true);
});

test("a second job for the same evidence version is refused while the first is in flight", () => {
  clearJobLocksForTests();
  assert.equal(acquireJobLock("v1", 0), true);
  assert.equal(acquireJobLock("v1", 0), false);
  releaseJobLock("v1");
  assert.equal(acquireJobLock("v1", 0), true);
});

test("a different evidence version gets its own lock", () => {
  clearJobLocksForTests();
  assert.equal(acquireJobLock("v1", 0), true);
  assert.equal(acquireJobLock("v2", 0), true);
});

test("a stale lock past its TTL is reclaimed rather than stuck forever", () => {
  clearJobLocksForTests();
  assert.equal(acquireJobLock("v1", 0), true);
  assert.equal(acquireJobLock("v1", 1_000), false);
  assert.equal(acquireJobLock("v1", 3 * 60_000), true);
});
