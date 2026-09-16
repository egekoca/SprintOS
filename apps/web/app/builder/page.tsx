"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import {
  claimApprovedMilestone,
  listEngagements,
  submitEvidence,
  type Engagement,
} from "@/lib/stellar/contract";
import { BUILDER_CLAIM_ENABLED, formatUsdc } from "@/lib/stellar/config";
import { StatusPill } from "@/components/StatusPill";
import { TxLink } from "@/components/TxLink";
import { FoxLoader, FoxSpinner } from "@/components/FoxLoader";
import { MilestoneFlow } from "@/components/MilestoneFlow";
import { MilestoneCriteria } from "@/components/MilestoneDocuments";
import { ProductIcon } from "@/components/ProductIcon";
import { WalletGate } from "@/components/WalletGate";

/**
 * The builder's desk.
 *
 * One engagement at a time, read as the same milestone track the sponsor and
 * the reviewer see, with the acceptance criteria for the selected milestone in
 * full. The previous version listed milestones flat and showed only a hash, so
 * a builder was asked to prove a milestone without being told what it required.
 */

export default function BuilderPage() {
  const { address } = useWallet();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [engagementIndex, setEngagementIndex] = useState(0);
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; action: "submit" | "claim" } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(async () => {
    setEngagements(await listEngagements());
  }, []);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a
     manual retry counter. It is not read in here — bumping it is the whole
     point, because it is how the Retry button re-runs a load that failed. */
  useEffect(() => {
    setLoading(true);
    setError(null);
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [refresh, attempt]);

  const mine = useMemo(
    () => engagements.filter((engagement) => engagement.builder === address),
    [engagements, address],
  );
  const engagement = mine[engagementIndex] ?? mine[0] ?? null;
  const milestone = engagement?.milestones[milestoneIndex] ?? null;

  /* Open on whatever is actually actionable, so the desk lands on the work
     rather than always on milestone one. */
  /* biome-ignore lint/correctness/useExhaustiveDependencies: `address` is not
     read in here. It is listed because switching wallet must reset the desk —
     leaving the previous builder's milestone selected would show one person's
     work under another person's account. */
  useEffect(() => {
    setEngagementIndex(0);
    setMilestoneIndex(0);
    setDone(null);
  }, [address]);

  useEffect(() => {
    const target = engagement?.milestones.findIndex(
      (item) => item.status === "Pending" || item.status === "Held" || item.status === "Approved",
    );
    if (target !== undefined && target >= 0) setMilestoneIndex(target);
  }, [engagement]);

  function selectMilestone(index: number) {
    setMilestoneIndex(index);
    setError(null);
    setDone(null);
  }

  async function handleSubmit() {
    if (!address || !engagement || !milestone) return;
    setError(null);
    setBusy(true);
    try {
      const projectResponse = await fetch(`/api/project?engagement_id=${engagement.id}`);
      const projectBody = (await projectResponse.json()) as { project?: { repository?: string }; error?: string };
      if (!projectResponse.ok || !projectBody.project?.repository) {
        throw new Error(projectBody.error ?? "This project has no repository attached.");
      }

      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engagement_id: String(engagement.id),
          milestone_idx: milestoneIndex,
          criteria_hash: milestone.criteria_hash,
          repository: projectBody.project.repository,
        }),
      });
      const body = (await response.json()) as { evidence_hash?: string; evidence_uri?: string; error?: string };
      if (!response.ok || !body.evidence_hash || !body.evidence_uri) {
        throw new Error(body.error ?? "The repository could not be inspected.");
      }

      const tx = await submitEvidence(address, engagement.id, milestoneIndex, body.evidence_hash, body.evidence_uri);
      setDone({ hash: tx.hash, action: "submit" });
      try {
        await refresh();
      } catch {
        setError("Evidence was recorded, but the milestone list could not refresh. Reload to see its new status.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleClaim() {
    if (!address || !engagement) return;
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const tx = await claimApprovedMilestone(address, engagement.id, milestoneIndex);
      setDone({ hash: tx.hash, action: "claim" });
      try {
        await refresh();
      } catch {
        setError("Payment was claimed, but the milestone list could not refresh. Reload to see its new status.");
      }
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : String(claimError));
    } finally {
      setBusy(false);
    }
  }

  if (!address) {
    return (
      <WalletGate eyebrow="Builder" title="Show your work">
        Connect the wallet a sponsor assigned as builder. Your milestones, their acceptance
        criteria and the evidence form all live here.
      </WalletGate>
    );
  }

  const canSubmit = milestone?.status === "Pending" || milestone?.status === "Held";
  const canClaim = milestone?.status === "Approved" && BUILDER_CLAIM_ENABLED;

  return (
    <section className="shell desk">
      <header className="desk-head">
        <div>
          <p className="eyebrow">Builder</p>
          <h2>Show your work</h2>
        </div>
        {mine.length > 1 && (
          <label className="desk-switch">
            <span>Engagement</span>
            <select
              value={engagementIndex}
              onChange={(event) => {
                setEngagementIndex(Number(event.target.value));
                selectMilestone(0);
              }}
            >
              {mine.map((item, index) => (
                <option value={index} key={String(item.id)}>
                  #{String(item.id)} · {formatUsdc(item.total_amount)} USDC
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {error && (
        <div className="panel row" style={{ justifyContent: "space-between" }}>
          <p className="muted">{error}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {done && (
        <div className="stack-s">
          <p className="notice notice-ok">
            {done.action === "claim" ? "Approved payment claimed." : "Evidence recorded on chain."}
          </p>
          <TxLink hash={done.hash} />
        </div>
      )}

      {loading && <FoxLoader label="Reading the ledger" />}

      {!loading && !error && mine.length === 0 && (
        <div className="panel">
          <p className="muted">
            No engagements name this wallet as builder yet. Ask your sponsor to create one with
            your address, or check that you connected the right wallet.
          </p>
        </div>
      )}

      {engagement && milestone && (
        <>
          <MilestoneFlow
            milestones={engagement.milestones}
            activeIndex={milestoneIndex}
            onSelect={selectMilestone}
          />

          <section className="mdetail">
            <header className="mdetail-head">
              <div>
                <p className="eyebrow">Milestone {String(milestoneIndex + 1).padStart(2, "0")}</p>
                <h3>{milestone.title}</h3>
              </div>
              <div className="mdetail-head-right">
                <StatusPill status={milestone.status} />
                <span className="amount mdetail-amount">
                  {formatUsdc(milestone.amount)} <small>USDC</small>
                </span>
              </div>
            </header>

            <div className="mdetail-block">
              <p className="eyebrow">
                Deliver all of this · due {new Date(Number(milestone.deadline) * 1000).toLocaleDateString()}
              </p>
              <MilestoneCriteria criteriaHash={milestone.criteria_hash} />
            </div>

            {milestone.status === "Held" && (
              <p className="notice" style={{ borderLeftColor: "var(--st-held)" }}>
                The reviewer put this milestone on hold. Address what they flagged and submit again.
              </p>
            )}

            {canSubmit && (
              <div className="evidence-form">
                <p className="muted" style={{ margin: 0 }}>
                  SprintOS will read the repository already attached to this project, collect the
                  relevant files and prepare the evidence automatically.
                </p>

                <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
                  {busy ? <><FoxSpinner /> Reading repository…</> : <><ProductIcon name="signature" size={18} /> Scan repository and sign</>}
                </button>
              </div>
            )}

            {canClaim && (
              <button type="button" className="btn btn-primary mdetail-action" disabled={busy} onClick={handleClaim}>
                {busy ? <><FoxSpinner /> Waiting for signature…</> : `Claim ${formatUsdc(milestone.amount)} USDC`}
              </button>
            )}

            {!canSubmit && !canClaim && (
              <p className="mdetail-note">
                Nothing to do on this milestone right now. Pick another on the track above.
              </p>
            )}
          </section>

          <p className="desk-foot">
            <Link href={`/e/${engagement.id}`} className="badge-link">
              Public page for engagement #{String(engagement.id)} →
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
