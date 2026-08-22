"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getBalance, getEngagement, type Engagement } from "@/lib/stellar/contract";
import {
  SETTLEMENT_CONTRACT_ID,
  explorerAccount,
  explorerContract,
  formatUsdc,
  shortAddress,
} from "@/lib/stellar/config";
import { EngagementPill, StatusPill } from "@/components/StatusPill";

/**
 * The public engagement page.
 *
 * No wallet needed. This is the link handed to an Ambassador, a grant reviewer,
 * or anyone else who needs to check the work: every milestone, every amount,
 * every state, and the contract it all lives on — read straight from the ledger
 * rather than from a screenshot or a claim.
 */
export default function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [locked, setLocked] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getEngagement(BigInt(id)), getBalance(BigInt(id))])
      .then(([e, b]) => { setEngagement(e); setLocked(b); })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <section className="shell" style={{ paddingBlock: "4rem" }}><p className="muted">Reading the ledger…</p></section>;
  }
  if (!engagement) {
    return (
      <section className="shell" style={{ paddingBlock: "4rem" }}>
        <div className="panel stack">
          <h2>Not found</h2>
          <p className="muted">{error ?? `No engagement #${id} on this contract.`}</p>
        </div>
      </section>
    );
  }

  const paid = engagement.milestones
    .filter((m) => m.status === "Released")
    .reduce((sum, m) => sum + m.amount, 0n);
  const reclaimed = engagement.milestones
    .filter((m) => m.status === "Refunded")
    .reduce((sum, m) => sum + m.amount, 0n);

  return (
    <section className="shell stack-l" style={{ paddingBlock: "3rem" }}>
      <div className="stack-s">
        <div className="row">
          <span className="tape-label">Public record</span>
          <EngagementPill status={engagement.status} />
        </div>
        <h2>Engagement #{String(engagement.id)}</h2>
        <p className="lede">
          Everything below is read from Stellar testnet. Nothing here is reported by the
          application — it is the ledger's own account of what happened.
        </p>
      </div>

      <div className="grid-3">
        <Figure label="Committed" value={formatUsdc(engagement.total_amount)} />
        <Figure label="Paid to builder" value={formatUsdc(paid)} accent="var(--st-released)" />
        <Figure label="Reclaimed by sponsor" value={formatUsdc(reclaimed)} accent="var(--st-refunded)" />
        <Figure label="Still in escrow" value={locked !== null ? formatUsdc(locked) : "—"} />
      </div>

      <div className="panel stack-s">
        <p className="eyebrow">Parties</p>
        <div className="grid-3">
          <Party role="Sponsor" address={engagement.sponsor} />
          <Party role="Builder" address={engagement.builder} />
          <Party role="Reviewer" address={engagement.reviewer} note="the only address that can approve; reviewer releases or builder claims afterward" />
        </div>
      </div>

      <div className="stack">
        <p className="eyebrow">Milestones</p>
        {engagement.milestones.map((m, idx) => (
          <div key={idx} className="panel stack-s">
            <div className="spread">
              <div className="row" style={{ gap: "0.75rem" }}>
                <span className="stencil-num" style={{ fontSize: "1.5rem" }}>{String(idx + 1).padStart(2, "0")}</span>
                <strong style={{ fontSize: "1.0625rem" }}>{m.title}</strong>
              </div>
              <div className="row">
                <StatusPill status={m.status} />
                <span className="amount" style={{ fontSize: "1.25rem" }}>
                  {formatUsdc(m.amount)} <span className="faint mono" style={{ fontSize: "0.6875rem" }}>USDC</span>
                </span>
              </div>
            </div>

            <div className="row" style={{ gap: "1.25rem", fontSize: "0.8125rem" }}>
              <span className="faint mono">due {new Date(Number(m.deadline) * 1000).toLocaleDateString()}</span>
              {m.submitted_at > 0n && (
                <span className="faint mono">submitted {new Date(Number(m.submitted_at) * 1000).toLocaleDateString()}</span>
              )}
              {m.decided_at > 0n && (
                <span className="faint mono">decided {new Date(Number(m.decided_at) * 1000).toLocaleDateString()}</span>
              )}
            </div>

            <details>
              <summary style={{ cursor: "pointer", fontSize: "0.8125rem", color: "var(--chalk-dim)" }}>
                Hashes anchored on chain
              </summary>
              <div className="stack-s" style={{ marginTop: "0.625rem" }}>
                <Hash label="Acceptance criteria" value={m.criteria_hash} />
                <Hash label="Evidence bundle" value={m.evidence_hash} />
                {m.evidence_uri && (
                  <div className="stack-s" style={{ gap: "0.125rem" }}>
                    <span className="eyebrow">Evidence pointer</span>
                    <a href={m.evidence_uri} target="_blank" rel="noreferrer" className="badge-link">{m.evidence_uri} ↗</a>
                  </div>
                )}
              </div>
            </details>

            {(m.status === "EvidenceSubmitted" || m.status === "Approved") && (
              <div><Link href={`/review/${engagement.id}/${idx}`} className="badge-link">Open in the reviewer desk →</Link></div>
            )}
          </div>
        ))}
      </div>

      <div className="panel stack-s">
        <p className="eyebrow">Verify it yourself</p>
        <a href={explorerContract(SETTLEMENT_CONTRACT_ID)} target="_blank" rel="noreferrer" className="badge-link">
          Settlement contract {shortAddress(SETTLEMENT_CONTRACT_ID, 8, 6)} ↗
        </a>
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          Every state change on this page emitted a contract event. The explorer shows them in
          order, with the transaction that caused each one and the wallet that signed it.
        </p>
      </div>
    </section>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel panel-tight stack-s" style={{ gap: "0.25rem" }}>
      <span className="eyebrow">{label}</span>
      <span className="amount" style={{ fontSize: "1.625rem", color: accent ?? "var(--chalk)" }}>
        {value} <span className="faint mono" style={{ fontSize: "0.6875rem" }}>USDC</span>
      </span>
    </div>
  );
}

function Party({ role, address, note }: { role: string; address: string; note?: string }) {
  return (
    <div className="stack-s" style={{ gap: "0.25rem" }}>
      <span className="eyebrow">{role}</span>
      <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className="badge-link">
        {shortAddress(address, 6, 6)} ↗
      </a>
      {note && <span className="faint" style={{ fontSize: "0.75rem" }}>{note}</span>}
    </div>
  );
}

function Hash({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="stack-s" style={{ gap: "0.125rem" }}>
      <span className="eyebrow">{label}</span>
      <code className="mono" style={{ fontSize: "0.6875rem", color: "var(--chalk-faint)", wordBreak: "break-all" }}>
        {value ?? "not submitted"}
      </code>
    </div>
  );
}
