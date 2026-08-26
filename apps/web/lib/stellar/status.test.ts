import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  ENGAGEMENT_STATUSES,
  MILESTONE_STATUSES,
  decodeStatus,
} from "./status.ts";

/**
 * The contract returns statuses as numbers. Every screen renders them through
 * these tables, so an ordering mistake here silently mislabels released money
 * as pending — or the reverse.
 */
test("numeric discriminants decode to the contract's own names", () => {
  assert.equal(decodeStatus(0, MILESTONE_STATUSES), "Pending");
  assert.equal(decodeStatus(1, MILESTONE_STATUSES), "EvidenceSubmitted");
  assert.equal(decodeStatus(4, MILESTONE_STATUSES), "Released");
  assert.equal(decodeStatus(5, MILESTONE_STATUSES), "Refunded");
  assert.equal(decodeStatus(0, ENGAGEMENT_STATUSES), "Draft");
  assert.equal(decodeStatus(2, ENGAGEMENT_STATUSES), "Closed");
});

test("tagged and bare-string forms still decode", () => {
  assert.equal(decodeStatus({ tag: "Held" }, MILESTONE_STATUSES), "Held");
  assert.equal(decodeStatus("Funded", ENGAGEMENT_STATUSES), "Funded");
  assert.equal(decodeStatus(2n, MILESTONE_STATUSES), "Approved");
});

test("an unknown status throws instead of reaching the interface", () => {
  assert.throws(() => decodeStatus(99, MILESTONE_STATUSES), /Unrecognized contract status/);
  assert.throws(() => decodeStatus(undefined, MILESTONE_STATUSES));
  assert.throws(() => decodeStatus({ tag: "Nonsense" }, ENGAGEMENT_STATUSES));
});

/**
 * The tables mirror a Rust enum that lives outside this package, so read the
 * discriminants straight out of the contract and check they still line up.
 */
test("the tables match the discriminants in the settlement contract", async () => {
  const path = fileURLToPath(new URL("../../../../contracts/settlement/src/types.rs", import.meta.url));
  const source = await readFile(path, "utf8");

  const discriminants = (enumName: string) => {
    const body = source.split(`pub enum ${enumName} {`)[1]?.split("}")[0];
    assert.ok(body, `${enumName} not found in types.rs`);
    return [...body.matchAll(/(\w+)\s*=\s*(\d+)/g)].map(([, name, index]) => ({
      name,
      index: Number(index),
    }));
  };

  for (const { name, index } of discriminants("MilestoneStatus")) {
    assert.equal(MILESTONE_STATUSES[index], name, `MilestoneStatus ${name} = ${index}`);
  }
  for (const { name, index } of discriminants("EngagementStatus")) {
    assert.equal(ENGAGEMENT_STATUSES[index], name, `EngagementStatus ${name} = ${index}`);
  }
});
