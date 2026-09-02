import test from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, SAMPLE_REPORTS, VERIFY_COMMANDS, countByStatus, DEPLOYMENT } from "./evidence.ts";

/**
 * The evidence pack is what the Ambassador Chapter Lead reviews, and it is
 * rendered twice from this one file — once at `/evidence` and once into
 * `docs/EVIDENCE.md`. A broken link or a claim with nothing behind it is a
 * defect in the deliverable itself, not just in a page.
 *
 * These tests do not check that the claims are true; a person has to do that.
 * They check that the pack cannot quietly become unreviewable.
 */

const ALL_ITEMS = SECTIONS.flatMap((section) => section.items);

test("the pack covers all three deliverables the SOW names", () => {
  assert.equal(SECTIONS.length, 3);
  for (const section of SECTIONS) {
    assert.ok(section.items.length > 0, `${section.title} has no evidence items`);
  }
});

test("every requirement says what satisfies it", () => {
  for (const item of ALL_ITEMS) {
    assert.ok(item.requirement.trim().length > 10, `requirement too thin: ${item.requirement}`);
    assert.ok(item.detail.trim().length > 20, `detail too thin for: ${item.requirement}`);
  }
});

/* A "done" claim a reviewer cannot follow anywhere is exactly the kind of
   unverifiable assertion the SOW's evidence section exists to rule out. */
test("everything claimed as delivered points somewhere a reviewer can check", () => {
  for (const item of ALL_ITEMS.filter((i) => i.status === "done")) {
    assert.ok((item.refs ?? []).length > 0, `nothing to check for: ${item.requirement}`);
  }
});

/* Links to this deployment's own pages stay relative so the pack works on any
   host it is served from; everything else has to be an absolute https URL. */
test("every reference is followable and carries a readable label", () => {
  for (const item of ALL_ITEMS) {
    for (const ref of item.refs ?? []) {
      assert.match(ref.href, /^(https:\/\/|\/)/, `${ref.label} is neither an https URL nor a site path`);
      assert.ok(ref.label.trim().length > 0, `a reference under "${item.requirement}" has no label`);
    }
  }
});

/* The pack is only worth anything if it admits its own gaps, so the outstanding
   count has to come from the data rather than from a number typed into prose. */
test("outstanding work is counted from the items, not asserted separately", () => {
  const counted = ALL_ITEMS.filter((i) => i.status === "todo").length;
  const partial = ALL_ITEMS.filter((i) => i.status === "partial").length;
  assert.equal(countByStatus("todo"), counted);
  assert.equal(countByStatus("partial"), partial);
  assert.equal(countByStatus("done") + counted + partial, ALL_ITEMS.length);
});

test("an item that is not finished explains what is still missing", () => {
  for (const item of ALL_ITEMS.filter((i) => i.status !== "done")) {
    assert.ok(item.detail.trim().length > 30, `unfinished item says too little: ${item.requirement}`);
  }
});

/* These are the hashes an Ambassador can regenerate and compare. A sample whose
   hash changed on every run would prove nothing, so the format is checked. */
test("the three sample reports carry checkable hashes and cover the full range", () => {
  assert.equal(SAMPLE_REPORTS.length, 3);
  for (const sample of SAMPLE_REPORTS) {
    assert.match(sample.hash, /^sha256:[0-9a-f]{64}$/, `${sample.name} has no usable hash`);
    assert.ok(sample.score >= 0 && sample.score <= 100);
  }
  const scores = SAMPLE_REPORTS.map((s) => s.score);
  assert.ok(Math.max(...scores) > 80, "no sample shows a complete delivery");
  assert.ok(Math.min(...scores) < 20, "no sample shows insufficient evidence");
});

test("every verification command is a repository command and says what it proves", () => {
  assert.ok(VERIFY_COMMANDS.length >= 3);
  for (const entry of VERIFY_COMMANDS) {
    assert.match(entry.cmd, /^(pnpm|cargo) /, `${entry.cmd} is not a repository command`);
    assert.ok(entry.what.trim().length > 10, `${entry.cmd} does not say what it proves`);
  }
});

test("the deployment the pack points at is the one in the manifest", () => {
  assert.match(DEPLOYMENT.contractId, /^C[A-Z2-7]{55}$/);
  assert.match(DEPLOYMENT.usdcSacId, /^C[A-Z2-7]{55}$/);
  assert.ok(DEPLOYMENT.contractExplorer.endsWith(DEPLOYMENT.contractId), "the explorer link points at another contract");
  assert.ok(DEPLOYMENT.usdcExplorer.endsWith(DEPLOYMENT.usdcSacId), "the asset link points at another contract");
});
