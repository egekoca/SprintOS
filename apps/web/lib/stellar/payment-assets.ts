import { PLUS_PRICE_USDC, PRO_PRICE_USDC, type PaidTier } from "@sprintos/schemas/account";
import {
  EURC_ASSET_CODE,
  EURC_ISSUER,
  IS_MAINNET,
  USDC_ASSET_CODE,
  USDC_ISSUER,
  USDT0_ASSET_CODE,
  USDT0_ISSUER,
} from "./config";

/**
 * What SprintOS Plus and Pro can be paid in.
 *
 * "At least four Stellar-network assets" per the Month 3 plan is an
 * architectural capability here, not a hardcoded guess: each entry is a
 * real, independently verified issuer, and adding one more is a single
 * object in this array — never a price computed from a live exchange rate.
 * Stablecoins are priced at their peg; the asset that is not one (native
 * XLM) gets its own flat price instead of a derived USD conversion, so this
 * never depends on a price oracle as an external dependency.
 *
 * Three were wired with verified issuers as of 2026-10-04; a fourth (USDT0)
 * was added 2026-10-29 once a real, checked issuer address existed — see
 * docs/MONTH-2-COMPLETION-PLAN.md for why this file does not simply invent
 * one to hit a number.
 */
export interface PaymentAsset {
  /** The asset code as it appears in a Horizon payment operation. */
  code: string;
  /** null for native XLM. */
  issuer: string | null;
  /** Exact amount owed per tier, in this asset's own units. */
  price: Record<PaidTier, string>;
  /** Only offered where this issuer is actually meaningful. */
  mainnetOnly: boolean;
}

export const PAYMENT_ASSETS: readonly PaymentAsset[] = [
  {
    code: USDC_ASSET_CODE,
    issuer: USDC_ISSUER,
    price: { plus: PLUS_PRICE_USDC, pro: PRO_PRICE_USDC },
    mainnetOnly: false,
  },
  {
    code: EURC_ASSET_CODE,
    issuer: EURC_ISSUER,
    // Approximate EUR-equivalent of the USD reference prices, not a live
    // conversion — a flat figure, re-priced by hand occasionally rather than
    // fetched, same reasoning as the native-XLM price below.
    // Temporarily cut to trivial test amounts (2026-10-06), same reason as
    // PLUS_PRICE_USDC/PRO_PRICE_USDC. Restore to 5/14 before the real pilot.
    price: { plus: "0.5", pro: "1" },
    mainnetOnly: true,
  },
  {
    code: USDT0_ASSET_CODE,
    issuer: USDT0_ISSUER,
    // Same trivial test pricing as the other stablecoins for the mainnet
    // smoke test; restore to 5/14 before the real pilot.
    price: { plus: "0.5", pro: "1" },
    mainnetOnly: true,
  },
  {
    code: "XLM",
    issuer: null,
    // Flat prices, not a USD conversion — this deployment holds no price
    // oracle and is not adding one just to accept the network's own asset.
    // Re-price by hand if XLM moves enough to make these feel wrong.
    // Temporarily cut to trivial test amounts (2026-10-06); restore to
    // 25/75 before the real pilot.
    price: { plus: "1", pro: "2" },
    mainnetOnly: false,
  },
] as const;

/** The assets this deployment actually offers right now. */
export function availablePaymentAssets(): PaymentAsset[] {
  return PAYMENT_ASSETS.filter((asset) => IS_MAINNET || !asset.mainnetOnly);
}

export function findPaymentAsset(code: string, issuer: string | null): PaymentAsset | undefined {
  return PAYMENT_ASSETS.find(
    (asset) => asset.code === code && (asset.issuer ?? null) === (issuer ?? null),
  );
}
