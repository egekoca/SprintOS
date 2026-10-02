import { test } from "node:test";
import assert from "node:assert/strict";
import { canUse, entitlementOf, newAccount, recordUsage } from "./entitlement.ts";

const ADDRESS = "GBIFJZC2QVNDKDJQEBC247BF5URT4T24FXCRC53527P3TXUUIEIRZSMA";
const NOW = new Date("2026-10-02T00:00:00.000Z");

test("a fresh wallet is Free with the full three standard reviews", () => {
  const account = newAccount(ADDRESS, NOW);
  const entitlement = entitlementOf(account, NOW);
  assert.equal(entitlement.plan, "free");
  assert.equal(entitlement.remaining.standard, 3);
  assert.equal(entitlement.remaining.deep, 0);
});

test("Free never grants Deep reviews, however many standard reviews remain", () => {
  const account = newAccount(ADDRESS, NOW);
  assert.equal(canUse(account, "deep", NOW), false);
});

test("using a standard review decrements the remaining count", () => {
  const account = recordUsage(newAccount(ADDRESS, NOW), "standard", NOW);
  assert.equal(entitlementOf(account, NOW).remaining.standard, 2);
});

test("the fourth standard review in a window is refused on Free", () => {
  let account = newAccount(ADDRESS, NOW);
  for (let i = 0; i < 3; i++) account = recordUsage(account, "standard", NOW);
  assert.equal(canUse(account, "standard", NOW), false);
});

test("an active Plus period raises the caps and unlocks Deep", () => {
  const account = {
    ...newAccount(ADDRESS, NOW),
    plus_activated_at: NOW.toISOString(),
    plus_expires_at: new Date(NOW.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const entitlement = entitlementOf(account, NOW);
  assert.equal(entitlement.plan, "plus");
  assert.equal(entitlement.remaining.standard, 10);
  assert.equal(entitlement.remaining.deep, 5);
});

test("an expired Plus period falls back to Free", () => {
  const account = {
    ...newAccount(ADDRESS, NOW),
    plus_activated_at: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    plus_expires_at: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  };
  assert.equal(entitlementOf(account, NOW).plan, "free");
});

test("a window older than 30 days resets usage to zero rather than banking it", () => {
  let account = newAccount(ADDRESS, NOW);
  account = recordUsage(account, "standard", NOW);
  account = recordUsage(account, "standard", NOW);
  const later = new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000);
  assert.equal(entitlementOf(account, later).remaining.standard, 3);
});

test("recording usage past a window boundary resets first, then counts the new use", () => {
  let account = newAccount(ADDRESS, NOW);
  account = recordUsage(account, "standard", NOW);
  account = recordUsage(account, "standard", NOW);
  const later = new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000);
  account = recordUsage(account, "standard", later);
  assert.equal(account.standard_reviews_used, 1);
  assert.equal(entitlementOf(account, later).remaining.standard, 2);
});
