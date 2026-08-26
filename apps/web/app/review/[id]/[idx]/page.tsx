"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AdvisoryReport } from "@sprintos/schemas/report";
import type { CriteriaDocument, EvidenceBundle } from "@sprintos/schemas/milestone";
import { useWallet } from "@/components/WalletProvider";
import { AdvisoryPanel } from "@/components/AdvisoryPanel";
import { StatusPill } from "@/components/StatusPill";
import { TxLink } from "@/components/TxLink";
import { FoxLoader, FoxSpinner } from "@/components/FoxLoader";
import {
  approveMilestone,
  getEngagement,
  holdMilestone,
  releaseMilestone,
  roleOf,
  type Engagement,
} from "@/lib/stellar/contract";
import { formatUsdc, shortAddress } from "@/lib/stellar/config";
import { documentHashInBrowser, hashesMatch } from "@/lib/document-hash";
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
function DocumentBadge({ state }: { state: DocumentState }) {
  if (state === "verified") return <span className="pill pill-approved">matches chain</span>;
  if (state === "mismatch") return <span className="pill pill-held">hash differs</span>;
  return <span className="pill pill-neutral">not available here</span>;
}

/** Whether a document could be shown, and whether it is the one that was funded. */
type DocumentState = "verified" | "mismatch" | "absent";

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

export default function ReviewDeskPage({ params }: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx: idxParam } = use(params);
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

  const refresh = useCallback(async () => {
    if (!validId) throw new Error("Engagement ids must be non-negative whole numbers.");
    const e = await getEngagement(BigInt(id));
    setEngagement(e);
  }, [id, validId]);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, idx, refresh, validId, validIdx]);

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
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Not a failure of the page. The reviewer can still decide, and the
        // message says so rather than blocking the screen behind an error.
        setAdvisoryError(body.error ?? "The report could not be produced. You can still decide without it.");
        return;
      }
      setReport(body.report);
    } catch {
      setAdvisoryError("The advisory service could not be reached. You can still decide without it.");
    } finally {
      setAdvisoryLoading(false);
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
  const isReviewer = role === "reviewer";
  const canDecide = milestone.status === "EvidenceSubmitted";
  const canRelease = milestone.status === "Approved";
  /* A real comparison: the hash of the document on screen against the hash the
     contract anchored. "Absent" and "mismatch" are deliberately separate — one
     means this deployment cannot show the document, the other means the
     document it can show is not the one that was funded. Both block a
     decision, but only the second is a red flag, and telling a reviewer their
     hashes "differ" when the file is simply missing sent them looking for the
     wrong problem. */
  const criteriaState: DocumentState = criteria === null
    ? "absent"
    : hashesMatch(criteriaHash, milestone.criteria_hash) ? "verified" : "mismatch";

  const evidenceState: DocumentState = milestone.evidence_hash === null
    ? "absent"
    : evidence === null
      ? "absent"
      : hashesMatch(evidenceHash, milestone.evidence_hash) ? "verified" : "mismatch";

  const documentsVerified = criteriaState === "verified" && evidenceState === "verified";

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem", alignItems: "start" }}>
        {/* ── what was agreed ───────────────────────────────────────── */}
        <div className="panel stack-s">
          <div className="spread">
            <p className="eyebrow">Acceptance criteria</p>
            <DocumentBadge state={criteriaState} />
          </div>
          {criteria ? (
            <ol className="stack-s" style={{ paddingLeft: "1.125rem", margin: 0 }}>
              {criteria.criteria.map((c) => (
                <li key={c.id} style={{ fontSize: "0.9375rem" }}>{c.text}</li>
              ))}
            </ol>
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
              <ul className="stack-s" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {evidence.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noreferrer" className="badge-link" style={{ fontSize: "0.8125rem" }}>
                      {l.url.replace(/^https:\/\//, "").slice(0, 46)} ↗
                    </a>
                    <span className="faint mono" style={{ fontSize: "0.6875rem", marginLeft: "0.5rem" }}>{l.type}</span>
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

        {/* ── what the module thinks ────────────────────────────────── */}
        <AdvisoryPanel report={report} loading={advisoryLoading} error={advisoryError} onGenerate={generate} />
      </div>

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
            This wallet is the {role} on this engagement, not the reviewer. Only{" "}
            <span className="mono">{shortAddress(engagement.reviewer)}</span> can decide here — and the
            contract enforces that independently of this page.
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
                  <button type="button" className="btn btn-primary" disabled={!documentsVerified || !attested || busy !== null} onClick={() => act("approve")}>
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
