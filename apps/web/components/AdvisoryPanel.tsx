"use client";

import type { AdvisoryReport } from "@sprintos/schemas/report";
import { FoxSpinner } from "./FoxLoader";
import { FoxSculpture } from "./FoxSculpture";
import { ScoreDial } from "./ScoreDial";

/**
 * The advisory report, rendered as the least authoritative thing on the page.
 *
 * Dashed border, dulled surface, no brand colour anywhere. A reviewer glancing
 * at this screen should be able to tell which half can act and which half can
 * only advise without reading a word.
 */

const VERDICT_LABEL: Record<string, string> = {
  met: "Met",
  partially_met: "Partly met",
  not_met: "Not met",
  cannot_verify: "Could not verify",
};

const VERDICT_COLOR: Record<string, string> = {
  met: "var(--chalk-dim)",
  partially_met: "var(--advisory-ink)",
  not_met: "var(--paper)",
  cannot_verify: "var(--chalk-faint)",
};

export function AdvisoryPanel({
  report,
  loading,
  error,
  onGenerate,
}: {
  report: AdvisoryReport | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <section className="advisory stack" aria-labelledby="advisory-heading">
      <div className="spread">
        <div>
          <p className="eyebrow">Advisory · non-binding</p>
          <h3 id="advisory-heading" style={{ marginTop: "0.25rem" }}>AI review</h3>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onGenerate} disabled={loading}>
          {loading ? <><FoxSpinner /> Reading evidence…</> : report ? "Run again" : "Generate report"}
        </button>
      </div>

      {error && <p className="notice">{error}</p>}

      {loading && (
        <div className="advisory-fox-loading" aria-live="polite">
          <FoxSculpture size={92} idPrefix="score-loading" />
          <span><b>Reading the evidence</b><small>The fox is checking every criterion.</small></span>
        </div>
      )}

      {!report && !error && !loading && (
        <p style={{ fontSize: "0.9375rem" }}>
          No report yet. This module runs only when you ask it to — it does not watch
          repositories or generate anything in the background.
        </p>
      )}

      {report && (
        <>
          <div className="advisory-score-scene">
            <ScoreDial score={report.advisory_score} recommendation={report.recommendation} />
            <div className="stack-s" style={{ gap: "0.25rem" }}>
              <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--chalk-dim)" }}>
                {report.criteria.filter((c) => c.verdict === "met").length} of {report.criteria.length} criteria met
              </span>
              <span className="faint" style={{ fontSize: "0.75rem", maxWidth: "22ch" }}>
                How much of the evidence checked out — not a decision, and not a
                permission to release anything.
              </span>
            </div>
          </div>

          <ol className="stack-s" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {report.criteria.map((c) => (
              <li
                key={c.id}
                style={{
                  borderTop: "1px dashed var(--advisory-edge)",
                  paddingTop: "0.625rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <div className="row" style={{ gap: "0.5rem" }}>
                  <span
                    className="mono"
                    style={{ fontSize: "0.6875rem", color: VERDICT_COLOR[c.verdict], letterSpacing: "0.06em", textTransform: "uppercase" }}
                  >
                    {VERDICT_LABEL[c.verdict] ?? c.verdict}
                  </span>
                  <span className="faint mono" style={{ fontSize: "0.6875rem" }}>
                    {c.confidence} confidence
                  </span>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--chalk-dim)" }}>{c.text}</p>
                <p style={{ fontSize: "0.8125rem" }}>{c.rationale}</p>
                {c.supporting_links.length > 0 && (
                  <div className="row" style={{ gap: "0.5rem" }}>
                    {c.supporting_links.map((link) => (
                      <a key={link} href={link} target="_blank" rel="noreferrer" className="badge-link">
                        {new URL(link).pathname.slice(0, 28) || new URL(link).hostname} ↗
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>

          {report.missing_information.length > 0 && (
            <div className="stack-s" style={{ borderTop: "1px dashed var(--advisory-edge)", paddingTop: "0.75rem" }}>
              <p className="eyebrow">What it could not confirm</p>
              <ul style={{ margin: 0, paddingLeft: "1.125rem", fontSize: "0.875rem" }}>
                {report.missing_information.map((item) => (
                  <li key={item} style={{ marginBottom: "0.25rem" }}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="advisory-banner">
            {report.disclaimer}
          </p>
          <p className="faint mono" style={{ fontSize: "0.6875rem" }}>
            {report.model} · {report.report_hash}
          </p>
        </>
      )}
    </section>
  );
}
