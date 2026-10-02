"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ActivityEntry, ApprovalPolicy, CriteriaDocument, ReviewerAttestation } from "@sprintos/schemas";
import { contractIdFor, getEngagement, type Engagement } from "@/lib/stellar/contract";
import { explorerAccount, explorerContract, explorerTx, formatUsdc, shortAddress } from "@/lib/stellar/config";
import { tallyAttestations, type ApprovalTally } from "@/lib/attestation";
import { evidenceVersions, type EvidenceVersion } from "@/lib/evidence-versions";
import { StatusPill, EngagementPill } from "@/components/StatusPill";
import { FoxLoader } from "@/components/FoxLoader";

/**
 * The Public Proof page.
 *
 * One read-only view per engagement, no wallet needed, that ties together
 * what the rest of the app shows one piece at a time: each milestone's
 * acceptance criteria, every evidence version it has gone through (earlier
 * ones preserved, not overwritten), the advisory report and reviewer
 * attestations against each version, and the final settlement transaction.
 * Everything here is re-derived from the ledger and the activity index on
 * load — this page holds no state of its own that could drift from either.
 */

interface MilestoneProof {
  idx: number;
  title: string;
  amount: bigint;
  status: Engagement["milestones"][number]["status"];
  criteria: CriteriaDocument | null;
  versions: (EvidenceVersion & { score: number | null; recommendation: string | null; tally: ApprovalTally })[];
  settlementTx: { action: "released" | "claimed" | "refunded"; tx_hash: string; actor: string; at: string } | null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function ProofPage() {
  const id = String(useParams().id ?? "");
  const validId = /^(0|[1-9]\d*)$/.test(id);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [milestones, setMilestones] = useState<MilestoneProof[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validId) {
      setError("Engagement ids must be non-negative whole numbers.");
      return;
    }
    let cancelled = false;

    (async () => {
      let e: Engagement;
      try {
        e = await getEngagement(BigInt(id));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "That engagement could not be read.");
        return;
      }
      if (cancelled) return;
      setEngagement(e);

      const [activity, policy] = await Promise.all([
        getJson<{ entries: ActivityEntry[] }>(`/api/activity?engagement_id=${id}`),
        getJson<ApprovalPolicy>(`/api/policy?engagement_id=${id}`),
      ]);
      const entries = activity?.entries ?? [];
      const threshold = policy?.threshold ?? 1;

      const built = await Promise.all(
        e.milestones.map(async (m, idx): Promise<MilestoneProof> => {
          const criteriaDoc = await getJson<{ criteria: CriteriaDocument | null }>(
            `/api/criteria?hash=${m.criteria_hash}`,
          );
          const versions = evidenceVersions(entries, idx);
          const withReportsAndTally = await Promise.all(
            versions.map(async (v) => {
              const [report, attestation] = await Promise.all([
                getJson<{ report: { advisory_score: number; recommendation: string } | null }>(
                  `/api/advisory?engagement_id=${id}&milestone_idx=${idx}&evidence_hash=${v.evidence_hash}`,
                ),
                getJson<{ attestations: ReviewerAttestation[] }>(
                  `/api/attestation?engagement_id=${id}&milestone_idx=${idx}&evidence_hash=${v.evidence_hash}`,
                ),
              ]);
              return {
                ...v,
                score: report?.report?.advisory_score ?? null,
                recommendation: report?.report?.recommendation ?? null,
                tally: tallyAttestations(attestation?.attestations ?? [], v.evidence_hash, threshold),
              };
            }),
          );

          const settlement = entries.find(
            (entry) =>
              entry.milestone_idx === idx &&
              (entry.action === "released" || entry.action === "claimed" || entry.action === "refunded"),
          );

          return {
            idx,
            title: m.title,
            amount: m.amount,
            status: m.status,
            criteria: criteriaDoc?.criteria ?? null,
            versions: withReportsAndTally,
            settlementTx: settlement
              ? { action: settlement.action as "released" | "claimed" | "refunded", tx_hash: settlement.tx_hash, actor: settlement.actor, at: settlement.at }
              : null,
          };
        }),
      );

      if (!cancelled) setMilestones(built);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, validId]);

  if (error) {
    return (
      <main className="shell stack-l">
        <p className="notice">{error}</p>
      </main>
    );
  }
  if (!engagement || !milestones) {
    return (
      <main className="shell stack-l">
        <FoxLoader label="Reading the ledger" />
      </main>
    );
  }

  return (
    <main className="shell stack-l proof-page">
      <header className="stack-s">
        <p className="tape-label">Public Proof &middot; Engagement #{id}</p>
        <h1>Engagement #{id}</h1>
        <p>
          <EngagementPill status={engagement.status} /> &middot; settled on{" "}
          <a className="addr" href={explorerContract(contractIdFor(engagement.id))} target="_blank" rel="noreferrer">
            {shortAddress(contractIdFor(engagement.id))}
          </a>
        </p>
        <p className="data">
          Sponsor{" "}
          <a className="addr" href={explorerAccount(engagement.sponsor)} target="_blank" rel="noreferrer">
            {shortAddress(engagement.sponsor)}
          </a>{" "}
          &middot; Builder{" "}
          <a className="addr" href={explorerAccount(engagement.builder)} target="_blank" rel="noreferrer">
            {shortAddress(engagement.builder)}
          </a>{" "}
          &middot; {engagement.reviewers.length} authorized reviewer{engagement.reviewers.length === 1 ? "" : "s"}
        </p>
      </header>

      {milestones.map((m) => (
        <section key={m.idx} className="panel stack-s">
          <h2>
            {m.title} <StatusPill status={m.status} />
          </h2>
          <p className="amount">{formatUsdc(m.amount)} USDC</p>

          {m.criteria && (
            <div>
              <p className="tape-label">Acceptance criteria</p>
              <ul>
                {m.criteria.criteria.map((c) => (
                  <li key={c.id}>{c.text}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="tape-label">Evidence history</p>
            {m.versions.length === 0 && <p>No evidence submitted yet.</p>}
            {m.versions.map((v) => (
              <div key={v.evidence_hash} className="panel-tight stack-s">
                <p>
                  <strong>Version {v.version}</strong> &middot;{" "}
                  <a className="addr" href={explorerTx(v.submitted_tx_hash)} target="_blank" rel="noreferrer">
                    submitted {shortAddress(v.evidence_hash, 6, 6)}
                  </a>
                </p>
                <p>
                  {v.score !== null
                    ? `Advisory (non-binding): ${v.score}/100 · ${v.recommendation}`
                    : "No advisory report recorded for this version."}
                </p>
                <p>
                  Reviewer attestations: {v.tally.approvals.length} approve, {v.tally.holds.length} hold &middot;
                  threshold {v.tally.threshold} &middot; {v.tally.met ? "met" : "not yet met"}
                </p>
                <p>
                  {v.decision
                    ? (
                      <a className="addr" href={explorerTx(v.decision.tx_hash)} target="_blank" rel="noreferrer">
                        Human decision: {v.decision.type} by {shortAddress(v.decision.actor)}
                      </a>
                    )
                    : "Awaiting a human decision."}
                </p>
              </div>
            ))}
          </div>

          <p>
            {m.settlementTx ? (
              <a className="addr" href={explorerTx(m.settlementTx.tx_hash)} target="_blank" rel="noreferrer">
                Settlement: {m.settlementTx.action} by {shortAddress(m.settlementTx.actor)}
              </a>
            ) : (
              "Not yet settled."
            )}
          </p>
        </section>
      ))}
    </main>
  );
}
