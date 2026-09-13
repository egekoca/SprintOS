import assert from "node:assert/strict";
import { test } from "node:test";
import { canDecide, roleOf } from "./authority.ts";

const engagement = {
  sponsor: "GSPONSOR",
  builder: "GBUILDER",
  reviewers: ["GREVIEWER"],
};

test("the sponsor decides payouts on their own engagement", () => {
  /* The review desk asked `roleOf(...) === "reviewer"` instead, which is false
     for the sponsor. It told them they could not decide and, in the same
     sentence, named them as the wallet that does. */
  assert.equal(canDecide(engagement, "GSPONSOR"), true);
  assert.equal(roleOf(engagement, "GSPONSOR"), "sponsor");
});

test("an authorised wallet decides alongside the sponsor", () => {
  assert.equal(canDecide(engagement, "GREVIEWER"), true);
});

test("the builder never decides, even if listed as a reviewer", () => {
  assert.equal(canDecide({ ...engagement, reviewers: ["GBUILDER"] }, "GBUILDER"), false);
});

test("a stranger and a disconnected wallet decide nothing", () => {
  assert.equal(canDecide(engagement, "GSTRANGER"), false);
  assert.equal(canDecide(engagement, null), false);
});
