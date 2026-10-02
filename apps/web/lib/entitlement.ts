import {
  FREE_STANDARD_REVIEWS_PER_PERIOD,
  PLAN_PERIOD_DAYS,
  PLUS_DEEP_REVIEWS_PER_PERIOD,
  PLUS_STANDARD_REVIEWS_PER_PERIOD,
  type ReviewKind,
  type WalletAccount,
} from "@sprintos/schemas";

/**
 * Free and Plus entitlement, as pure functions over a `WalletAccount`.
 *
 * There is no separate "plan" field to drift out of sync: Plus is simply
 * whether `plus_expires_at` is still in the future, and that date is only
 * ever set after a Mainnet USDC payment has been read back from the network
 * (see the `/api/account/activate` route) — never from a client claim.
 */

const PERIOD_MS = PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export function newAccount(address: string, now: Date = new Date()): WalletAccount {
  return {
    schema_version: "1.0.0",
    address,
    period_start: now.toISOString(),
    standard_reviews_used: 0,
    deep_reviews_used: 0,
  };
}

export function isPlusActive(account: WalletAccount, now: Date = new Date()): boolean {
  if (!account.plus_expires_at) return false;
  return new Date(account.plus_expires_at).getTime() > now.getTime();
}

/**
 * Roll the usage window forward once 30 days have passed since it opened.
 *
 * Pure: callers that need the reset to stick persist the result themselves.
 * A wallet that never returns does not accrue unused reviews — each new
 * window starts at zero, it does not carry a balance forward.
 */
export function withCurrentPeriod(account: WalletAccount, now: Date = new Date()): WalletAccount {
  const elapsed = now.getTime() - new Date(account.period_start).getTime();
  if (elapsed < PERIOD_MS) return account;
  return { ...account, period_start: now.toISOString(), standard_reviews_used: 0, deep_reviews_used: 0 };
}

export interface Entitlement {
  plan: "free" | "plus";
  remaining: { standard: number; deep: number };
  period_start: string;
  plus_expires_at?: string;
}

export function entitlementOf(account: WalletAccount, now: Date = new Date()): Entitlement {
  const current = withCurrentPeriod(account, now);
  const plus = isPlusActive(current, now);
  const standardCap = plus ? PLUS_STANDARD_REVIEWS_PER_PERIOD : FREE_STANDARD_REVIEWS_PER_PERIOD;
  const deepCap = plus ? PLUS_DEEP_REVIEWS_PER_PERIOD : 0;
  return {
    plan: plus ? "plus" : "free",
    remaining: {
      standard: Math.max(0, standardCap - current.standard_reviews_used),
      deep: Math.max(0, deepCap - current.deep_reviews_used),
    },
    period_start: current.period_start,
    ...(current.plus_expires_at ? { plus_expires_at: current.plus_expires_at } : {}),
  };
}

export function canUse(account: WalletAccount, kind: ReviewKind, now: Date = new Date()): boolean {
  const entitlement = entitlementOf(account, now);
  return kind === "standard" ? entitlement.remaining.standard > 0 : entitlement.remaining.deep > 0;
}

/**
 * Record one review's usage, rolling the window forward first if it elapsed.
 * Pure — callers persist the result with `store.putAccount`.
 */
export function recordUsage(account: WalletAccount, kind: ReviewKind, now: Date = new Date()): WalletAccount {
  const current = withCurrentPeriod(account, now);
  return kind === "standard"
    ? { ...current, standard_reviews_used: current.standard_reviews_used + 1 }
    : { ...current, deep_reviews_used: current.deep_reviews_used + 1 };
}
