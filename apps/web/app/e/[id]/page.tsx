"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { contractIdFor, getBalance, getEngagement, type Engagement } from "@/lib/stellar/contract";
import {
  explorerAccount,
  explorerContract,
  formatUsdc,
  shortAddress,
} from "@/lib/stellar/config";
import { EngagementPill } from "@/components/StatusPill";
import { FoxLoader } from "@/components/FoxLoader";
import { MilestoneScores } from "@/components/MilestoneScores";
import { UsdcMark } from "@/components/UsdcMark";
import { useWallet } from "@/components/WalletProvider";
import { SettlementLog } from "@/components/SettlementLog";
import { ProductIcon } from "@/components/ProductIcon";

/**
 * The public engagement page.
 *
 * No wallet needed. This is the link handed to an Ambassador, a grant reviewer,
 * or anyone else who needs to check the work: every milestone, every amount,
 * every state, and the contract it all lives on — read straight from the ledger
 * rather than from a screenshot or a claim.
 */
/* `useParams`, not `use(params)`.
 *
 * Unwrapping the params promise with `use()` suspends the component, and on
 * this client component the promise never settled after hydration: the server
 * HTML stayed on screen, no effect ever ran, and no read was ever sent. The
 * page sat on "Reading the ledger" forever with nothing in the console and
 * nothing on the network to explain it. `useParams` is the client-side
 * reader for exactly this, and it returns without suspending. */
export default function EngagementPage() {
  const id = String(useParams().id ?? "");
  const validId = /^(0|[1-9]\d*)$/.test(id);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [locked, setLocked] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [repository, setRepository] = useState<string | null>(null);
  const [repositoryLoaded, setRepositoryLoaded] = useState(false);
  const { address } = useWallet();
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
    setRepository(null);
    setRepositoryLoaded(false);
    if (!validId) {
      setError("Engagement ids must be non-negative whole numbers.");
      setLoading(false);
      return;
    }
    Promise.all([
      getEngagement(BigInt(id)),
      getBalance(BigInt(id)),
      fetch(`/api/project?engagement_id=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ])
      .then(([e, b, projectBody]) => {
        setEngagement(e);
        setLocked(b);
        setRepository(typeof projectBody?.project?.repository === "string" ? projectBody.project.repository : null);
        setRepositoryLoaded(true);
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
          Read from Stellar testnet, not reported by the application.
        </p>
      </div>

      <div
        className="panel stack-s"
        style={{ borderColor: "var(--edge-bright)", background: "var(--concrete)" }}
      >
        <div className="row" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
          <ProductIcon name="github" size={22} />
          <div className="stack-s" style={{ gap: "0.25rem", minWidth: 0 }}>
            <p className="eyebrow">Source repository</p>
            {repository ? (
              <a
                href={repository}
                target="_blank"
                rel="noreferrer"
                className="badge-link"
                style={{ overflowWrap: "anywhere", fontSize: "1rem" }}
              >
                {repository} ↗
              </a>
            ) : (
              <strong>{repositoryLoaded ? "Repository metadata unavailable" : "Reading repository metadata…"}</strong>
            )}
            <p className="faint" style={{ fontSize: "0.8125rem" }}>
              The milestones below are evaluated against this repository.
            </p>
          </div>
        </div>
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
          <Party party="Builds it" address={engagement.builder} />
          <Party party="Decides payouts" address={engagement.sponsor} />
          {engagement.reviewers.map((r) => (
            <Party key={r} party="Also decides" address={r} />
          ))}
        </div>
      </div>

      {/* One row per milestone: what it is, what it is worth, where it stands,
          what you can do about it, and what the repository looks like against
          it. A separate flow strip and a full-width detail panel said the same
          things again, one milestone at a time. */}
      <MilestoneScores engagement={engagement} address={address} onChanged={() => setAttempt((n) => n + 1)} />

      <SettlementLog engagementId={engagement.id} />

      {/* The contract this engagement lives on, which is not always the one
          new engagements are created on: earlier records stayed behind on the
          previous deployment, and pointing a reviewer at the current contract
          would send them somewhere this engagement has never existed. */}
      <div className="panel stack-s">
        <p className="eyebrow">Verify it yourself</p>
        <a
          href={explorerContract(contractIdFor(engagement.id))}
          target="_blank"
          rel="noreferrer"
          className="badge-link"
        >
          Settlement contract {shortAddress(contractIdFor(engagement.id), 8, 6)} ↗
        </a>
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          Every state change here emitted a contract event, and the explorer shows each one with
          the transaction that caused it and the wallet that signed it.
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
function Figure({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel panel-tight stack-s" style={{ gap: "0.25rem" }}>
      <span className="eyebrow">{label}</span>
      <span className="amount" style={{ fontSize: "1.625rem", color: accent ?? "var(--chalk)" }}>
        {value} <span className="faint mono figure-unit"><UsdcMark size={12} /> USDC</span>
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
