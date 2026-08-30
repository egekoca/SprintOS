import deployment from "./deployment.json" with { type: "json" };

/**
 * Network configuration.
 *
 * Testnet only, by design. The Statement of Work puts mainnet deployment and
 * settlement with real funds explicitly out of scope, so there is no mainnet
 * branch here to switch on by accident.
 */
export const NETWORK = {
  passphrase: deployment.networkPassphrase,
  rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? deployment.rpcUrl,
  horizonUrl: deployment.horizonUrl,
} as const;

export const SETTLEMENT_CONTRACT_ID =
  process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT_ID ?? deployment.settlementContractId;

export const USDC_SAC_ID = process.env.NEXT_PUBLIC_USDC_SAC_ID ?? deployment.usdcSacId;

const builderClaimOverride = process.env.NEXT_PUBLIC_BUILDER_CLAIM_ENABLED;
export const BUILDER_CLAIM_ENABLED =
  builderClaimOverride === undefined || builderClaimOverride === ""
    ? deployment.features.builderClaim
    : builderClaimOverride === "true";

export const USDC_DECIMALS = 7;

export const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

/**
 * The origin this deployment is reachable at from outside.
 *
 * The evidence bundle's URI is written into contract storage and stays there,
 * so it has to be an address a reviewer — or an Ambassador reading the ledger
 * a month later — can actually open. Deriving it from `window.location.origin`
 * silently anchored `http://localhost:3000/...` whenever the flow was run
 * locally. Set `NEXT_PUBLIC_APP_URL` on every deployment.
 */
export const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

/** Whether an origin is one a third party could resolve. */
export function isPublicOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return !/^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local)$/i.test(hostname);
  } catch {
    return false;
  }
}

export const explorerTx = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerAccount = (address: string) => `${EXPLORER_BASE}/account/${address}`;
export const explorerContract = (id: string) => `${EXPLORER_BASE}/contract/${id}`;

/** Shorten an address for display without losing its identifying ends. */
export function shortAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Stroops to a display string. USDC carries seven decimals on Stellar. */
export function formatUsdc(stroops: bigint | string | number): string {
  const value = typeof stroops === "bigint" ? stroops : BigInt(stroops);
  const unit = 10n ** BigInt(USDC_DECIMALS);
  const whole = value / unit;
  const frac = (value < 0n ? -value : value) % unit;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

/**
 * Stroops to a bare decimal string, with no thousands separators.
 *
 * `formatUsdc` groups digits for display, which `parseUsdc` deliberately
 * rejects. Anything written back into an amount input has to round-trip, so it
 * uses this form instead.
 */
export function usdcInputValue(stroops: bigint): string {
  const unit = 10n ** BigInt(USDC_DECIMALS);
  const whole = stroops / unit;
  const frac = (stroops < 0n ? -stroops : stroops) % unit;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : String(whole);
}

/** Display string to stroops. Throws rather than silently rounding. */
export function parseUsdc(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error(`"${input}" is not a valid USDC amount (up to 7 decimal places).`);
  }
  const [whole = "0", frac = ""] = trimmed.split(".");
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, "0"));
}
