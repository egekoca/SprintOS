"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { listEngagements, roleOf, type Engagement } from "@/lib/stellar/contract";
import { formatUsdc, shortAddress } from "@/lib/stellar/config";
import { EngagementPill, StatusPill } from "@/components/StatusPill";
import { FoxLoader } from "@/components/FoxLoader";

/**
 * The review list.
 *
 * Milestones waiting on the connected reviewer come first — that is the only
 * queue that represents work someone is blocked on.
 */
export default function ReviewListPage() {
  const { address, connect } = useWallet();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEngagements()
      .then(setEngagements)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const waiting = engagements.flatMap((e) =>
    e.milestones
      .map((m, idx) => ({ e, m, idx }))
      .filter(({ m }) => m.status === "EvidenceSubmitted" && (!address || e.reviewer === address)),
  );

  return (
    <section className="shell stack-l" style={{ paddingBlock: "3rem" }}>
      <div className="stack-s">
        <p className="eyebrow">Reviewer</p>
        <h2>The desk<span style={{ color: "var(--orange)" }}>.</span></h2>
        <p className="lede">
          Criteria, evidence and the advisory report side by side. You decide; the module does not.
        </p>
      </div>

      {!address && (
        <div className="panel row" style={{ justifyContent: "space-between" }}>
          <p className="muted">Connect your wallet to act on a milestone. You can read everything without one.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={connect}>Connect wallet</button>
        </div>
      )}

      {error && <p className="notice">{error}</p>}
      {loading && <FoxLoader label="Reading the ledger" />}

      {waiting.length > 0 && (
        <div className="stack">
          <div className="row">
            <span className="tape-label">Waiting on you</span>
            <span className="faint mono" style={{ fontSize: "0.75rem" }}>{waiting.length} milestone{waiting.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid-2">
            {waiting.map(({ e, m, idx }) => (
              <Link key={`${e.id}-${idx}`} href={`/review/${e.id}/${idx}`} className="panel panel-marked stack-s" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="spread">
                  <span className="faint mono" style={{ fontSize: "0.75rem" }}>Engagement #{String(e.id)} · milestone {idx + 1}</span>
                  <StatusPill status={m.status} />
                </div>
                <strong style={{ fontSize: "1.0625rem" }}>{m.title}</strong>
                <span className="amount" style={{ fontSize: "1.25rem", color: "var(--chalk)" }}>
                  {formatUsdc(m.amount)} <span className="faint mono" style={{ fontSize: "0.6875rem" }}>USDC</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && engagements.length === 0 && (
        <div className="panel"><p className="muted">No engagements on this contract yet.</p></div>
      )}

      {engagements.length > 0 && (
        <div className="stack">
          <p className="eyebrow">All engagements</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement</th><th>Builder</th><th>Reviewer</th>
                  <th>Total</th><th>Status</th><th>Milestones</th><th></th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((e) => (
                  <tr key={String(e.id)}>
                    <td className="mono">#{String(e.id)}</td>
                    <td className="mono" style={{ fontSize: "0.8125rem" }}>{shortAddress(e.builder)}</td>
                    <td className="mono" style={{ fontSize: "0.8125rem" }}>
                      {shortAddress(e.reviewer)}
                      {address && roleOf(e, address) === "reviewer" && (
                        <span className="faint" style={{ marginLeft: "0.375rem", fontSize: "0.6875rem" }}>you</span>
                      )}
                    </td>
                    <td className="data">{formatUsdc(e.total_amount)}</td>
                    <td><EngagementPill status={e.status} /></td>
                    <td>
                      <span className="row" style={{ gap: "0.25rem" }}>
                        {e.milestones.map((m, i) => <StatusPill key={i} status={m.status} />)}
                      </span>
                    </td>
                    <td><Link href={`/e/${e.id}`} className="badge-link">Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
