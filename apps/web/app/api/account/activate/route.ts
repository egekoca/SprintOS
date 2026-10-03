import { NextResponse } from "next/server";
import { PaidTier, PLAN_PERIOD_DAYS, type WalletAccount } from "@sprintos/schemas";
import { entitlementOf, newAccount } from "@/lib/entitlement";
import { StoreUnavailableError, store } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";
import { TREASURY_ADDRESS } from "@/lib/stellar/config";
import { findPaymentAsset } from "@/lib/stellar/payment-assets";
import { verifyPayment } from "@/lib/stellar/payment-verify.server";

/**
 * Activate SprintOS Plus or Pro for one wallet.
 *
 * Entitlement is granted only after the payment is read back from the
 * network: an accepted asset, the right recipient, at least that asset's
 * price for the requested tier, and sent by the wallet asking to be
 * upgraded. A client claiming "I paid" is never enough — exactly the
 * discipline `/api/activity` applies to settlement transactions, applied
 * here to the one payment in this app that is not a contract call.
 */
export const runtime = "nodejs";

const ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (!takeRateLimit(`account-activate:${requestClientKey(request)}`, 10).allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }
  if (!TREASURY_ADDRESS) {
    return NextResponse.json(
      { error: "This deployment is not configured to sell Plus or Pro yet." },
      { status: 503 },
    );
  }

  let body: { address?: unknown; tx_hash?: unknown; tier?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address : "";
  const txHash = typeof body.tx_hash === "string" ? body.tx_hash.toLowerCase() : "";
  const tierParsed = PaidTier.safeParse(body.tier);
  if (!ADDRESS_RE.test(address) || !/^[0-9a-f]{64}$/.test(txHash) || !tierParsed.success) {
    return NextResponse.json(
      { error: "Send the wallet address, the payment transaction hash, and the tier (\"plus\" or \"pro\")." },
      { status: 400 },
    );
  }
  const tier = tierParsed.data;

  let account: WalletAccount;
  try {
    account = (await store.getAccount(address)) ?? newAccount(address);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  if (account.tier_payment_tx_hash === txHash) {
    return NextResponse.json({ error: "That payment has already activated a paid period." }, { status: 409 });
  }

  const payment = await verifyPayment(txHash);
  if (!payment) {
    return NextResponse.json(
      { error: "That transaction could not be read back from the network as a confirmed payment." },
      { status: 409 },
    );
  }
  if (payment.from !== address) {
    return NextResponse.json({ error: "That payment was not sent by this wallet." }, { status: 403 });
  }
  if (payment.to !== TREASURY_ADDRESS) {
    return NextResponse.json({ error: "That payment was not sent to the SprintOS treasury address." }, { status: 403 });
  }

  const asset = findPaymentAsset(payment.assetCode, payment.assetIssuer);
  if (!asset) {
    return NextResponse.json(
      { error: `${payment.assetCode} is not an asset this deployment accepts for Plus or Pro.` },
      { status: 403 },
    );
  }
  const price = asset.price[tier];
  if (Number(payment.amount) < Number(price)) {
    return NextResponse.json(
      { error: `That payment was for less than the ${price} ${asset.code} ${tier} price.` },
      { status: 403 },
    );
  }

  const now = new Date();
  const activated: WalletAccount = {
    ...account,
    paid_tier: tier,
    tier_activated_at: now.toISOString(),
    tier_expires_at: new Date(now.getTime() + PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    tier_payment_asset: asset.code,
    tier_payment_tx_hash: txHash,
  };

  try {
    await store.putAccount(activated);
    return NextResponse.json({ entitlement: entitlementOf(activated, now) });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "The account could not be updated." }, { status: 500 });
  }
}
