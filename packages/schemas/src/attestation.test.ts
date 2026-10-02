import { test } from "node:test";
import assert from "node:assert/strict";
import { ApprovalPolicy, ReviewerAttestation } from "./attestation.ts";

const valid = {
  schema_version: "1.0.0",
  engagement_id: "5",
  milestone_idx: 0,
  evidence_hash: "a".repeat(64),
  reviewer: "GBIFJZC2QVNDKDJQEBC247BF5URT4T24FXCRC53527P3TXUUIEIRZSMA",
  decision: "approve",
  attested_at: "2026-10-02T12:00:00.000Z",
};

test("a well-formed attestation parses, with empty feedback by default", () => {
  const parsed = ReviewerAttestation.parse(valid);
  assert.deepEqual(parsed.criteria_feedback, []);
});

test("a decision outside approve/hold is rejected", () => {
  assert.throws(() => ReviewerAttestation.parse({ ...valid, decision: "release" }));
});

test("criterion feedback is capped at five entries", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, comment: "note" }));
  assert.throws(() => ReviewerAttestation.parse({ ...valid, criteria_feedback: six }));
});

test("a threshold of zero or above three is rejected", () => {
  const policy = { schema_version: "1.0.0", engagement_id: "5", threshold: 2 };
  assert.doesNotThrow(() => ApprovalPolicy.parse(policy));
  assert.throws(() => ApprovalPolicy.parse({ ...policy, threshold: 0 }));
  assert.throws(() => ApprovalPolicy.parse({ ...policy, threshold: 4 }));
});
