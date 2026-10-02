import { NextResponse } from "next/server";
import { entitlementOf, newAccount } from "@/lib/entitlement";
import { StoreUnavailableError, store } from "@/lib/store";

/**
 * The wallet-based account: Free or Plus, and what is left in this window.
 *
 * Reading never creates a record — a wallet that has never been seen simply
 * gets the fresh-account entitlement computed on the fly. The store only
 * gains an entry once a review is actually used or Plus is activated.
 */
export const runtime = "nodejs";

const ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Send a Stellar account id." }, { status: 400 });
  }
  try {
    const account = (await store.getAccount(address)) ?? newAccount(address);
    return NextResponse.json({ entitlement: entitlementOf(account) });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "The account could not be read." }, { status: 500 });
  }
}
