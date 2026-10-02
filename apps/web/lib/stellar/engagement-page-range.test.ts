import { test } from "node:test";
import assert from "node:assert/strict";
import { engagementPageRange } from "./pagination.ts";

/**
 * The arithmetic behind `listEngagementsPage`, tested without a network call
 * so the boundary cases are cheap to check directly.
 */

test("an empty deployment has an empty, exhausted first page", () => {
  const { floor, ceiling } = engagementPageRange(0, 0, 20);
  assert.equal(floor, ceiling);
});

test("a deployment smaller than the page limit returns everything in one page", () => {
  const { floor, ceiling } = engagementPageRange(1007, 1000, 20);
  assert.equal(floor, 1000);
  assert.equal(ceiling, 1007);
});

test("a deployment larger than the page limit is bounded to it", () => {
  const { floor, ceiling } = engagementPageRange(1050, 1000, 20);
  assert.equal(ceiling - floor, 20);
  assert.equal(ceiling, 1050);
});

test("paging backward with `before` never goes past the first issued id", () => {
  const { floor, ceiling } = engagementPageRange(1050, 1000, 20, 1005);
  assert.equal(ceiling, 1005);
  assert.equal(floor, 1000);
});

test("a `before` past the newest id is clamped rather than reading ids that do not exist", () => {
  const { ceiling } = engagementPageRange(1010, 1000, 20, 9_999);
  assert.equal(ceiling, 1010);
});
