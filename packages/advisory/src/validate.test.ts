import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkCitations,
  checkCriteriaCoverage,
  checkScoreCoherence,
  ReportValidationError,
  validateDraft,
  type Draft,
} from "./validate.ts";
import type { CriteriaDocument, EvidenceLink } from "@sprintos/schemas";

const criteria: CriteriaDocument = {
  schema_version: "1.0.0",
  engagement_id: "0",
  milestone_idx: 0,
  title: "Soroban settlement contract",
  criteria: [
    { id: "c1", text: "The contract is deployed to Stellar testnet" },
    { id: "c2", text: "Unauthorized callers cannot release funds" },
  ],
};

const submitted: EvidenceLink[] = [
  { url: "https://github.com/egekoca/SprintOS", type: "repo" },
  { url: "https://github.com/egekoca/SprintOS/pull/1", type: "pull_request" },
];

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    advisory_score: 80,
    recommendation: "ReadyForReview",
    criteria: [
      { id: "c1", text: "…", verdict: "met", confidence: "high", supporting_links: [submitted[0]!.url], rationale: "ok" },
      { id: "c2", text: "…", verdict: "met", confidence: "high", supporting_links: [], rationale: "ok" },
    ],
    evidence: [],
    missing_information: [],
    ...overrides,
  };
}

test("a citation outside the submitted evidence is caught", () => {
  const bad = draft();
  bad.criteria[0]!.supporting_links = ["https://evil.example/injected"];
  const problems = checkCitations(bad, submitted);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /was not submitted/);
});

test("trailing slashes and .git suffixes do not read as different URLs", () => {
  const ok = draft();
  ok.criteria[0]!.supporting_links = ["https://github.com/egekoca/SprintOS.git/"];
  assert.deepEqual(checkCitations(ok, submitted), []);
});

test("a criterion left unassessed is caught", () => {
  const partial = draft();
  partial.criteria = [partial.criteria[0]!];
  const problems = checkCriteriaCoverage(partial, criteria);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /c2 was not assessed/);
});

test("a criterion the milestone never set is caught", () => {
  const invented = draft();
  invented.criteria[1]!.id = "c9";
  const problems = checkCriteriaCoverage(invented, criteria);
  assert.ok(problems.some((p) => /c9/.test(p)));
});

test("assessing the same criterion twice is caught", () => {
  const dup = draft();
  dup.criteria[1]!.id = "c1";
  assert.ok(checkCriteriaCoverage(dup, criteria).some((p) => /more than once/.test(p)));
});

test("a high score contradicting its own verdicts is caught", () => {
  const incoherent = draft({ advisory_score: 98 });
  incoherent.criteria[1]!.verdict = "not_met";
  assert.ok(checkScoreCoherence(incoherent).length > 0);
});

test("recommending review while marking a criterion not met is caught", () => {
  const incoherent = draft({ advisory_score: 60, recommendation: "ReadyForReview" });
  incoherent.criteria[1]!.verdict = "not_met";
  assert.ok(checkScoreCoherence(incoherent).some((p) => /not met/.test(p)));
});

test("a clean draft passes every check", () => {
  assert.doesNotThrow(() => validateDraft(draft(), criteria, submitted));
});

test("validation reports every problem at once, not just the first", () => {
  const bad = draft({ advisory_score: 99 });
  bad.criteria[0]!.supporting_links = ["https://evil.example/x"];
  bad.criteria[1]!.verdict = "not_met";
  try {
    validateDraft(bad, criteria, submitted);
    assert.fail("expected validation to throw");
  } catch (err) {
    assert.ok(err instanceof ReportValidationError);
    assert.ok(err.problems.length >= 2);
  }
});
