"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listEngagements } from "@/lib/stellar/contract";
import { formatUsdc } from "@/lib/stellar/config";
import { totalsOf, type Totals } from "@/lib/leaderboard";

/**
 * Three live figures on the landing page, read from the contract.
 *
 * The page above this makes an argument. This is the part of it that can be
 * checked, so it is worth stating plainly and linking straight to the full
 * board rather than dressing it up.
 *
 * It renders nothing at all until the ledger answers. A marketing page that
 * flashes zeroes and then corrects itself has told the visitor something false,
 * however briefly — and "no milestone has ever been paid" is the one claim this
 * project cannot afford to make by accident.
 */
export function LiveTotals() {
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEngagements()
      .then((engagements) => {
        if (!cancelled) setTotals(totalsOf(engagements));
      })
      .catch(() => {
        /* The landing page is not the place to report an RPC problem. If the
           ledger cannot be read, the strip simply does not appear. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!totals || totals.milestonesPaid === 0) return null;

  return (
    <section className="live-totals shell">
      <p className="eyebrow">Live on Stellar testnet</p>
      <div className="live-totals-row">
        <span>
          <b>{formatUsdc(totals.distributed)}</b>
          <small>USDC released to builders</small>
        </span>
        <span>
          <b>{totals.milestonesPaid}</b>
          <small>milestones paid after a human approval</small>
        </span>
        <span>
          <b>{totals.buildersPaid}</b>
          <small>builder{totals.buildersPaid === 1 ? "" : "s"} paid</small>
        </span>
      </div>
      <Link href="/board" className="badge-link">See the full board →</Link>
    </section>
  );
}
