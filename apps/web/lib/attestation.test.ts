import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReviewerAttestation } from "@sprintos/schemas";
import { tallyAttestations } from "./attestation.ts";

const EVIDENCE = "1".repeat(64);
const r1 = "GBIFJZC2QVNDKDJQEBC247BF5URT4T24FXCRC53527P3TXUUIEIRZSMA";
const r2 = "GCBSZV7G3Z27TJTUDMD3TNMXD5LSM3IN5VADGIB4ZPLE63CZSUGZQVXI";
const r3 = "GDKBTJDF6HQRE4JHLBSKV5K7EY5BKCY2H2LCHXHDOFBBG6MBHQV3HWPK";

function at(reviewer: string, decision: "approve" | "hold", attested_at: string): ReviewerAttestation {
  return {
    schema_version: "1.0.0",
    engagement_id: "9",
    milestone_idx: 0,
    evidence_hash: EVIDENCE,
    reviewer,
    decision,
    criteria_feedback: [],
    attested_at,
  };
}

test("one approval does not meet a threshold of two", () => {
  const tally = tallyAttestations([at(r1, "approve", "2026-10-01T00:00:00.000Z")], EVIDENCE, 2);
  assert.equal(tally.met, false);
  assert.deepEqual(tally.approvals, [r1]);
});

test("two distinct approvals meet a threshold of two", () => {
  const tally = tallyAttestations(
    [at(r1, "approve", "2026-10-01T00:00:00.000Z"), at(r2, "approve", "2026-10-01T00:05:00.000Z")],
    EVIDENCE,
    2,
  );
  assert.equal(tally.met, true);
});

test("the same reviewer attesting twice counts once", () => {
  const tally = tallyAttestations(
    [at(r1, "approve", "2026-10-01T00:00:00.000Z"), at(r1, "approve", "2026-10-01T00:05:00.000Z")],
    EVIDENCE,
    2,
  );
  assert.equal(tally.approvals.length, 1);
});

test("a later hold replaces an earlier approval from the same reviewer", () => {
  const tally = tallyAttestations(
    [at(r1, "approve", "2026-10-01T00:00:00.000Z"), at(r1, "hold", "2026-10-01T00:05:00.000Z")],
    EVIDENCE,
    1,
  );
  assert.deepEqual(tally.approvals, []);
  assert.deepEqual(tally.holds, [r1]);
});

test("an attestation against a different evidence version is not counted", () => {
  const tally = tallyAttestations([at(r3, "approve", "2026-10-01T00:00:00.000Z")], "2".repeat(64), 1);
  assert.equal(tally.approvals.length, 0);
});

test("threshold 1 is met by any single reviewer, matching the contract's own default", () => {
  const tally = tallyAttestations([at(r1, "approve", "2026-10-01T00:00:00.000Z")], EVIDENCE, 1);
  assert.equal(tally.met, true);
});
