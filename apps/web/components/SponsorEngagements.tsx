"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "./WalletProvider";
import { FoxLoader, FoxSpinner } from "./FoxLoader";
import { EngagementPill, StatusPill } from "./StatusPill";
import { TxLink } from "./TxLink";
import { formatUsdc } from "@/lib/stellar/config";
import { fundEngagement, listEngagements, refundMilestone, type Engagement, type Milestone } from "@/lib/stellar/contract";

const REFUNDABLE = new Set<Milestone["status"]>(["Pending", "EvidenceSubmitted", "Held"]);

function refundIsAvailable(milestone: Milestone, nowSeconds: bigint): boolean {
  return REFUNDABLE.has(milestone.status) && nowSeconds > milestone.deadline;
}

export function SponsorEngagements() {
  const { address, connect } = useWallet();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ hash: string; message: string } | null>(null);
  const [nowSeconds, setNowSeconds] = useState<bigint | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setEngagements([]);
      return;
    }
    const all = await listEngagements();
    setEngagements(all.filter((engagement) => engagement.sponsor === address));
  }, [address]);

  useEffect(() => {
    setLastTx(null);
    setError(null);
    if (!address) {
      setEngagements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh()
      .catch((refreshError) => setError(refreshError instanceof Error ? refreshError.message : String(refreshError)))
      .finally(() => setLoading(false));
  }, [address, refresh]);

  useEffect(() => {
    const updateClock = () => setNowSeconds(BigInt(Math.floor(Date.now() / 1000)));
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function reclaim(engagement: Engagement, milestone: Milestone, idx: number) {
    if (!address || engagement.status !== "Funded" || !refundIsAvailable(milestone, BigInt(Math.floor(Date.now() / 1000)))) return;
    const key = `${engagement.id}-${idx}`;
    setBusy(key);
    setError(null);
    setLastTx(null);
    try {
      const transaction = await refundMilestone(address, engagement.id, idx);
      setLastTx({ hash: transaction.hash, message: `Reclaimed escrow for ${milestone.title}.` });
      try {
        await refresh();
      } catch {
        setError("Funds were reclaimed, but the engagement list could not refresh. Reload to see its new status.");
      }
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : String(refundError));
    } finally {
      setBusy(null);
    }
  }

  async function fundDraft(engagement: Engagement) {
    if (!address || engagement.status !== "Draft") return;
    const key = `fund-${engagement.id}`;
    setBusy(key);
    setError(null);
    setLastTx(null);
    try {
      const transaction = await fundEngagement(address, engagement.id);
      setLastTx({ hash: transaction.hash, message: `Engagement #${engagement.id} is funded.` });
      try {
        await refresh();
      } catch {
        setError("Escrow was funded, but the engagement list could not refresh. Reload to see its new status.");
      }
    } catch (fundError) {
      setError(fundError instanceof Error ? fundError.message : String(fundError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="stack" style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--edge)" }}>
      <div className="spread">
        <div className="stack-s" style={{ gap: "0.25rem" }}>
          <p className="eyebrow">Sponsor recovery</p>
          <h2>Your engagements<span className="rec-hot">.</span></h2>
          <p className="muted">Resume an unfunded draft here. After a funded milestone deadline, you can reclaim it unless the reviewer already approved it.</p>
        </div>
        {!address && <button type="button" className="btn btn-primary btn-sm" onClick={connect}>Connect sponsor wallet</button>}
      </div>

      {error && <p className="notice">{error}</p>}
      {lastTx && <div className="stack-s"><p className="notice notice-ok">{lastTx.message}</p><TxLink hash={lastTx.hash} /></div>}
      {loading && <FoxLoader label="Reading your sponsored engagements" />}

      {!address && <div className="panel"><p className="muted">Connect the wallet used as sponsor to view funded engagements and recover overdue escrow.</p></div>}
      {address && !loading && engagements.length === 0 && <div className="panel"><p className="muted">This wallet has not sponsored an engagement on the current contract.</p></div>}

      {engagements.map((engagement) => (
        <article className="panel stack" key={String(engagement.id)}>
          <div className="spread">
            <div className="row"><strong>Engagement #{String(engagement.id)}</strong><EngagementPill status={engagement.status} /></div>
            <div className="row">
              {engagement.status === "Draft" && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => fundDraft(engagement)}>
                  {busy === `fund-${engagement.id}` ? <><FoxSpinner /> Funding escrow…</> : `Fund ${formatUsdc(engagement.total_amount)} USDC`}
                </button>
              )}
              <Link href={`/e/${engagement.id}`} className="badge-link">Public record →</Link>
            </div>
          </div>
          {engagement.milestones.map((milestone, idx) => {
            const key = `${engagement.id}-${idx}`;
            const refundable = engagement.status === "Funded" && nowSeconds !== null && refundIsAvailable(milestone, nowSeconds);
            const waitingForDeadline = engagement.status === "Funded" && REFUNDABLE.has(milestone.status) && !refundable;
            return (
              <div className="spread" style={{ borderTop: "1px solid var(--edge)", paddingTop: "0.75rem" }} key={idx}>
                <div className="stack-s" style={{ gap: "0.25rem" }}>
                  <div className="row"><strong>{milestone.title}</strong><StatusPill status={milestone.status} /></div>
                  <span className="faint mono" style={{ fontSize: "0.75rem" }}>
                    {formatUsdc(milestone.amount)} USDC · due {new Date(Number(milestone.deadline) * 1000).toLocaleString()}
                  </span>
                  {waitingForDeadline && <small className="faint">Recovery unlocks only after the deadline.</small>}
                  {milestone.status === "Approved" && <small className="faint">Approved funds are owed to the builder and cannot be reclaimed.</small>}
                </div>
                {refundable && (
                  <button type="button" className="btn btn-hold btn-sm" disabled={busy !== null} onClick={() => reclaim(engagement, milestone, idx)}>
                    {busy === key ? <><FoxSpinner /> Waiting for signature…</> : `Reclaim ${formatUsdc(milestone.amount)} USDC`}
                  </button>
                )}
              </div>
            );
          })}
        </article>
      ))}
    </section>
  );
}
