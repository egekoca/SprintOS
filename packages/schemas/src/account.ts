import { z } from "zod";

/**
 * The wallet-based account.
 *
 * There is no email, password, or organisation record — connecting a Stellar
 * wallet is the whole account, and this document is the only state that
 * follows an address across engagements. It tracks which 30-day window a
 * wallet's Free reviews are measured against and, when the wallet has paid
 * for Plus or Pro, the Mainnet transaction that proved it.
 */

export const ACCOUNT_SCHEMA_VERSION = "2.0.0" as const;

export const ReviewKind = z.enum(["standard", "deep"]);
export type ReviewKind = z.infer<typeof ReviewKind>;

/** The two paid tiers. Free has no entry here — it is simply the absence of one. */
export const PaidTier = z.enum(["plus", "pro"]);
export type PaidTier = z.infer<typeof PaidTier>;

export const WalletAccount = z.object({
  schema_version: z.literal(ACCOUNT_SCHEMA_VERSION),
  address: z.string().regex(/^G[A-Z2-7]{55}$/, "Expected a Stellar account id"),
  /**
   * Start of the current rolling window. The Free allowance is "N reviews per
   * 30 days", not "N per calendar month" — a wallet that returns after the
   * window has elapsed gets a fresh window starting now, it does not bank
   * unused reviews from the one before.
   */
  period_start: z.iso.datetime(),
  standard_reviews_used: z.number().int().min(0),
  deep_reviews_used: z.number().int().min(0),
  /** Present only while a paid period is active. */
  paid_tier: PaidTier.optional(),
  tier_activated_at: z.iso.datetime().optional(),
  tier_expires_at: z.iso.datetime().optional(),
  /** Which of the accepted assets funded the current period — see payment-assets.ts. */
  tier_payment_asset: z.string().max(12).optional(),
  /**
   * The Mainnet payment that activated the current tier.
   *
   * Entitlement is granted only after this transaction is read back from the
   * network and confirmed — never from a client claim — so the hash anchoring
   * that check is kept here rather than trusted implicitly.
   */
  tier_payment_tx_hash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export type WalletAccount = z.infer<typeof WalletAccount>;

export const PLAN_PERIOD_DAYS = 30;

export const FREE_STANDARD_REVIEWS_PER_PERIOD = 3;
export const PLUS_STANDARD_REVIEWS_PER_PERIOD = 10;
export const PLUS_DEEP_REVIEWS_PER_PERIOD = 5;
export const PRO_STANDARD_REVIEWS_PER_PERIOD = 25;
export const PRO_DEEP_REVIEWS_PER_PERIOD = 15;

/**
 * Reference prices, in USD-pegged terms, for the two paid tiers.
 *
 * The actual amount a wallet owes depends on which asset it pays in — see
 * `apps/web/lib/stellar/payment-assets.ts` — but Plus is priced here against
 * the signed SOW's own 5 USDC figure, and Pro as a clear step up from it.
 * Draft numbers: adjust freely, nothing downstream hardcodes them beyond
 * this file and the per-asset price table that reads them.
 */
export const PLUS_PRICE_USDC = "5";
export const PRO_PRICE_USDC = "15";
