"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { FoxSpinner } from "@/components/FoxLoader";
import { availablePaymentAssets, type PaymentAsset } from "@/lib/stellar/payment-assets";
import { payForPlan } from "@/lib/stellar/pay";
import type { Entitlement } from "@/lib/entitlement";

/**
 * Upgrade to Plus or Pro.
 *
 * No subscription contract and no custom token: picking a tier and an asset
 * here builds one plain Stellar payment to this deployment's treasury
 * address, the connected wallet signs it, and `/api/account/activate` reads
 * it back from the network before entitlement changes. A failed or never-
 * sent payment leaves the wallet on Free — there is no partial state to get
 * stuck in.
 */

const TIER_LABEL: Record<"plus" | "pro", string> = { plus: "Plus", pro: "Pro" };
const PLAN_LABEL: Record<"free" | "plus" | "pro", string> = { free: "Free", plus: "Plus", pro: "Pro" };

export default function PlusPage() {
  const { address, connect } = useWallet();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [tier, setTier] = useState<"plus" | "pro">("plus");
  const [assetCode, setAssetCode] = useState<string>(() => availablePaymentAssets()[0]?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tier: "plus" | "pro"; tx_hash: string } | null>(null);

  const assets = availablePaymentAssets();
  const asset: PaymentAsset | undefined = assets.find((a) => a.code === assetCode) ?? assets[0];

  const loadEntitlement = useCallback(async () => {
    if (!address) {
      setEntitlement(null);
      return;
    }
    try {
      const res = await fetch(`/api/account?address=${address}`);
      const body = await res.json();
      setEntitlement(body.entitlement ?? null);
    } catch {
      /* Shown as "unknown" below rather than an error — this is a read, not the purchase itself. */
    }
  }, [address]);

  useEffect(() => {
    void loadEntitlement();
  }, [loadEntitlement]);

  async function upgrade() {
    if (!address || !asset) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const txHash = await payForPlan(address, asset, tier);
      const res = await fetch("/api/account/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, tx_hash: txHash, tier }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(
          `${body.error ?? "Activation failed."} The payment itself is on the ledger (${txHash.slice(0, 12)}…) — this only means SprintOS could not confirm it yet; try again in a moment.`,
        );
        return;
      }
      setEntitlement(body.entitlement ?? null);
      setDone({ tier, tx_hash: txHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shell stack-l" style={{ paddingBlock: "2.5rem" }}>
      <header className="stack-s">
        <p className="eyebrow">Plans</p>
        <h2>Free, Plus and Pro<span className="rec-hot">.</span></h2>
        <p className="muted" style={{ maxWidth: "64ch" }}>
          Free is three Standard Reviews every 30 days, no Deep Review. Plus and Pro raise both
          caps after a plain Stellar payment to this deployment's treasury address — no custom
          token, no subscription contract.
        </p>
      </header>

      {!address && (
        <div className="panel row" style={{ justifyContent: "space-between" }}>
          <p className="muted">Connect a wallet to see your plan or upgrade.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={connect}>Connect wallet</button>
        </div>
      )}

      {address && (
        <div className="panel stack-s">
          <p className="eyebrow">Current plan</p>
          <p className="amount" style={{ fontSize: "1.25rem" }}>
            {entitlement ? PLAN_LABEL[entitlement.plan] : "Reading…"}
          </p>
          {entitlement && (
            <p className="faint mono" style={{ fontSize: "0.8125rem" }}>
              {entitlement.remaining.standard} standard · {entitlement.remaining.deep} deep reviews left this period
            </p>
          )}
        </div>
      )}

      {address && assets.length > 0 && (
        <div className="panel stack">
          <p className="eyebrow">Upgrade</p>

          <div className="row" style={{ gap: "1rem" }}>
            {(["plus", "pro"] as const).map((t) => (
              <label key={t} className="row" style={{ gap: "0.375rem" }}>
                <input type="radio" name="tier" checked={tier === t} onChange={() => setTier(t)} />
                <span>{TIER_LABEL[t]}</span>
              </label>
            ))}
          </div>

          <div className="row" style={{ gap: "1rem", flexWrap: "wrap" }}>
            {assets.map((a) => (
              <label key={a.code} className="row" style={{ gap: "0.375rem" }}>
                <input
                  type="radio"
                  name="asset"
                  checked={assetCode === a.code}
                  onChange={() => setAssetCode(a.code)}
                />
                <span>
                  {a.price[tier]} {a.code}
                </span>
              </label>
            ))}
          </div>

          {error && <p className="notice">{error}</p>}
          {done && (
            <p className="notice notice-ok">
              {TIER_LABEL[done.tier]} activated. Payment tx {done.tx_hash.slice(0, 12)}…
            </p>
          )}

          <button type="button" className="btn btn-primary" disabled={busy || !asset} onClick={upgrade}>
            {busy ? <><FoxSpinner /> Waiting for signature…</> : `Pay ${asset?.price[tier] ?? "?"} ${asset?.code ?? ""} for ${TIER_LABEL[tier]}`}
          </button>
          <p className="faint" style={{ fontSize: "0.75rem" }}>
            This builds one payment to this deployment's treasury address. Your wallet shows you
            exactly what it is signing before anything is sent.
          </p>
        </div>
      )}

      {address && assets.length === 0 && (
        <p className="notice">This deployment is not configured to sell Plus or Pro yet.</p>
      )}
    </section>
  );
}
