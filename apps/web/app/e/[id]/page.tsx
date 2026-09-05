"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getBalance, getEngagement, type Engagement, type Milestone } from "@/lib/stellar/contract";
import {
  SETTLEMENT_CONTRACT_ID,
  explorerAccount,
  explorerContract,
  formatUsdc,
  shortAddress,
} from "@/lib/stellar/config";
import { EngagementPill, StatusPill } from "@/components/StatusPill";
import { FoxLoader } from "@/components/FoxLoader";
import { MilestoneFlow } from "@/components/MilestoneFlow";
import { MilestoneScores } from "@/components/MilestoneScores";
import { useWallet } from "@/components/WalletProvider";
import { ProductIcon } from "@/components/ProductIcon";
import { MilestoneCriteria, MilestoneEvidence } from "@/components/MilestoneDocuments";
import { SettlementLog } from "@/components/SettlementLog";

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
  const validId = /^(0|[1-9]\d*)$/.test(id);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [locked, setLocked] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /* Which milestone the detail panel is showing. Defaults to the first one
     still waiting on a decision, because that is what a visitor came to see. */
  const { address } = useWallet();
  const [selected, setSelected] = useState(0);
  /* Bumped by the retry button; the read effect depends on it. */
  const [attempt, setAttempt] = useState(0);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a
     manual retry counter. It is not read in here — bumping it is the whole
     point, because it is how the Retry button re-runs a load that failed. */
  useEffect(() => {
    setLoading(true);
    setEngagement(null);
    setLocked(null);
    setError(null);
    if (!validId) {
      setError("Engagement ids must be non-negative whole numbers.");
      setLoading(false);
      return;
    }
    Promise.all([getEngagement(BigInt(id)), getBalance(BigInt(id))])
      .then(([e, b]) => {
        setEngagement(e);
        setLocked(b);
        const waiting = e.milestones.findIndex((m) => m.status === "EvidenceSubmitted" || m.status === "Approved");
        setSelected(waiting >= 0 ? waiting : 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id, validId, attempt]);

  if (loading) {
    return <section className="shell" style={{ paddingBlock: "4rem" }}><FoxLoader label="Reading the ledger" /></section>;
  }
  if (!engagement) {
    return (
      <section className="shell desk-gate">
        <p className="eyebrow">Engagement #{id}</p>
        <h2>{error ? "Could not read the ledger" : "Not found"}</h2>
        <p className="lede">{error ?? `No engagement #${id} on this contract.`}</p>
        {error && (
          <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        )}
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
          Every milestone, amount and status below is read from Stellar testnet rather than
          reported by the application. The transaction index further down is the one thing the
          application keeps, and each of its rows links to the explorer so it can be checked.
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
          <Party party="Sponsor" address={engagement.sponsor} />
          <Party party="Builder" address={engagement.builder} />
          <Party party="Decides payouts" address={engagement.sponsor}
            note="the sponsor decides; the builder never can" />
          {engagement.reviewers.map((r) => (
            <Party key={r} party="Also authorised" address={r} />
          ))}
        </div>
      </div>

      <MilestoneFlow milestones={engagement.milestones} activeIndex={selected} onSelect={setSelected} />

      <MilestoneDetail
        engagementId={engagement.id}
        index={selected}
        milestone={engagement.milestones[selected]}
      />

      {/* One row per milestone, one button each. Anyone can ask — it reads a
          public repository and decides nothing, so a wallet gate would protect
          nothing and hide the question most visitors actually have. */}
      <MilestoneScores engagement={engagement} address={address} />

      <SettlementLog engagementId={engagement.id} />

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

/**
 * Everything known about one milestone, in one place.
 *
 * The old page buried the criteria hash, the evidence pointer and the dates in
 * a collapsed `details` element per milestone, so a visitor had to expand six
 * of them to answer "what was promised, what arrived, and who decided". This
 * shows one milestone fully instead.
 */
function MilestoneDetail({
  engagementId,
  index,
  milestone,
}: {
  engagementId: bigint;
  index: number;
  milestone: Milestone | undefined;
}) {
  if (!milestone) return null;

  const decisive = milestone.status === "EvidenceSubmitted" || milestone.status === "Approved";
  const overdue = milestone.status === "Pending" && Number(milestone.deadline) * 1000 < Date.now();

  return (
    <section className="mdetail" aria-live="polite">
      <header className="mdetail-head">
        <div>
          <p className="eyebrow">Milestone {String(index + 1).padStart(2, "0")}</p>
          <h3>{milestone.title}</h3>
        </div>
        <div className="mdetail-head-right">
          <StatusPill status={milestone.status} />
          <span className="amount mdetail-amount">
            {formatUsdc(milestone.amount)} <small>USDC</small>
          </span>
        </div>
      </header>

      <div className="mdetail-timeline">
        <TimelineMark
          label="Due"
          value={new Date(Number(milestone.deadline) * 1000).toLocaleDateString()}
          state={overdue ? "warn" : "idle"}
        />
        <TimelineMark
          label="Proof submitted"
          value={milestone.submitted_at > 0n ? new Date(Number(milestone.submitted_at) * 1000).toLocaleDateString() : "Not yet"}
          state={milestone.submitted_at > 0n ? "done" : "idle"}
        />
        <TimelineMark
          label="Decided"
          value={milestone.decided_at > 0n ? new Date(Number(milestone.decided_at) * 1000).toLocaleDateString() : "Not yet"}
          state={milestone.decided_at > 0n ? "done" : "idle"}
        />
      </div>

      <div className="mdetail-grid">
        <div className="mdetail-block">
          <p className="eyebrow">What was promised</p>
          <MilestoneCriteria criteriaHash={milestone.criteria_hash} />
        </div>

        <div className="mdetail-block">
          <p className="eyebrow">What arrived</p>
          <MilestoneEvidence
            evidenceHash={milestone.evidence_hash}
            evidenceUri={milestone.evidence_uri}
          />
        </div>
      </div>

      {decisive && (
        <Link href={`/review/${engagementId}/${index}`} className="btn btn-primary mdetail-action">
          <ProductIcon name="signature" size={18} /> Open the reviewer desk
        </Link>
      )}
    </section>
  );
}

function TimelineMark({ label, value, state }: { label: string; value: string; state: "idle" | "done" | "warn" }) {
  return (
    <div className={`mdetail-mark is-${state}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </div>
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

function Party({ party, address, note }: { party: string; address: string; note?: string }) {
  return (
    <div className="stack-s" style={{ gap: "0.25rem" }}>
      <span className="eyebrow">{party}</span>
      <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className="badge-link">
        {shortAddress(address, 6, 6)} ↗
      </a>
      {note && <span className="faint" style={{ fontSize: "0.75rem" }}>{note}</span>}
    </div>
  );
}
