"use client";

import { useEffect, useState } from "react";
import type { AcceptanceCriterion, EvidenceLink } from "@sprintos/schemas/milestone";
import { ProductIcon, type ProductIconName } from "./ProductIcon";

/**
 * The acceptance criteria for one milestone, resolved from the hash on chain.
 *
 * The contract stores only a sha256, and every screen used to show exactly
 * that — which meant a builder was asked to prove a milestone without being
 * told what it required, and a visitor could see that something had been
 * promised but not what. The prose is served by `/api/criteria`, so fetch it
 * and show it; the hash stays available underneath as the thing that makes the
 * list tamper-evident.
 */

interface CriteriaResponse {
  criteria: { criteria: AcceptanceCriterion[] } | null;
  hash: string | null;
}

export function MilestoneCriteria({
  criteriaHash,
  /** Renders the verified hash under the list. Off inside dense lists. */
  showHash = true,
}: {
  criteriaHash: string | null;
  showHash?: boolean;
}) {
  const [criteria, setCriteria] = useState<AcceptanceCriterion[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!criteriaHash) {
      setState("missing");
      return;
    }
    let cancelled = false;
    setState("loading");
    fetch(`/api/criteria?hash=${encodeURIComponent(criteriaHash)}`, { cache: "force-cache" })
      .then((response) => response.json() as Promise<CriteriaResponse>)
      .then((body) => {
        if (cancelled) return;
        const list = body.criteria?.criteria ?? null;
        setCriteria(list);
        /* The API recomputes the hash from the stored document. Matching it
           against the one anchored on chain is what makes this list evidence
           rather than a claim by the interface. */
        setVerified(body.hash === criteriaHash);
        setState(list && list.length > 0 ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [criteriaHash]);

  if (state === "loading") {
    return <p className="criteria-empty">Reading the criteria…</p>;
  }

  if (state === "missing") {
    if (!criteriaHash) return <p className="criteria-empty">No criteria anchored for this milestone.</p>;
    /* The prose lives off chain, so an engagement created against a different
       store resolves to nothing here. The anchored hash is then the only thing
       left worth showing — say so, and show it. */
    return (
      <div className="criteria">
        <p className="criteria-empty">
          The criteria document is not held by this server, so the text cannot be shown. What the
          contract anchored is still verifiable:
        </p>
        <p className="criteria-hash"><code>{criteriaHash}</code></p>
      </div>
    );
  }

  return (
    <div className="criteria">
      <ul className="criteria-list-view">
        {criteria?.map((criterion) => (
          <li key={criterion.id}>
            <ProductIcon name="check" size={15} />
            <span>{criterion.text}</span>
          </li>
        ))}
      </ul>
      {showHash && criteriaHash && (
        <p className={`criteria-hash${verified ? " is-verified" : ""}`}>
          {verified ? "Matches the hash on chain" : "Hash mismatch — treat with caution"}
          <code>{criteriaHash.slice(0, 16)}…</code>
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- evidence */

const EVIDENCE_LABEL: Record<string, { label: string; icon: ProductIconName }> = {
  repo: { label: "Repository", icon: "github" },
  commit: { label: "Commit", icon: "branch" },
  pull_request: { label: "Pull request", icon: "branch" },
  test_result: { label: "Test result", icon: "check" },
  docs: { label: "Documentation", icon: "link" },
  demo: { label: "Demo", icon: "eye" },
};

interface EvidenceResponse {
  evidence: { links: EvidenceLink[]; note?: string; submitted_at: string } | null;
  hash: string | null;
}

/**
 * What the builder actually submitted, resolved from the anchored hash.
 *
 * The chain carries a hash and a pointer; on its own that tells a reader
 * nothing about the work. This opens the bundle and lists the links the way
 * the reviewer and the advisory module see them.
 */
export function MilestoneEvidence({
  evidenceHash,
  evidenceUri,
}: {
  evidenceHash: string | null;
  evidenceUri: string | null;
}) {
  const [bundle, setBundle] = useState<EvidenceResponse["evidence"]>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!evidenceHash) {
      setState("none");
      return;
    }
    let cancelled = false;
    setState("loading");
    fetch(`/api/evidence?hash=${encodeURIComponent(evidenceHash)}`, { cache: "force-cache" })
      .then((response) => response.json() as Promise<EvidenceResponse>)
      .then((body) => {
        if (cancelled) return;
        setBundle(body.evidence);
        setVerified(body.hash === evidenceHash);
        setState(body.evidence ? "ready" : "none");
      })
      .catch(() => {
        if (!cancelled) setState("none");
      });
    return () => {
      cancelled = true;
    };
  }, [evidenceHash]);

  if (state === "loading") return <p className="criteria-empty">Reading the evidence…</p>;

  if (state === "none") {
    if (!evidenceHash) return <p className="criteria-empty">No evidence submitted yet.</p>;
    return (
      <div className="criteria">
        <p className="criteria-empty">
          The bundle is not held by this server, so its links cannot be listed. What the contract
          anchored is still verifiable:
        </p>
        <p className="criteria-hash">
          <code>{evidenceHash}</code>
          {evidenceUri && <a href={evidenceUri} target="_blank" rel="noreferrer">Pointer</a>}
        </p>
      </div>
    );
  }

  return (
    <div className="criteria">
      <ul className="evidence-list-view">
        {bundle?.links.map((link) => {
          const kind = EVIDENCE_LABEL[link.type] ?? { label: link.type, icon: "link" as ProductIconName };
          return (
            <li key={link.url}>
              <ProductIcon name={kind.icon} size={15} />
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label ?? link.url}
              </a>
              <small>{kind.label}</small>
            </li>
          );
        })}
      </ul>
      {bundle?.note && <p className="evidence-note">{bundle.note}</p>}
      <p className={`criteria-hash${verified ? " is-verified" : ""}`}>
        {verified ? "Matches the hash on chain" : "Hash mismatch — treat with caution"}
        {evidenceUri && (
          <a href={evidenceUri} target="_blank" rel="noreferrer">Raw bundle</a>
        )}
      </p>
    </div>
  );
}
