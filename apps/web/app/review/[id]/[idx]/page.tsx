"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { AdvisoryReport } from "@sprintos/schemas/report";
import type { CriteriaDocument, EvidenceBundle } from "@sprintos/schemas/milestone";
import type { ReviewerAttestation } from "@sprintos/schemas/attestation";
import { useWallet } from "@/components/WalletProvider";
import { AdvisoryPanel } from "@/components/AdvisoryPanel";
import { StatusPill } from "@/components/StatusPill";
import { TxLink } from "@/components/TxLink";
import { FoxLoader, FoxSpinner } from "@/components/FoxLoader";
import type { ApprovalTally } from "@/lib/attestation";
import {
  approveMilestone,
  getEngagement,
  holdMilestone,
  releaseMilestone,
  canDecide as mayDecideOn,
  roleOf,
  type Engagement,
} from "@/lib/stellar/contract";
import { formatUsdc, shortAddress } from "@/lib/stellar/config";
import { documentHashInBrowser, hashesMatch } from "@/lib/document-hash";
import { reviewGate, type DocumentState } from "@/lib/review-gate";
import { EvidenceBundle as EvidenceBundleSchema } from "@sprintos/schemas/milestone";

/**
 * The reviewer desk — the screen the whole product exists to produce.
 *
 * Three columns: what was agreed, what was delivered, and what the module
 * thinks. The first two are authoritative and rendered plainly. The third is
 * dashed and grey, because it is an opinion.
 *
 * The decision bar is gated on an attestation. That gate is a UI convenience,
 * not the control — the contract independently requires the reviewer's
 * signature and would refuse anyone else regardless of what this page allows.
 */
/** The six evidence kinds, in words rather than schema identifiers. */
const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  repo: "Repository",
  commit: "Commit",
  pull_request: "Pull request",
  test_result: "Test result",
  docs: "Documentation",
  demo: "Demo",
};

function DocumentBadge({ state }: { state: DocumentState }) {
  if (state === "verified") return <span className="pill pill-approved">matches chain</span>;
  if (state === "mismatch") return <span className="pill pill-held">hash differs</span>;
  return <span className="pill pill-neutral">not available here</span>;
}

/**
 * Fetch an evidence bundle from the pointer anchored on chain and verify it.
 *
 * Returns the bundle only when it parses as an evidence bundle *and* hashes to
 * the value the contract recorded. Anything else is treated as unavailable —
 * a document that does not hash correctly is not evidence, it is a stranger's
 * JSON, and it must never reach the screen a reviewer decides from.
 */
async function recoverEvidenceFromPointer(
  uri: string | null,
  anchoredHash: string | null,
): Promise<{ bundle: EvidenceBundle | null; hash: string | null }> {
  if (!uri || !anchoredHash) return { bundle: null, hash: null };
  try {
    /* The pointer is data read off the ledger, so it can name a host that is
       slow, gone, or hostile. Recovery is a bonus path — it must never be able
       to hold up the desk, so it gets a short leash and fails quietly. */
    const response = await fetch(uri, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { bundle: null, hash: null };
    const body = await response.json();
    const candidate = (body as { evidence?: unknown }).evidence ?? body;
    const parsed = EvidenceBundleSchema.safeParse(candidate);
    if (!parsed.success) return { bundle: null, hash: null };
    const hash = await documentHashInBrowser(parsed.data);
    if (!hashesMatch(hash, anchoredHash)) return { bundle: null, hash: null };
    return { bundle: parsed.data, hash };
  } catch {
    return { bundle: null, hash: null };
  }
}

/* See the note on the engagement page: `use(params)` left this desk suspended
   on its loading state forever. */
export default function ReviewDeskPage() {
  const routeParams = useParams();
  const id = String(routeParams.id ?? "");
  const idxParam = String(routeParams.idx ?? "");
  const idx = Number(idxParam);
  const validId = /^(0|[1-9]\d*)$/.test(id);
  const validIdx = /^\d+$/.test(idxParam) && Number.isSafeInteger(idx);
  const { address, connect } = useWallet();

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [criteria, setCriteria] = useState<CriteriaDocument | null>(null);
  const [criteriaHash, setCriteriaHash] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceBundle | null>(null);
  const [evidenceHash, setEvidenceHash] = useState<string | null>(null);
  /* Where the bundle came from. "pointer" means this deployment did not hold
     it and it was recovered from the URI the contract anchored, then verified
     against the anchored hash before being shown. */
  const [evidenceSource, setEvidenceSource] = useState<"store" | "pointer" | null>(null);
  const [report, setReport] = useState<AdvisoryReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [advisoryError, setAdvisoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ hash: string; action: string } | null>(null);

  /* Multi-reviewer threshold (app-layer, not the contract — see
     lib/attestation.ts). Scoped to the exact evidence version on screen, so
     a resubmission starts a fresh tally rather than inheriting one from the
     version it superseded. */
  const [threshold, setThreshold] = useState(1);
  const [attestations, setAttestations] = useState<ReviewerAttestation[]>([]);
  const [tally, setTally] = useState<ApprovalTally | null>(null);
  const [attestComment, setAttestComment] = useState("");
  const [criterionFeedback, setCriterionFeedback] = useState<Record<string, string>>({});
  const [attestBusy, setAttestBusy] = useState<"approve" | "hold" | null>(null);
  const [attestError, setAttestError] = useState<string | null>(null);

  /* The connected wallet's own Free/Plus standing — never an input to any
     decision, only to how hard the advisory module is allowed to think on
     this wallet's behalf. */
  const [entitlement, setEntitlement] = useState<{ plan: "free" | "plus"; remaining: { standard: number; deep: number } } | null>(null);
  const [reviewKind, setReviewKind] = useState<"standard" | "deep">("standard");

  const refresh = useCallback(async () => {
    if (!validId) throw new Error("Engagement ids must be non-negative whole numbers.");
    const e = await getEngagement(BigInt(id));
    setEngagement(e);
  }, [id, validId]);

  const loadAttestations = useCallback(async (evidenceHashOnChain: string) => {
    try {
      const [policyBody, attestationBody] = await Promise.all([
        fetch(`/api/policy?engagement_id=${id}`).then((r) => r.json()),
        fetch(`/api/attestation?engagement_id=${id}&milestone_idx=${idx}&evidence_hash=${evidenceHashOnChain}`).then((r) => r.json()),
      ]);
      setThreshold(policyBody.threshold ?? 1);
      setAttestations(attestationBody.attestations ?? []);
      setTally(attestationBody.tally ?? null);
    } catch {
      /* Non-critical: the real Approve/Release step still works through the
         contract regardless of whether this read succeeded. */
    }
  }, [id, idx]);

  useEffect(() => {
    if (!address) {
      setEntitlement(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/account?address=${address}`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setEntitlement(body.entitlement ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [address]);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `refresh` is not
     called in here, but it closes over the milestone this desk is reading. A
     new `refresh` means a different milestone, and the documents on screen
     have to be fetched again rather than left describing the last one. */
  useEffect(() => {
    setLoading(true);
    setEngagement(null);
    setCriteria(null);
    setCriteriaHash(null);
    setEvidence(null);
    setEvidenceHash(null);
    setEvidenceSource(null);
    setReport(null);
    setError(null);
    setThreshold(1);
    setAttestations([]);
    setTally(null);
    setAttestComment("");
    setCriterionFeedback({});
    setAttestError(null);
    if (!validId || !validIdx) {
      setError(!validId ? "Engagement ids must be non-negative whole numbers." : "Milestone indexes must be non-negative whole numbers.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const current = await getEngagement(BigInt(id));
        setEngagement(current);
        const milestone = current.milestones[idx];
        if (!milestone) throw new Error(`Engagement #${id} has no milestone ${idx + 1}.`);
        const [c, ev, r] = await Promise.all([
          fetch(`/api/criteria?hash=${encodeURIComponent(milestone.criteria_hash)}`).then((r) => r.json()),
          milestone.evidence_hash
            ? fetch(`/api/evidence?hash=${encodeURIComponent(milestone.evidence_hash)}`).then((r) => r.json())
            : Promise.resolve({ evidence: null, hash: null }),
          milestone.evidence_hash
            ? fetch(`/api/advisory?engagement_id=${id}&milestone_idx=${idx}&evidence_hash=${encodeURIComponent(milestone.evidence_hash)}`).then((r) => r.json())
            : Promise.resolve({ report: null }),
        ]);
        setCriteria(c.criteria ?? null);
        setCriteriaHash(c.hash ?? null);
        setReport(r.report ?? null);

        if (ev.evidence) {
          setEvidence(ev.evidence);
          setEvidenceHash(ev.hash ?? null);
          setEvidenceSource("store");
        } else {
          /* This deployment does not hold the bundle. The contract anchored a
             public pointer to it precisely so it can still be read, and the
             anchored hash is what makes the fetched copy trustworthy — a
             document that hashes to the on-chain value is the document that
             was submitted, wherever it was served from. */
          const recovered = await recoverEvidenceFromPointer(
            milestone.evidence_uri,
            milestone.evidence_hash,
          );
          setEvidence(recovered.bundle);
          setEvidenceHash(recovered.hash);
          setEvidenceSource(recovered.bundle ? "pointer" : null);
        }

        if (milestone.evidence_hash) await loadAttestations(milestone.evidence_hash);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, idx, refresh, validId, validIdx, loadAttestations]);

  async function generate() {
    const milestone = engagement?.milestones[idx];
    if (!milestone?.evidence_hash) {
      setAdvisoryError("No evidence hash is anchored on chain for this milestone.");
      return;
    }
    setAdvisoryLoading(true);
    setAdvisoryError(null);
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engagement_id: id,
          milestone_idx: idx,
          criteria_hash: milestone.criteria_hash,
          evidence_hash: milestone.evidence_hash,
          ...(address ? { address } : {}),
          kind: reviewKind,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Not a failure of the page. The reviewer can still decide, and the
        // message says so rather than blocking the screen behind an error.
        setAdvisoryError(body.error ?? "The report could not be produced. You can still decide without it.");
        if (body.entitlement) setEntitlement(body.entitlement);
        return;
      }
      setReport(body.report);
      if (body.entitlement) setEntitlement(body.entitlement);
    } catch {
      setAdvisoryError("The advisory service could not be reached. You can still decide without it.");
    } finally {
      setAdvisoryLoading(false);
    }
  }

  async function submitAttestation(decision: "approve" | "hold") {
    const milestone = engagement?.milestones[idx];
    if (!address || !milestone?.evidence_hash) return;
    setAttestBusy(decision);
    setAttestError(null);
    try {
      const feedback = Object.entries(criterionFeedback)
        .filter(([, comment]) => comment.trim().length > 0)
        .map(([id_, comment]) => ({ id: id_, comment: comment.trim() }));
      const res = await fetch("/api/attestation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engagement_id: id,
          milestone_idx: idx,
          evidence_hash: milestone.evidence_hash,
          reviewer: address,
          decision,
          ...(attestComment.trim() ? { comment: attestComment.trim() } : {}),
          criteria_feedback: feedback,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAttestError(body.error ?? "The attestation could not be recorded.");
        return;
      }
      setAttestations(body.attestations ?? []);
      setTally(body.tally ?? null);
    } catch {
      setAttestError("The attestation could not be reached. Your own Approve/Release signature still works regardless.");
    } finally {
      setAttestBusy(null);
    }
  }

  async function act(action: "approve" | "hold" | "release") {
    if (!address) return;
    setError(null);
    setBusy(action);
    try {
      const fn = action === "approve" ? approveMilestone : action === "hold" ? holdMilestone : releaseMilestone;
      const tx = await fn(address, BigInt(id), idx);
      setLastTx({ hash: tx.hash, action });
      setAttested(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <section className="shell" style={{ paddingBlock: "4rem" }}><FoxLoader label="Preparing the review desk" /></section>;
  }
  if (!engagement) {
    return (
      <section className="shell" style={{ paddingBlock: "4rem" }}>
        <div className="panel stack">
          <h2>Not found</h2>
          <p className="muted">{error ?? `No engagement #${id} on this contract.`}</p>
          <div><Link href="/review" className="btn btn-ghost">Back to the desk</Link></div>
        </div>
      </section>
    );
  }

  const milestone = engagement.milestones[idx];
  if (!milestone) {
    return <section className="shell" style={{ paddingBlock: "4rem" }}><p className="notice">Engagement #{id} has no milestone {idx + 1}.</p></section>;
  }

  const role = roleOf(engagement, address);
  /* Ask the same question the contract asks. Checking for the "reviewer" role
     locked the sponsor out of their own engagement — they decide payouts in
     this contract, and the page was telling them they could not while naming
     them as the one who does. */
  const isReviewer = mayDecideOn(engagement, address);
  const canDecide = milestone.status === "EvidenceSubmitted";
  const canRelease = milestone.status === "Approved";
  /* A real comparison: the hash of the document on screen against the hash the
     contract anchored. "Absent" and "mismatch" are deliberately separate — one
     means this deployment cannot show the document, the other means the
     document it can show is not the one that was funded. Both block a
     decision, but only the second is a red flag, and telling a reviewer their
     hashes "differ" when the file is simply missing sent them looking for the
     wrong problem. */
  const gate = reviewGate({
    criteria,
    criteriaHash,
    anchoredCriteriaHash: milestone.criteria_hash,
    evidence,
    evidenceHash,
    anchoredEvidenceHash: milestone.evidence_hash,
  });
  const { criteria: criteriaState, evidence: evidenceState, decisionsEnabled: documentsVerified } = gate;

  /* The app-layer threshold from lib/attestation.ts: the contract's own
     Approve still takes exactly one reviewer signature, but this page will
     not offer that button until enough distinct reviewers attested to it
     here. 1 (the contract's own default) is always already met. */
  const needsMoreAttestations = threshold > 1 && !(tally?.met ?? false);

  return (
    <section className="shell stack-l" style={{ paddingBlock: "2.5rem" }}>
      <div className="stack-s">
        <div className="row" style={{ gap: "0.75rem" }}>
          <Link href="/review" className="badge-link">← Desk</Link>
          <span className="faint mono" style={{ fontSize: "0.75rem" }}>
            Engagement #{String(engagement.id)} · milestone {idx + 1} of {engagement.milestones.length}
          </span>
          <StatusPill status={milestone.status} />
        </div>
        <h2>{milestone.title}</h2>
        <div className="row" style={{ gap: "1.25rem" }}>
          <span className="amount" style={{ fontSize: "1.75rem" }}>
            {formatUsdc(milestone.amount)} <span className="faint mono" style={{ fontSize: "0.75rem" }}>USDC</span>
          </span>
          <span className="faint mono" style={{ fontSize: "0.8125rem" }}>
            due {new Date(Number(milestone.deadline) * 1000).toLocaleDateString()}
          </span>
          <span className="faint mono" style={{ fontSize: "0.8125rem" }}>
            builder {shortAddress(engagement.builder)}
          </span>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}

      {/* What was agreed and what arrived, side by side — they are read against
          each other. The report goes underneath at full width: as a third column
          it was a narrow strip of prose several screens tall, and a reviewer had
          to scroll past the decision to finish reading it. */}
      <div className="desk-documents">
        {/* ── what was agreed ───────────────────────────────────────── */}
        <div className="panel stack-s">
          <div className="spread">
            <p className="eyebrow">Acceptance criteria</p>
            <DocumentBadge state={criteriaState} />
          </div>
          {criteria ? (
            <>
              {criteria.outcome && (
                <div className="criteria-outcome">
                  <p className="group-label">Outcome</p>
                  <p style={{ margin: 0, fontSize: "0.9375rem" }}>{criteria.outcome}</p>
                </div>
              )}
              <ol className="stack-s" style={{ paddingLeft: "1.125rem", margin: 0 }}>
                {criteria.criteria.map((c) => (
                  <li key={c.id} style={{ fontSize: "0.9375rem" }}>{c.text}</li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: "0.9375rem" }}>
                This deployment does not hold the criteria document, so there is nothing to check
                the evidence against. It is stored by content hash, so restoring the exact file the
                sponsor anchored is enough to unblock this decision.
              </p>
              <p className="criteria-hash"><code>{milestone.criteria_hash}</code></p>
            </>
          )}
          {criteriaState === "mismatch" && (
            <p className="notice">
              These criteria do not hash to what the ledger recorded. Do not decide on them — ask
              the sponsor which version was funded.
            </p>
          )}
        </div>

        {/* ── what was delivered ────────────────────────────────────── */}
        <div className="panel stack-s">
          <div className="spread">
            <p className="eyebrow">Submitted evidence</p>
            <DocumentBadge state={evidenceState} />
          </div>
          {evidence ? (
            <>
              {/* The builder's own label, or the file they pointed at. Cutting
                  the URL at a fixed width left every link reading
                  "…/blob/main/contr", which names nothing and cannot be
                  followed by eye — on the one page where a reviewer is
                  checking exactly which file was submitted. */}
              <ul className="evidence-links">
                {evidence.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noreferrer" title={l.url}>
                      {l.label ?? l.url.split("/").filter(Boolean).pop() ?? l.url} ↗
                    </a>
                    <small>{EVIDENCE_TYPE_LABEL[l.type] ?? l.type}</small>
                  </li>
                ))}
              </ul>
              {evidence.note && (
                <p style={{ fontSize: "0.875rem", color: "var(--chalk-dim)", borderTop: "1px solid var(--edge)", paddingTop: "0.625rem" }}>
                  {evidence.note}
                </p>
              )}
              <span className="faint mono" style={{ fontSize: "0.6875rem" }}>
                submitted {new Date(evidence.submitted_at).toLocaleString()}
              </span>
            </>
          ) : milestone.evidence_uri ? (
            <p className="muted" style={{ fontSize: "0.9375rem" }}>
              This deployment does not hold the bundle, and the pointer the ledger records could
              not be fetched and verified against the anchored hash:{" "}
              <a href={milestone.evidence_uri} target="_blank" rel="noreferrer" className="badge-link">{milestone.evidence_uri} ↗</a>
            </p>
          ) : (
            <p className="muted" style={{ fontSize: "0.9375rem" }}>Nothing submitted yet.</p>
          )}
          {evidenceSource === "pointer" && (
            <p className="faint" style={{ fontSize: "0.75rem" }}>
              Recovered from the pointer on chain and verified against the anchored hash.
            </p>
          )}
          {evidenceState === "mismatch" && (
            <p className="notice">
              This evidence bundle does not match the hash recorded on chain. Do not decide on it.
            </p>
          )}
        </div>

      </div>

      {/* ── what the module thinks ────────────────────────────────────── */}
      {address && entitlement && (
        <div className="row" style={{ gap: "1rem", alignItems: "center" }}>
          <label className="row" style={{ gap: "0.375rem", fontSize: "0.8125rem" }}>
            <input
              type="checkbox"
              checked={reviewKind === "deep"}
              disabled={entitlement.plan !== "plus"}
              onChange={(e) => setReviewKind(e.target.checked ? "deep" : "standard")}
            />
            <span>Deep Review{entitlement.plan !== "plus" ? " (Plus only)" : ""}</span>
          </label>
          <span className="faint mono" style={{ fontSize: "0.75rem" }}>
            {entitlement.plan === "plus" ? "Plus" : "Free"} ·{" "}
            {reviewKind === "deep" ? `${entitlement.remaining.deep} deep reviews left` : `${entitlement.remaining.standard} standard reviews left`}
          </span>
        </div>
      )}
      <AdvisoryPanel report={report} loading={advisoryLoading} error={advisoryError} onGenerate={generate} />

      {/* ── reviewer sign-off: the app-layer threshold, not the contract's
          own single signature (see lib/attestation.ts) ────────────────── */}
      {isReviewer && canDecide && milestone.evidence_hash && (
        <div className="panel stack-s">
          <div className="spread">
            <p className="eyebrow">Reviewer sign-off</p>
            <span className="faint mono" style={{ fontSize: "0.75rem" }}>
              {tally ? `${tally.approvals.length} of ${threshold} reviewer${threshold === 1 ? "" : "s"} approved` : `threshold ${threshold}`}
            </span>
          </div>

          {threshold > 1 && (
            <p className="muted" style={{ fontSize: "0.875rem" }}>
              This engagement requires {threshold} distinct reviewers to attest before the on-chain
              Approve step below is offered. No advisory score ever counts toward this — only reviewer
              wallets attesting here do.
            </p>
          )}

          {attestations.length > 0 && (
            <ul className="stack-s" style={{ fontSize: "0.8125rem", margin: 0, paddingLeft: "1.125rem" }}>
              {attestations.map((a) => (
                <li key={a.reviewer}>
                  <span className="mono">{shortAddress(a.reviewer)}</span> — {a.decision}
                  {a.comment ? `: "${a.comment}"` : ""}
                </li>
              ))}
            </ul>
          )}

          {criteria && criteria.criteria.length > 0 && (
            <div className="stack-s">
              <p className="group-label">Criterion feedback (optional)</p>
              {criteria.criteria.map((c) => (
                <label key={c.id} className="field">
                  <span style={{ fontSize: "0.8125rem" }}>{c.text}</span>
                  <input
                    type="text"
                    maxLength={500}
                    value={criterionFeedback[c.id] ?? ""}
                    onChange={(e) => setCriterionFeedback((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="Add a note on this criterion…"
                  />
                </label>
              ))}
            </div>
          )}

          <label className="field">
            <span style={{ fontSize: "0.8125rem" }}>Overall comment (optional)</span>
            <input
              type="text"
              maxLength={1000}
              value={attestComment}
              onChange={(e) => setAttestComment(e.target.value)}
            />
          </label>

          {attestError && <p className="notice">{attestError}</p>}

          <div className="row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!address || attestBusy !== null}
              onClick={() => submitAttestation("approve")}
            >
              {attestBusy === "approve" ? <><FoxSpinner /> Recording…</> : "Attest: I approve"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!address || attestBusy !== null}
              onClick={() => submitAttestation("hold")}
            >
              {attestBusy === "hold" ? <><FoxSpinner /> Recording…</> : "Attest: I'd hold"}
            </button>
          </div>

          <p className="faint" style={{ fontSize: "0.75rem" }}>
            Attesting here only decides when the real Approve/Release step below is offered. The
            contract still requires your own wallet signature on that step regardless.
          </p>
        </div>
      )}

      {/* ── the decision ─────────────────────────────────────────────── */}
      <div className="panel panel-marked stack">
        <div className="spread">
          <div className="stack-s" style={{ gap: "0.25rem" }}>
            <p className="eyebrow" style={{ color: "var(--orange-lo)" }}>Human decision · binding</p>
            <h3>Your call</h3>
          </div>
          {!address && <button type="button" className="btn btn-primary btn-sm" onClick={connect}>Connect wallet</button>}
        </div>

        {address && !isReviewer && (
          <p className="notice">
            This wallet is the {role} on this engagement and cannot decide payouts.{" "}
            <span className="mono">{shortAddress(engagement.sponsor)}</span> decides, along with
            any wallet they authorised. The contract enforces that independently of this page.
          </p>
        )}

        {isReviewer && (canDecide || canRelease) && (
          <>
            {!documentsVerified && (
              <p className="notice">
                {criteriaState === "mismatch" || evidenceState === "mismatch"
                  ? "A document on this page does not hash to what the ledger recorded. Deciding is blocked until that is resolved — the version on screen is not the version that was funded."
                  : "A document behind this milestone is not available on this deployment, so nothing can be checked against the hashes on chain. Deciding is blocked until it is restored."}
              </p>
            )}
            <label className="attest">
              <input
                type="checkbox"
                checked={attested}
                disabled={!documentsVerified}
                onChange={(e) => setAttested(e.target.checked)}
              />
              <span>
                I read the evidence against the criteria myself. Any advisory report on this page is
                an aid, and my decision is my own.
              </span>
            </label>

            <div className="row">
              {canDecide && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!documentsVerified || !attested || busy !== null || needsMoreAttestations}
                    onClick={() => act("approve")}
                  >
                    {busy === "approve" ? <><FoxSpinner /> Waiting for signature…</> : "Sign: approve"}
                  </button>
                  <button type="button" className="btn btn-hold" disabled={!documentsVerified || !attested || busy !== null} onClick={() => act("hold")}>
                    {busy === "hold" ? <><FoxSpinner /> Waiting for signature…</> : "Sign: hold for revision"}
                  </button>
                </>
              )}
              {canRelease && (
                <button type="button" className="btn btn-primary" disabled={!documentsVerified || !attested || busy !== null} onClick={() => act("release")}>
                  {busy === "release" ? <><FoxSpinner /> Waiting for signature…</> : `Sign: release ${formatUsdc(milestone.amount)} USDC`}
                </button>
              )}
            </div>

            {canDecide && needsMoreAttestations && (
              <p className="notice">
                {tally?.approvals.length ?? 0} of {threshold} reviewers have attested approval above.
                The Approve signature opens once enough have.
              </p>
            )}

            <p className="faint" style={{ fontSize: "0.8125rem" }}>
              {canRelease
                ? "Approval is recorded. Releasing is a separate signature, so the judgement and the payment stay two distinct acts."
                : "Approving records your judgement. Payment is a second signature after that."}
            </p>
          </>
        )}

        {isReviewer && !canDecide && !canRelease && (
          <p className="muted" style={{ fontSize: "0.9375rem" }}>
            Nothing to decide right now — this milestone is {milestone.status.toLowerCase()}.
          </p>
        )}

        {lastTx && (
          <div className="stack-s">
            <p className="notice notice-ok">
              {lastTx.action === "approve"
                ? "Approval recorded. Payment still needs a separate release signature."
                : lastTx.action === "hold"
                  ? "Milestone held for revision."
                  : "Payment released to the builder."}
            </p>
            <TxLink hash={lastTx.hash} />
          </div>
        )}
      </div>
    </section>
  );
}
