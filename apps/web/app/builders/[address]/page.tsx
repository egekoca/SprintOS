"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { listEngagements, type Engagement } from "@/lib/stellar/contract";
import { explorerAccount, formatUsdc, shortAddress } from "@/lib/stellar/config";
import { EngagementPill } from "@/components/StatusPill";
import { FoxLoader } from "@/components/FoxLoader";
import { ProductIcon } from "@/components/ProductIcon";

/**
 * One builder's full engagement history, not just their Board totals.
 *
 * The Board ranks everyone by what they earned — a single number is the right
 * shape for comparing a hundred builders at a glance, the wrong shape for a
 * programme that wants to check one builder's actual track record before
 * relying on them again. This is that second view: every engagement they were
 * ever assigned, funded or not, paid or not, each one a link to its own public
 * record. No wallet needed, the same as the Board and every `/e/[id]` page —
 * read straight from the ledger, not from a stored total.
 */
export default function BuilderHistoryPage() {
  const address = String(useParams().address ?? "");
  const validAddress = /^G[A-Z2-7]{55}$/.test(address);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a
     manual retry counter. It is not read in here — bumping it is the whole
     point, because it is how the Retry button re-runs a load that failed. */
  useEffect(() => {
    setLoading(true);
    setError(null);
    if (!validAddress) {
      setLoading(false);
      return;
    }
    listEngagements()
      .then(setEngagements)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [validAddress, attempt]);

  if (loading) {
    return <section className="shell" style={{ paddingBlock: "4rem" }}><FoxLoader label="Reading the ledger" /></section>;
  }

  if (!validAddress) {
    return (
      <section className="shell desk-gate">
        <h2>Not a Stellar account id</h2>
        <p className="lede">"{address}" is not a valid G... address.</p>
        <Link href="/board" className="btn btn-primary">← Back to the Board</Link>
      </section>
    );
  }

  if (error) {
    return (
      <section className="shell desk-gate">
        <h2>Could not read the ledger</h2>
        <p className="lede">{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </section>
    );
  }

  const mine = engagements.filter((e) => e.builder === address).sort((a, b) => (a.id > b.id ? -1 : 1));

  const earned = mine.reduce(
    (sum, e) => sum + e.milestones.filter((m) => m.status === "Released").reduce((s, m) => s + m.amount, 0n),
    0n,
  );
  const milestonesPaid = mine.reduce(
    (sum, e) => sum + e.milestones.filter((m) => m.status === "Released").length,
    0,
  );
  const outstanding = mine.reduce(
    (sum, e) => sum + e.milestones.filter((m) => m.status !== "Released" && m.status !== "Refunded").length,
    0,
  );

  return (
    <section className="shell stack-l" style={{ paddingBlock: "2.5rem" }}>
      <header className="stack-s">
        <p className="eyebrow">Builder</p>
        <h2>
          <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className="mono">
            {shortAddress(address, 6, 6)}
          </a>
        </h2>
        <p className="muted">
          Every engagement this address has ever been assigned as builder, read straight from the
          settlement contract — not a stored total.{" "}
          <Link href="/board" className="badge-link">← Back to the Board</Link>
        </p>
      </header>

      <div className="stat-row">
        <Stat icon="wallet" value={formatUsdc(earned)} label="USDC earned" note="released after human approval" strong />
        <Stat icon="milestone" value={String(milestonesPaid)} label="Milestones paid" note={`across ${mine.length} engagement${mine.length === 1 ? "" : "s"}`} />
        <Stat icon="shield" value={String(outstanding)} label="Milestones outstanding" note="not yet released or refunded" />
      </div>

      <div className="board">
        <div className="spread board-head">
          <div>
            <p className="eyebrow">Engagement history</p>
            <h3>Every assignment, not just the paid ones</h3>
          </div>
        </div>

        {mine.length === 0 ? (
          <p className="board-empty">No engagement on this contract names this address as builder.</p>
        ) : (
          <table className="board-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Sponsor</th>
                <th scope="col">Status</th>
                <th scope="col">Milestones</th>
                <th scope="col">Earned</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((e) => {
                const engagementEarned = e.milestones
                  .filter((m) => m.status === "Released")
                  .reduce((s, m) => s + m.amount, 0n);
                return (
                  <tr key={String(e.id)}>
                    <td className="board-rank">
                      <Link href={`/e/${e.id}`} className="badge-link">#{String(e.id)}</Link>
                    </td>
                    <td>
                      <a href={explorerAccount(e.sponsor)} target="_blank" rel="noreferrer" className="mono">
                        {shortAddress(e.sponsor, 4, 4)}
                      </a>
                    </td>
                    <td><EngagementPill status={e.status} /></td>
                    <td className="data">{e.milestones.length}</td>
                    <td className="data">{formatUsdc(engagementEarned)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon, value, label, note, strong = false,
}: {
  icon: "milestone" | "wallet" | "signature" | "shield";
  value: string;
  label: string;
  note: string;
  strong?: boolean;
}) {
  return (
    <div className={`stat${strong ? " is-strong" : ""}`}>
      <span className="stat-icon"><ProductIcon name={icon} size={19} /></span>
      <span className="stat-text">
        <b>{value}</b>
        <span>{label}</span>
        <small>{note}</small>
      </span>
    </div>
  );
}
