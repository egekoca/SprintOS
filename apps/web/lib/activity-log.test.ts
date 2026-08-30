import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The settlement index is written once per confirmed transaction, but a retry,
 * a second tab or a re-submitted request must not be able to list the same
 * payment twice — an evidence artifact that double-counts a release is worse
 * than one that is missing.
 *
 * The data root is read when the module loads, so it is redirected at a
 * throwaway directory before the import.
 */
process.env.SPRINTOS_DATA_DIR = mkdtempSync(join(tmpdir(), "sprintos-activity-"));
delete process.env.BLOB_READ_WRITE_TOKEN;

const { appendActivity, store } = await import("./store.ts");

const base = {
  engagement_id: "7",
  action: "released" as const,
  actor: "GBIFJZC2QVNDKDJQEBC247BF5URT4T24FXCRC53527P3TXUUIEIRZSMA",
  at: "2026-08-29T10:00:00.000Z",
  milestone_idx: 1,
};

test("the same transaction is only listed once", async () => {
  const hash = "a".repeat(64);
  await appendActivity({ ...base, tx_hash: hash });
  const log = await appendActivity({ ...base, tx_hash: hash });
  assert.equal(log.entries.length, 1);
  assert.equal(log.entries[0]?.tx_hash, hash);
});

test("a different transaction is appended in order", async () => {
  const later = { ...base, action: "refunded" as const, milestone_idx: 2, tx_hash: "b".repeat(64) };
  const log = await appendActivity(later);
  assert.equal(log.entries.length, 2);
  assert.equal(log.entries[1]?.action, "refunded");

  const reread = await store.getActivity("7");
  assert.equal(reread?.entries.length, 2);
});

test("an engagement id that is not a number cannot become a key", async () => {
  /* Wrapped so a synchronous throw and a rejected promise both count: the
     guard has to hold whichever way the backend reports it. */
  await assert.rejects(async () => store.getActivity("../../etc/passwd"));
});
