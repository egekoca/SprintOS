import { test } from "node:test";
import assert from "node:assert/strict";
import { AdvisoryReport, DISCLAIMER } from "./report.ts";
import { CriteriaDocument, EvidenceBundle, EvidenceLink } from "./milestone.ts";

const valid = {
  schema_version: "1.0.0",
  report_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  engagement_id: "0",
  milestone_idx: 0,
  generated_at: "2026-08-24T12:00:00.000Z",
  model: "claude-opus-5",
  binding: false,
  disclaimer: DISCLAIMER,
  advisory_score: 92,
  recommendation: "ReadyForReview",
  criteria: [
    {
      id: "c1",
      text: "The contract is deployed to testnet",
      verdict: "met",
      confidence: "high",
      supporting_links: ["https://stellar.expert/explorer/testnet/contract/CA7N"],
      rationale: "The deployment transaction is linked and resolves.",
    },
  ],
  evidence: [],
  missing_information: [],
  report_hash: "sha256:" + "a".repeat(64),
};

test("a well-formed report parses", () => {
  assert.doesNotThrow(() => AdvisoryReport.parse(valid));
});

test("a report claiming to be binding cannot be constructed", () => {
  assert.throws(() => AdvisoryReport.parse({ ...valid, binding: true }));
});

test("the disclaimer cannot be weakened or removed", () => {
  assert.throws(() => AdvisoryReport.parse({ ...valid, disclaimer: "Looks fine to me." }));
  assert.throws(() => AdvisoryReport.parse({ ...valid, disclaimer: "" }));
});

test("scores outside 0–100 are rejected", () => {
  assert.throws(() => AdvisoryReport.parse({ ...valid, advisory_score: 101 }));
  assert.throws(() => AdvisoryReport.parse({ ...valid, advisory_score: -1 }));
});

test("there is no approval or release recommendation to choose", () => {
  assert.throws(() => AdvisoryReport.parse({ ...valid, recommendation: "Approve" }));
  assert.throws(() => AdvisoryReport.parse({ ...valid, recommendation: "Release" }));
});

test("more than five criteria is rejected", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ ...valid.criteria[0], id: `c${i}` }));
  assert.throws(() => AdvisoryReport.parse({ ...valid, criteria: six }));
});

test("evidence links must be https and credential-free", () => {
  assert.doesNotThrow(() => EvidenceLink.parse({ url: "https://github.com/a/b", type: "repo" }));
  assert.throws(() => EvidenceLink.parse({ url: "http://github.com/a/b", type: "repo" }));
  assert.throws(() =>
    EvidenceLink.parse({ url: "https://user:token@github.com/a/b", type: "repo" }),
  );
});

test("off-chain engagement references cannot contain paths", () => {
  assert.throws(() => EvidenceBundle.parse({
    schema_version: "1.0.0",
    engagement_id: "../../tmp",
    milestone_idx: 0,
    submitted_at: "2026-08-24T12:00:00.000Z",
    links: [{ url: "https://example.com", type: "repo" }],
  }));
  assert.doesNotThrow(() => CriteriaDocument.parse({
    schema_version: "1.0.0",
    engagement_id: "draft:3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    milestone_idx: 0,
    title: "Milestone",
    criteria: [{ id: "c1", text: "Tests pass" }],
  }));
});
