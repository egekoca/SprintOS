import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleReport, verifyReportHash } from "./generate.ts";
import { DISCLAIMER } from "@sprintos/schemas";
import type { CriteriaDocument, EvidenceBundle } from "@sprintos/schemas";
import type { FetchedEvidence } from "./fetch.ts";
import type { Draft } from "./validate.ts";

const criteria: CriteriaDocument = {
  schema_version: "1.0.0",
  engagement_id: "0",
  milestone_idx: 0,
  title: "Soroban settlement contract",
  criteria: [{ id: "c1", text: "Deployed to testnet" }],
};

const evidence: EvidenceBundle = {
  schema_version: "1.0.0",
  engagement_id: "0",
  milestone_idx: 0,
  submitted_at: "2026-08-24T10:00:00.000Z",
  links: [{ url: "https://github.com/egekoca/SprintOS", type: "repo" }],
};

const fetched: FetchedEvidence[] = [
  { url: "https://github.com/egekoca/SprintOS", type: "repo", fetched: true, public: true, content: "Repository: egekoca/SprintOS" },
];

function assemble(score: number) {
  const draft: Draft = {
    advisory_score: score,
    recommendation: "ReadyForReview",
    criteria: [
      { id: "c1", text: "Deployed to testnet", verdict: "met", confidence: "high", supporting_links: [fetched[0]!.url], rationale: "The contract id resolves on the explorer." },
    ],
    evidence: [],
    missing_information: [],
  };
  return assembleReport({
    draft, criteria, evidence, fetched, model: "claude-opus-5",
    reportId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    generatedAt: "2026-08-24T12:00:00.000Z",
  });
}

test("an assembled report is always non-binding", () => {
  assert.equal(assemble(92).binding, false);
});

test("the disclaimer is written by the module, not the model", () => {
  assert.equal(assemble(92).disclaimer, DISCLAIMER);
});

test("even a perfect score produces a non-binding report", () => {
  const perfect = assemble(100);
  assert.equal(perfect.advisory_score, 100);
  assert.equal(perfect.binding, false);
  assert.match(perfect.disclaimer, /cannot approve a milestone/i);
});

test("the report hash verifies", () => {
  assert.ok(verifyReportHash(assemble(92)));
});

test("tampering with a stored report breaks its hash", () => {
  const tampered = { ...assemble(50), advisory_score: 100 };
  assert.equal(verifyReportHash(tampered), false);
});

test("the same inputs always produce the same hash", () => {
  assert.equal(assemble(92).report_hash, assemble(92).report_hash);
});

test("a report carries no field that could authorize anything", () => {
  const report = assemble(100) as unknown as Record<string, unknown>;
  for (const forbidden of ["signature", "authorization", "approved", "release", "transaction", "secret_key"]) {
    assert.equal(report[forbidden], undefined, `report must not carry a ${forbidden} field`);
  }
});

test("the report uses the post-creation evidence engagement id", () => {
  const report = assembleReport({
    draft: {
      advisory_score: 92,
      recommendation: "ReadyForReview",
      criteria: [
        { id: "c1", text: "Deployed to testnet", verdict: "met", confidence: "high", supporting_links: [fetched[0]!.url], rationale: "Verified." },
      ],
      evidence: [],
      missing_information: [],
    },
    criteria: { ...criteria, engagement_id: "draft:before-chain" },
    evidence: { ...evidence, engagement_id: "42" },
    fetched,
    model: "claude-opus-5",
    reportId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    generatedAt: "2026-08-24T12:00:00.000Z",
  });
  assert.equal(report.engagement_id, "42");
});
