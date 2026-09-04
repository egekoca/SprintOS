"use client";

import { useState } from "react";
import type { AdvisoryReport } from "@sprintos/schemas/report";
import { ScoreDial } from "./ScoreDial";
import { FoxSpinner } from "./FoxLoader";
import { ProductIcon } from "./ProductIcon";

/**
 * "How much of this looks done?", asked of the repository.
 *
 * The reviewer desk scores what a builder submitted. This scores the repository
 * itself, so the person who wrote the milestones and funded them can look
 * before anyone submits anything — which is what they actually want to do most
 * of the time.
 *
 * It is weaker evidence and the panel says so plainly rather than in a
 * footnote. Nobody selected these links and nothing about them is anchored on
 * chain, so a high score here means "the work appears to be there", not "the
 * builder has claimed it and the claim is recorded".
 */

const VERDICT_LABEL: Record<string, string> = {
  met: "Met",
  partially_met: "Partly met",
  not_met: "Not met",
  cannot_verify: "Could not verify",
};

export function ProgressCheck({
  engagementId,
  milestoneIdx,
  criteriaHash,
}: {
  engagementId: bigint;
  milestoneIdx: number;
  criteriaHash: string;
}) {
  const [repository, setRepository] = useState("");
  const [report, setReport] = useState<AdvisoryReport | null>(null);
  const [inspected, setInspected] = useState<Array<{ url: string; label?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engagement_id: String(engagementId),
          milestone_idx: milestoneIdx,
          criteria_hash: criteriaHash,
          repository: repository.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The progress check could not be run.");
      setReport(body.report);
      setInspected(body.inspected ?? []);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : String(checkError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="progress-check advisory stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Progress check · non-binding</p>
          <h3 style={{ marginTop: "0.25rem" }}>How much looks done?</h3>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={check}
          disabled={busy || repository.trim().length < 3}
        >
          {busy ? <><FoxSpinner /> Reading the repository…</> : report ? "Check again" : "Check the repository"}
        </button>
      </div>

      <div className="field">
        <label htmlFor={`repo-${milestoneIdx}`}>Public repository</label>
        <input
          id={`repo-${milestoneIdx}`}
          type="text"
          placeholder="https://github.com/owner/repository"
          value={repository}
          onChange={(event) => setRepository(event.target.value)}
        />
        {/* The repository is not recorded on chain, so it has to be named here.
            Saying that is better than quietly guessing it. */}
        <small className="field-hint">
          The engagement does not store this on chain, so name the repository the milestones
          are judged against. Only public repositories are opened.
        </small>
      </div>

      {error && <p className="notice">{error}</p>}

      {report && (
        <>
          <div className="advisory-score-scene">
            <ScoreDial score={report.advisory_score} size={160} />
            <div className="stack-s" style={{ gap: "0.25rem" }}>
              <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--chalk-dim)" }}>
                {report.criteria.filter((c) => c.verdict === "met").length} of {report.criteria.length} criteria
                look met
              </span>
              <span className="faint" style={{ fontSize: "0.75rem", maxWidth: "30ch" }}>
                Read from the repository, not submitted by the builder and not anchored on
                chain. Nothing here releases anything.
              </span>
            </div>
          </div>

          <ol className="progress-criteria">
            {report.criteria.map((c) => (
              <li key={c.id}>
                <span className={`progress-verdict is-${c.verdict}`}>
                  {VERDICT_LABEL[c.verdict] ?? c.verdict}
                </span>
                <div>
                  <strong>{c.text}</strong>
                  <small>{c.rationale}</small>
                </div>
              </li>
            ))}
          </ol>

          {report.missing_information.length > 0 && (
            <div className="stack-s">
              <p className="eyebrow">What it could not confirm</p>
              <ul className="progress-missing">
                {report.missing_information.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {inspected.length > 0 && (
            <p className="faint" style={{ fontSize: "0.75rem" }}>
              <ProductIcon name="link" size={13} /> Looked at:{" "}
              {inspected.map((i, n) => (
                <span key={i.url}>
                  {n > 0 && " · "}
                  <a href={i.url} target="_blank" rel="noreferrer">{i.label ?? i.url}</a>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  );
}
