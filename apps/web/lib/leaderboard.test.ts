import test from "node:test";
import assert from "node:assert/strict";
import type { Engagement, Milestone } from "./stellar/contract.ts";
import { PAGE_SIZE, pageOf, standings, totalsOf } from "./leaderboard.ts";

/**
 * The board is the only page that makes a claim about the programme as a whole,
 * so its arithmetic has to be right. Every figure is derived from engagements
 * read off chain — if the sums here are wrong, the page states something the
 * ledger does not.
 */

const A = "GA".padEnd(56, "A");
const B = "GB".padEnd(56, "B");
const C = "GC".padEnd(56, "C");
const S1 = "GS".padEnd(56, "1");
const S2 = "GS".padEnd(56, "2");

function milestone(status: Milestone["status"], amount: bigint): Milestone {
  return {
    title: "m",
    criteria_hash: "0".repeat(64),
    amount,
    deadline: 0n,
    status,
    evidence_hash: null,
    evidence_uri: null,
    submitted_at: 0n,
    decided_at: 0n,
  };
}

function engagement(
  sponsor: string,
  builder: string,
  milestones: Milestone[],
  status: Engagement["status"] = "Funded",
): Engagement {
  return {
    id: 0n,
    sponsor,
    builder,
    reviewers: ["GR".padEnd(56, "R")],
    token: "C".repeat(56),
    total_amount: milestones.reduce((sum, m) => sum + m.amount, 0n),
    status,
    created_at: 0n,
    milestones,
  };
}

test("an empty ledger reports zeroes rather than blanks", () => {
  const t = totalsOf([]);
  assert.equal(t.engagements, 0);
  assert.equal(t.milestonesPaid, 0);
  assert.equal(t.distributed, 0n);
  assert.equal(t.buildersPaid, 0);
});

test("only released milestones count as distributed", () => {
  const t = totalsOf([
    engagement(S1, A, [milestone("Released", 100n), milestone("Approved", 50n), milestone("Refunded", 25n)]),
  ]);
  assert.equal(t.distributed, 100n);
  assert.equal(t.reclaimed, 25n);
  assert.equal(t.inEscrow, 50n);
  assert.equal(t.milestonesPaid, 1);
  assert.equal(t.milestonesTotal, 3);
});

/* A Draft engagement was defined but never funded. Counting its milestones as
   escrow would claim money that never moved. */
test("an unfunded engagement commits nothing to escrow", () => {
  const t = totalsOf([engagement(S1, A, [milestone("Pending", 500n)], "Draft")]);
  assert.equal(t.inEscrow, 0n);
  assert.equal(t.sponsors, 0);
  assert.equal(t.milestonesTotal, 1);
});

test("builders and sponsors are counted once however many engagements they have", () => {
  const t = totalsOf([
    engagement(S1, A, [milestone("Released", 10n)]),
    engagement(S1, A, [milestone("Released", 20n)]),
    engagement(S2, B, [milestone("Released", 30n)]),
  ]);
  assert.equal(t.buildersPaid, 2);
  assert.equal(t.sponsors, 2);
  assert.equal(t.distributed, 60n);
});

/* Paid, not promised. A builder holding funded milestones nobody has approved
   has earned nothing yet, and a board that rewarded signing up would be lying
   about who delivered. */
test("a builder with only unapproved milestones has earned nothing", () => {
  const [row] = standings([engagement(S1, A, [milestone("EvidenceSubmitted", 900n)])]);
  assert.equal(row!.earned, 0n);
  assert.equal(row!.milestonesPaid, 0);
  assert.equal(row!.outstanding, 1);
});

test("builders are ordered by what they were actually paid", () => {
  const rows = standings([
    engagement(S1, A, [milestone("Released", 100n)]),
    engagement(S1, B, [milestone("Released", 300n)]),
    engagement(S1, C, [milestone("Released", 200n)]),
  ]);
  assert.deepEqual(rows.map((r) => r.address), [B, C, A]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test("earnings across several engagements add up for one builder", () => {
  const rows = standings([
    engagement(S1, A, [milestone("Released", 100n), milestone("Released", 50n)]),
    engagement(S2, A, [milestone("Released", 25n)]),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.earned, 175n);
  assert.equal(rows[0]!.milestonesPaid, 3);
  assert.equal(rows[0]!.engagements, 2);
});

/* Two builders on the same figure are both second, and the next one is fourth.
   Inventing an order between equal results would be a claim the ledger does not
   support. */
test("equal earnings share a rank and the next distinct value skips ahead", () => {
  const rows = standings([
    engagement(S1, A, [milestone("Released", 500n)]),
    engagement(S1, B, [milestone("Released", 300n)]),
    engagement(S1, C, [milestone("Released", 300n)]),
  ]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 2]);
});

test("the order does not depend on how the ledger returned the engagements", () => {
  const forwards = standings([
    engagement(S1, B, [milestone("Released", 100n)]),
    engagement(S1, C, [milestone("Released", 100n)]),
  ]);
  const backwards = standings([
    engagement(S1, C, [milestone("Released", 100n)]),
    engagement(S1, B, [milestone("Released", 100n)]),
  ]);
  assert.deepEqual(forwards.map((r) => r.address), backwards.map((r) => r.address));
});

function board(count: number) {
  return standings(
    Array.from({ length: count }, (_, i) =>
      engagement(S1, `G${String(i).padStart(55, "0")}`, [milestone("Released", BigInt(count - i) * 10n)]),
    ),
  );
}

test("a page holds ten rows and the last page holds the remainder", () => {
  const all = board(23);
  assert.equal(pageOf(all, 1, null).rows.length, PAGE_SIZE);
  assert.equal(pageOf(all, 3, null).rows.length, 3);
  assert.equal(pageOf(all, 1, null).pageCount, 3);
});

test("a page number outside the range is clamped rather than showing nothing", () => {
  const all = board(15);
  assert.equal(pageOf(all, 0, null).page, 1);
  assert.equal(pageOf(all, 99, null).page, 2);
});

test("an empty board still has one page", () => {
  assert.equal(pageOf([], 1, null).pageCount, 1);
  assert.deepEqual(pageOf([], 1, null).rows, []);
});

/* Someone who ranks 47th should be able to see that they rank 47th without
   paging through to find themselves. */
test("a viewer outside the page is pinned with their real rank", () => {
  const all = board(30);
  const outsider = all[24]!;
  const page = pageOf(all, 1, outsider.address);
  assert.equal(page.pinned?.address, outsider.address);
  assert.equal(page.pinned?.rank, 25);
});

test("a viewer already on the page is not repeated underneath it", () => {
  const all = board(30);
  const page = pageOf(all, 1, all[3]!.address);
  assert.equal(page.pinned, null);
});

test("a viewer who has never been paid is not invented onto the board", () => {
  const all = board(12);
  assert.equal(pageOf(all, 1, "GNOTHERE".padEnd(56, "X")).pinned, null);
  assert.equal(pageOf(all, 1, null).pinned, null);
});
