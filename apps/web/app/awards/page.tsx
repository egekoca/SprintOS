"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { FoxLoader } from "@/components/FoxLoader";
import { ProductIcon } from "@/components/ProductIcon";
import { WalletGate } from "@/components/WalletGate";
import { EngagementPill, StatusPill } from "@/components/StatusPill";
import { listEngagements, roleOf, type Engagement, type Role } from "@/lib/stellar/contract";
import { formatUsdc } from "@/lib/stellar/config";

/**
 * Every award this wallet is part of, read from the ledger.
 *
 * One person runs several of these at once, and may hold a different role in
 * each — sponsor here, reviewer there. There is nothing to edit on this page
 * by design: an award exists because someone signed it into the contract, and
 * the milestones it carries were fixed at that moment.
 */

const ROLE_LABEL: Record<Exclude<Role, "observer">, string> = {
  sponsor: "You fund it",
  builder: "You build it",
  reviewer: "You decide it",
};

export default function AwardsPage() {
  const { address } = useWallet();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    const all = await listEngagements();
    setEngagements(all);
  }, []);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a
     manual retry counter. It is not read in here — bumping it is the whole
     point, because it is how the Retry button re-runs a load that failed. */
  useEffect(() => {
    if (!address) {
      setEngagements([]);
      return;
    }
    setLoading(true);
    setError(null);
    load()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => setLoading(false));
  }, [address, load, attempt]);

  /* Only the programmes this wallet actually has a part in, and what that
     part is — the contract decides both, not this page. */
  const mine = useMemo(() => {
    if (!address) return [];
    return engagements
      .map((engagement) => ({ engagement, role: roleOf(engagement, address) }))
      .filter((entry): entry is { engagement: Engagement; role: Exclude<Role, "observer"> } =>
        entry.role !== "observer");
  }, [engagements, address]);

  if (!address) {
    return (
      <WalletGate eyebrow="Awards" title="Your awards">
        Connect a wallet to see every engagement it takes part in — the ones you fund, the ones you
        build, and the ones you decide.
      </WalletGate>
    );
  }

  return (
    <section className="shell desk">
      <header className="desk-head">
        <div>
          <p className="eyebrow">Awards</p>
          <h2>Your awards</h2>
        </div>
        <Link href="/sponsor" className="btn btn-primary">
          <ProductIcon name="milestone" size={18} /> Set up a new one
        </Link>
      </header>

      {error && (
        <div className="panel row" style={{ justifyContent: "space-between" }}>
          <p className="muted">Could not read the ledger: {error}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {loading && <FoxLoader label="Reading the ledger" />}

      {!loading && !error && mine.length === 0 && (
        <div className="panel stack">
          <p className="muted">
            This wallet is not named in any award yet. Set one up as a sponsor, or ask whoever is
            funding the work to add your address.
          </p>
        </div>
      )}

      {mine.length > 0 && (
        <ul className="award-list">
          {mine.map(({ engagement, role }) => {
            const settled = engagement.milestones.filter(
              (milestone) => milestone.status === "Released" || milestone.status === "Refunded",
            ).length;
            return (
              <li key={String(engagement.id)}>
                <Link href={`/e/${engagement.id}`} className="award-row">
                  <span className={`award-role is-${role}`}>{ROLE_LABEL[role]}</span>
                  <span className="award-main">
                    <strong>Engagement #{String(engagement.id)}</strong>
                    <small>
                      {settled} of {engagement.milestones.length} milestone
                      {engagement.milestones.length === 1 ? "" : "s"} settled
                    </small>
                    <span className="award-pills">
                      {engagement.milestones.map((milestone, index) => (
                        <StatusPill key={index} status={milestone.status} />
                      ))}
                    </span>
                  </span>
                  <span className="award-budget">
                    {formatUsdc(engagement.total_amount)} <small>USDC</small>
                  </span>
                  <EngagementPill status={engagement.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="desk-foot faint">
        Milestones and their requirements are fixed when an engagement is signed. Nothing on this
        page can change them — that is what makes them worth trusting.
      </p>
    </section>
  );
}
