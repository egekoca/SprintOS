import {
  FREE_STANDARD_REVIEWS_PER_PERIOD,
  PLAN_PERIOD_DAYS,
  PLUS_DEEP_REVIEWS_PER_PERIOD,
  PLUS_STANDARD_REVIEWS_PER_PERIOD,
  PRO_DEEP_REVIEWS_PER_PERIOD,
  PRO_STANDARD_REVIEWS_PER_PERIOD,
  type PaidTier,
  type ReviewKind,
  type WalletAccount,
} from "@sprintos/schemas";

/**
 * Free, Plus and Pro entitlement, as pure functions over a `WalletAccount`.
 *
 * There is no separate "plan" field to drift out of sync: the active tier is
 * simply whichever `paid_tier` is set while `tier_expires_at` is still in the
 * future, and that date is only ever set after a Mainnet payment has been
 * read back from the network and matched against `payment-assets.ts`'s price
 * table — never from a client claim. See `/api/account/activate`.
 */

const PERIOD_MS = PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export function newAccount(address: string, now: Date = new Date()): WalletAccount {
  return {
    schema_version: "2.0.0",
    address,
    period_start: now.toISOString(),
    standard_reviews_used: 0,
    deep_reviews_used: 0,
  };
}

/** "free" whenever no paid tier is set or its period has lapsed. */
export function activeTier(account: WalletAccount, now: Date = new Date()): "free" | PaidTier {
  if (!account.paid_tier || !account.tier_expires_at) return "free";
  return new Date(account.tier_expires_at).getTime() > now.getTime() ? account.paid_tier : "free";
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
  plan: "free" | PaidTier;
  remaining: { standard: number; deep: number };
  period_start: string;
  tier_expires_at?: string;
}

const CAPS: Record<"free" | PaidTier, { standard: number; deep: number }> = {
  free: { standard: FREE_STANDARD_REVIEWS_PER_PERIOD, deep: 0 },
  plus: { standard: PLUS_STANDARD_REVIEWS_PER_PERIOD, deep: PLUS_DEEP_REVIEWS_PER_PERIOD },
  pro: { standard: PRO_STANDARD_REVIEWS_PER_PERIOD, deep: PRO_DEEP_REVIEWS_PER_PERIOD },
};

export function entitlementOf(account: WalletAccount, now: Date = new Date()): Entitlement {
  const current = withCurrentPeriod(account, now);
  const plan = activeTier(current, now);
  const caps = CAPS[plan];
  return {
    plan,
    remaining: {
      standard: Math.max(0, caps.standard - current.standard_reviews_used),
      deep: Math.max(0, caps.deep - current.deep_reviews_used),
    },
    period_start: current.period_start,
    ...(current.tier_expires_at ? { tier_expires_at: current.tier_expires_at } : {}),
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
