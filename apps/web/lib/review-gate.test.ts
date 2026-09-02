import test from "node:test";
import assert from "node:assert/strict";
import { documentState, reviewGate, type ReviewGateInput } from "./review-gate.ts";

/**
 * The gate on the reviewer's Approve, Hold and Release buttons.
 *
 * If this is wrong in the permissive direction, a reviewer can be shown one set
 * of acceptance criteria while signing a decision against another. The contract
 * still demands their signature, so no stranger can pay themselves — but the
 * reviewer would be signing something they did not read, which is the whole
 * failure this product exists to prevent.
 */

const CRITERIA = { schema_version: "1.0.0", criteria: [{ id: "c1", text: "Deployed" }] };
const EVIDENCE = { schema_version: "1.0.0", links: [{ url: "https://example.com", type: "repo" }] };
const HASH_A = "243f8ae7bbfa484711fa8522423cd36b88b64d39f5a7ba198f8d9b2ba420773e";
const HASH_B = "4eb0627f170efe3775a714429a0396ce5e2b19e7f76002df027149200b2f2443";

function gateInput(overrides: Partial<ReviewGateInput> = {}): ReviewGateInput {
  return {
    criteria: CRITERIA,
    criteriaHash: HASH_A,
    anchoredCriteriaHash: HASH_A,
    evidence: EVIDENCE,
    evidenceHash: HASH_B,
    anchoredEvidenceHash: HASH_B,
    ...overrides,
  };
}

test("both documents present and matching is the only way to enable a decision", () => {
  const gate = reviewGate(gateInput());
  assert.equal(gate.criteria, "verified");
  assert.equal(gate.evidence, "verified");
  assert.equal(gate.decisionsEnabled, true);
  assert.equal(gate.blockedBecause, null);
});

test("criteria that do not hash to the ledger value block every decision", () => {
  const gate = reviewGate(gateInput({ criteriaHash: HASH_B }));
  assert.equal(gate.criteria, "mismatch");
  assert.equal(gate.decisionsEnabled, false);
  assert.match(gate.blockedBecause ?? "", /does not match the hash recorded on chain/);
});

test("evidence that does not hash to the ledger value blocks every decision", () => {
  const gate = reviewGate(gateInput({ evidenceHash: HASH_A }));
  assert.equal(gate.evidence, "mismatch");
  assert.equal(gate.decisionsEnabled, false);
});

/* A missing document and a wrong document are different problems, and telling a
   reviewer their hashes "differ" when the file is simply gone sends them
   hunting for tampering that never happened. */
test("a document this deployment cannot show is absent, not a mismatch", () => {
  const gate = reviewGate(gateInput({ criteria: null, criteriaHash: null }));
  assert.equal(gate.criteria, "absent");
  assert.equal(gate.decisionsEnabled, false);
  assert.match(gate.blockedBecause ?? "", /cannot show both documents/);
});

test("a milestone with no evidence submitted yet is absent rather than broken", () => {
  const gate = reviewGate(gateInput({ evidence: null, evidenceHash: null, anchoredEvidenceHash: null }));
  assert.equal(gate.evidence, "absent");
  assert.equal(gate.decisionsEnabled, false);
});

/* The anchored hash is what the ledger recorded. Without one there is nothing
   to check a document against, so holding a file proves nothing at all. */
test("a document with nothing anchored on chain can never verify", () => {
  assert.equal(documentState(CRITERIA, HASH_A, null), "absent");
  assert.equal(reviewGate(gateInput({ anchoredCriteriaHash: null })).decisionsEnabled, false);
});

test("a null computed hash never passes as a match", () => {
  assert.equal(documentState(CRITERIA, null, HASH_A), "mismatch");
  assert.equal(reviewGate(gateInput({ criteriaHash: null })).decisionsEnabled, false);
});

/* The contract stores raw hex; the document store prefixes with "sha256:". The
   two must still compare equal, or every decision button would be dead. */
test("the sha256: prefix and letter case do not create a false mismatch", () => {
  assert.equal(documentState(CRITERIA, `sha256:${HASH_A.toUpperCase()}`, HASH_A), "verified");
  assert.equal(documentState(CRITERIA, HASH_A, `SHA256:${HASH_A}`), "verified");
});

test("an empty string is not a hash and does not verify", () => {
  assert.equal(documentState(CRITERIA, "", HASH_A), "mismatch");
  assert.equal(documentState(CRITERIA, HASH_A, ""), "absent");
});

/**
 * The point of the whole project, expressed as a test.
 *
 * There is no advisory score, recommendation or report anywhere in this gate's
 * input, so there is no value the module could return that would turn a
 * decision button on. A perfect report and no report reach exactly the same
 * answer, and only the documents decide.
 */
test("no advisory result can enable a decision the documents do not", () => {
  const blocked = gateInput({ criteriaHash: HASH_B });
  const withPerfectReport = { ...blocked, advisory_score: 100, recommendation: "ReadyForReview" };
  assert.equal(reviewGate(blocked).decisionsEnabled, false);
  assert.equal(reviewGate(withPerfectReport as ReviewGateInput).decisionsEnabled, false);

  const allowed = gateInput();
  const withWorstReport = { ...allowed, advisory_score: 0, recommendation: "RevisionSuggested" };
  assert.equal(reviewGate(allowed).decisionsEnabled, true);
  assert.equal(reviewGate(withWorstReport as ReviewGateInput).decisionsEnabled, true);
});
