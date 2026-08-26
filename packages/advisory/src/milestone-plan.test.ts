import test from "node:test";
import assert from "node:assert/strict";
import { fallbackMilestonePlan } from "./milestone-plan.ts";

test("fallback milestone plans are sequential and reviewable", () => {
  const plan = fallbackMilestonePlan(`Build the SprintOS sponsor workflow
Connect GitHub repositories
Extract milestone requirements
Let the sponsor review dates
Fund the accepted plan`, "2026-08-26");

  assert.ok(plan.milestones.length >= 1 && plan.milestones.length <= 3);
  for (const [index, milestone] of plan.milestones.entries()) {
    assert.ok(milestone.criteria.length >= 1 && milestone.criteria.length <= 5);
    assert.ok(milestone.start_date <= milestone.due_date);
    if (index > 0) assert.ok(milestone.start_date > plan.milestones[index - 1]!.due_date);
  }
});
