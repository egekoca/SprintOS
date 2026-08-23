import { test } from "node:test";
import assert from "node:assert/strict";
import { clearRateLimitsForTests, takeRateLimit } from "./rate-limit.ts";

test("advisory requests are limited within a window and reset afterwards", () => {
  clearRateLimitsForTests();
  assert.equal(takeRateLimit("client", 2, 1_000, 0).allowed, true);
  assert.equal(takeRateLimit("client", 2, 1_000, 10).allowed, true);
  assert.equal(takeRateLimit("client", 2, 1_000, 20).allowed, false);
  assert.equal(takeRateLimit("client", 2, 1_000, 1_001).allowed, true);
});
