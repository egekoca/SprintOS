import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActivityEntry } from "@sprintos/schemas";
import { currentVersion, evidenceVersions } from "./evidence-versions.ts";

const actor = "GBIFJZC2QVNDKDJQEBC247BF5URT4T24FXCRC53527P3TXUUIEIRZSMA";

function entry(partial: Partial<ActivityEntry> & Pick<ActivityEntry, "action" | "at" | "tx_hash">): ActivityEntry {
  return {
    engagement_id: "9",
    milestone_idx: 0,
    actor,
    ...partial,
  };
}

test("a single submission with no decision is version 1, undecided", () => {
  const entries = [
    entry({ action: "evidence_submitted", at: "2026-10-01T00:00:00.000Z", tx_hash: "a".repeat(64), evidence_hash: "1".repeat(64) }),
  ];
  const versions = evidenceVersions(entries, 0);
  assert.equal(versions.length, 1);
  assert.equal(versions[0]?.version, 1);
  assert.equal(versions[0]?.decision, null);
});

test("a Hold followed by resubmission preserves version 1 and opens version 2", () => {
  const entries = [
    entry({ action: "evidence_submitted", at: "2026-10-01T00:00:00.000Z", tx_hash: "a".repeat(64), evidence_hash: "1".repeat(64) }),
    entry({ action: "held", at: "2026-10-01T01:00:00.000Z", tx_hash: "b".repeat(64) }),
    entry({ action: "evidence_submitted", at: "2026-10-02T00:00:00.000Z", tx_hash: "c".repeat(64), evidence_hash: "2".repeat(64) }),
  ];
  const versions = evidenceVersions(entries, 0);
  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.evidence_hash, "1".repeat(64));
  assert.equal(versions[0]?.decision?.type, "held");
  assert.equal(versions[1]?.evidence_hash, "2".repeat(64));
  assert.equal(versions[1]?.decision, null);
  assert.equal(currentVersion(versions)?.version, 2);
});

test("an approval on an earlier version never attaches to a later one", () => {
  const entries = [
    entry({ action: "evidence_submitted", at: "2026-10-01T00:00:00.000Z", tx_hash: "a".repeat(64), evidence_hash: "1".repeat(64) }),
    entry({ action: "held", at: "2026-10-01T01:00:00.000Z", tx_hash: "b".repeat(64) }),
    entry({ action: "evidence_submitted", at: "2026-10-02T00:00:00.000Z", tx_hash: "c".repeat(64), evidence_hash: "2".repeat(64) }),
    entry({ action: "approved", at: "2026-10-02T01:00:00.000Z", tx_hash: "d".repeat(64) }),
  ];
  const versions = evidenceVersions(entries, 0);
  assert.equal(versions[0]?.decision?.type, "held");
  assert.equal(versions[1]?.decision?.type, "approved");
});

test("entries from a different milestone are ignored", () => {
  const entries = [
    entry({ action: "evidence_submitted", at: "2026-10-01T00:00:00.000Z", tx_hash: "a".repeat(64), evidence_hash: "1".repeat(64), milestone_idx: 1 }),
  ];
  assert.equal(evidenceVersions(entries, 0).length, 0);
});

test("no submissions yet means no current version", () => {
  assert.equal(currentVersion(evidenceVersions([], 0)), null);
});
