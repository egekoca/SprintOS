import { test } from "node:test";
import assert from "node:assert/strict";
import { createdEngagementId } from "./activity.ts";

test("creation activity uses the contract return value", () => {
  assert.equal(createdEngagementId(42n), "42");
  assert.equal(createdEngagementId(0n), "0");
});

test("invalid creation return values cannot become activity keys", () => {
  assert.equal(createdEngagementId(-1n), null);
  assert.equal(createdEngagementId(-1), null);
  assert.equal(createdEngagementId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(createdEngagementId("42"), null);
  assert.equal(createdEngagementId(undefined), null);
});
