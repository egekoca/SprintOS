import test from "node:test";
import assert from "node:assert/strict";
import { formatUsdc, parseUsdc } from "./stellar/config.ts";
import type { MilestoneForm } from "./sponsor-draft.ts";
import {
  allocatedTotal,
  completedThrough,
  milestoneProblem,
  planProblemOf,
  renumber,
  roleProblemOf,
  shortAccount,
  sinceWhen,
  splitEvenly,
} from "./sponsor-plan.ts";

/**
 * These rules decide whether the sponsor's signature button is live, and that
 * signature fixes the milestone terms on chain permanently. The contract
 * rejects most of the same mistakes, but it rejects them by reverting a
 * transaction the sponsor already signed and paid for.
 */

const SPONSOR = "GCBSZV7G3Z27TJTUDMD3TNMXD5LSM3IN5VADGIB4ZPLE63CZSUGZQVXI";
const BUILDER = "GDKBTJDF6HQRE4JHLBSKV5K7EY5BKCY2H2LCHXHDOFBBG6MBHQV3HWPK";
const REVIEWER = "GBIFJZC2QVNDKDJQEBC247BF5URT4T24FXCRC53527P3TXUUIEIRZSMA";

function milestone(overrides: Partial<MilestoneForm> = {}): MilestoneForm {
  return {
    title: "Milestone 1",
    summary: "",
    criteria: ["The contract is deployed to testnet"],
    amount: "500",
    startDate: "2099-01-01",
    deadline: "2099-02-01",
    startTime: "",
    deadlineTime: "",
    ...overrides,
  };
}

test("a milestone with a title, a future date, a criterion and an amount is accepted", () => {
  assert.equal(milestoneProblem(milestone()), null);
});

test("a due date in the past is refused before it reaches the contract", () => {
  const problem = milestoneProblem(milestone({ startDate: "2020-01-01", deadline: "2020-02-01" }));
  assert.match(problem ?? "", /still be in the future/);
});

test("a milestone cannot be due before it starts", () => {
  const problem = milestoneProblem(milestone({ startDate: "2099-03-01", deadline: "2099-02-01" }));
  assert.match(problem ?? "", /due before it starts/);
});

test("a milestone with no filled criterion cannot be signed", () => {
  assert.match(milestoneProblem(milestone({ criteria: ["", "   "] })) ?? "", /checkable criterion/);
});

test("a one-word criterion is too short to check against evidence", () => {
  assert.match(milestoneProblem(milestone({ criteria: ["ok"] })) ?? "", /4 and 500/);
});

test("a zero or unparseable amount is refused", () => {
  assert.match(milestoneProblem(milestone({ amount: "0" })) ?? "", /greater than zero/);
  assert.match(milestoneProblem(milestone({ amount: "5.00000001" })) ?? "", /7 decimal places/);
});

/* The contract bounds the title at 200 bytes, not 200 characters. A form that
   counted characters would let 200 emoji through and then revert on chain. */
test("the title limit is counted in bytes, the way the contract counts it", () => {
  assert.equal(milestoneProblem(milestone({ title: "a".repeat(200) })), null);
  assert.match(milestoneProblem(milestone({ title: "a".repeat(201) })) ?? "", /200 bytes/);
  assert.match(milestoneProblem(milestone({ title: "✅".repeat(67) })) ?? "", /200 bytes/);
});

test("an empty plan is not a plan", () => {
  assert.match(planProblemOf([]) ?? "", /at least one milestone/);
});

test("the plan reports the first broken milestone, not just the last", () => {
  const problem = planProblemOf([milestone(), milestone({ amount: "0" }), milestone()]);
  assert.match(problem ?? "", /greater than zero/);
});

test("automatic names close the gap after a removal", () => {
  const kept = renumber([milestone({ title: "Milestone 1" }), milestone({ title: "Milestone 3" })]);
  assert.deepEqual(kept.map((m) => m.title), ["Milestone 1", "Milestone 2"]);
});

/* Renaming someone's own wording would be worse than leaving a gap in the
   numbering, so a hand-written title survives a removal untouched. */
test("a title the sponsor wrote is never renumbered", () => {
  const kept = renumber([milestone({ title: "Escrow and settlement" }), milestone({ title: "Milestone 9" })]);
  assert.deepEqual(kept.map((m) => m.title), ["Escrow and settlement", "Milestone 2"]);
});

test("the three roles must be three different accounts", () => {
  assert.equal(roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: [REVIEWER] }), null);
  assert.match(
    roleProblemOf({ sponsor: SPONSOR, builder: SPONSOR, extraReviewers: [REVIEWER] }) ?? "",
    /cannot be the sponsor/,
  );
  assert.match(
    roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: [BUILDER] }) ?? "",
    /builder can never decide/i,
  );
});

test("an unconnected wallet and a malformed account are reported separately", () => {
  assert.match(roleProblemOf({ sponsor: null, builder: BUILDER, extraReviewers: [REVIEWER] }) ?? "", /Connect/);
  assert.match(
    roleProblemOf({ sponsor: SPONSOR, builder: "not-an-account", extraReviewers: [REVIEWER] }) ?? "",
    /valid G… account for the builder/,
  );
});

/* The escrow is funded with the sum of the parts, so a split that loses a
   stroop to rounding leaves the engagement short of what the sponsor committed. */
test("an evenly split award adds back up to the original total", () => {
  for (const award of ["5000", "1000", "0.0000003", "333.3333333"]) {
    const total = parseUsdc(award);
    const parts = splitEvenly(total, 3);
    assert.equal(parts.length, 3);
    assert.equal(parts.reduce((sum, part) => sum + parseUsdc(part), 0n), total, `award ${award}`);
  }
});

test("the indivisible remainder goes to the first milestone", () => {
  const parts = splitEvenly(parseUsdc("10"), 3);
  assert.equal(formatUsdc(parseUsdc(parts[0])), "3.3333334");
  assert.equal(formatUsdc(parseUsdc(parts[1])), "3.3333333");
});

test("nothing to split produces nothing", () => {
  assert.deepEqual(splitEvenly(0n, 3), []);
  assert.deepEqual(splitEvenly(parseUsdc("100"), 0), []);
});

test("amounts that are still being typed do not break the running total", () => {
  const total = allocatedTotal([milestone({ amount: "500" }), milestone({ amount: "" }), milestone({ amount: "1.2.3" })]);
  assert.equal(total, parseUsdc("500"));
});

/* Each step stays locked until the one before it is genuinely complete, so this
   is the gate that stops a sponsor reaching the signature with a half-filled
   plan. */
test("progress stops at the first incomplete step", () => {
  const gates = { sourceReady: true, milestonesReady: true, rolesReady: true, signed: false };
  assert.equal(completedThrough({ ...gates, sourceReady: false }), 0);
  assert.equal(completedThrough({ ...gates, milestonesReady: false }), 1);
  assert.equal(completedThrough({ ...gates, rolesReady: false }), 2);
  assert.equal(completedThrough(gates), 3);
  assert.equal(completedThrough({ ...gates, signed: true }), 4);
});

test("a restored draft is described in words, not timestamps", () => {
  const now = Date.parse("2026-09-03T12:00:00Z");
  assert.equal(sinceWhen(now - 30_000, now), "a moment ago");
  assert.equal(sinceWhen(now - 25 * 60_000, now), "25 minutes ago");
  assert.equal(sinceWhen(now - 60 * 60_000, now), "1 hour ago");
  assert.equal(sinceWhen(now - 26 * 3_600_000, now), "yesterday");
  assert.equal(sinceWhen(now - 4 * 86_400_000, now), "4 days ago");
});

test("an account is shortened at both ends, and short values are left alone", () => {
  assert.equal(shortAccount(SPONSOR), `${SPONSOR.slice(0, 8)}…${SPONSOR.slice(-6)}`);
  assert.equal(shortAccount(""), "—");
  assert.equal(shortAccount("short"), "short");
});

/* The sponsor already decides every payout, so listing them again is a no-op
   the form should point out rather than quietly accept. */
test("adding your own wallet is refused as unnecessary", () => {
  const problem = roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: [SPONSOR] });
  assert.match(problem ?? "", /already decides/i);
});

/* The case the whole contract change was for: nobody else authorised, and the
   sponsor decides alone. */
test("authorising nobody is the normal case, not an error", () => {
  assert.equal(roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: [] }), null);
});

test("a blank row the sponsor has not filled in yet is not an error", () => {
  assert.equal(roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: ["", "  "] }), null);
});

test("the same wallet listed twice is caught", () => {
  const problem = roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: [REVIEWER, REVIEWER] });
  assert.match(problem ?? "", /listed twice/i);
});

test("a malformed authorised wallet is caught", () => {
  const problem = roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: ["nope"] });
  assert.match(problem ?? "", /valid G… account/);
});

test("every collision the contract rejects is refused by the form first", () => {
  const collisions: Array<[string, string, string[]]> = [
    [SPONSOR, SPONSOR, [REVIEWER]],
    [SPONSOR, BUILDER, [SPONSOR]],
    [SPONSOR, BUILDER, [BUILDER]],
  ];
  for (const [sponsor, builder, extraReviewers] of collisions) {
    assert.notEqual(
      roleProblemOf({ sponsor, builder, extraReviewers }),
      null,
      `${sponsor}/${builder}/${extraReviewers.join()}`,
    );
  }
  assert.equal(roleProblemOf({ sponsor: SPONSOR, builder: BUILDER, extraReviewers: [REVIEWER] }), null);
});
