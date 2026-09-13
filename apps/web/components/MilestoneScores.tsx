"use client";

import { useEffect, useState } from "react";
import type { AdvisoryReport } from "@sprintos/schemas/report";
import type { Engagement } from "@/lib/stellar/contract";
import { MilestoneActions } from "./MilestoneActions";
import { SubmitProof } from "./SubmitProof";
import { formatUsdc } from "@/lib/stellar/config";
import { ScoreButton } from "./ScoreButton";
import { UsdcMark } from "./UsdcMark";
import { ScoreDial } from "./ScoreDial";
import { StatusPill } from "./StatusPill";

/**
 * Every milestone, and a button that asks how much of it looks done.
 *
 * The whole panel is one question per row. An earlier version asked for the
 * repository first, explained what a progress check was, and put the score
 * behind three paragraphs — for a sponsor who wrote these milestones ten
 * minutes ago, all of that is noise. They already named the repository during
 * setup, so it is read back rather than asked for again, and the only thing
 * left to do is press the button and see a number.
 */

type Scored =
  /** `stored` distinguishes the report the reviewer decided on from a repository sweep. */
  | { report: AdvisoryReport; stored?: boolean }
  | { error: string }
  | "loading"
  | undefined;

export function MilestoneScores({
  engagement,
  address,
  onChanged,
}: {
  engagement: Engagement;
  address: string | null;
  /** Called after a signature changes a milestone, so the page re-reads it. */
  onChanged?: () => void;
}) {
  const engagementId = engagement.id;
  const milestones = engagement.milestones;
  const [repository, setRepository] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<number, Scored>>({});
  const [open, setOpen] = useState<number | null>(null);
  /* Which row has the evidence form open, if any. */
  const [proving, setProving] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/project?engagement_id=${engagementId}`)
      .then((r) => r.json())
      .then((body) => setRepository(body.project?.repository ?? null))
      .catch(() => setRepository(null));
  }, [engagementId]);

  /* Show the score that was already produced.
   *
   * A milestone the reviewer read a report on — and paid against — still
   * offered nothing but "Get score", as though nobody had ever looked. The
   * report is stored against the evidence hash the contract recorded, so the
   * one that informed the decision can be read straight back. */
  useEffect(() => {
    let cancelled = false;
    for (const [idx, milestone] of milestones.entries()) {
      if (!milestone.evidence_hash) continue;
      fetch(
        `/api/advisory?engagement_id=${engagementId}&milestone_idx=${idx}` +
          `&evidence_hash=${encodeURIComponent(milestone.evidence_hash)}`,
      )
        .then((r) => r.json())
        .then((body) => {
          if (cancelled || !body.report) return;
          setScores((current) =>
            /* Never overwrite a fresh check the visitor just ran. */
            current[idx] ? current : { ...current, [idx]: { report: body.report, stored: true } },
          );
        })
        .catch(() => {
          /* No stored report is the normal case, not a failure worth showing. */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [engagementId, milestones]);

  async function score(idx: number, criteriaHash: string) {
    setScores((s) => ({ ...s, [idx]: "loading" }));
    setOpen(idx);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engagement_id: String(engagementId),
          milestone_idx: idx,
          criteria_hash: criteriaHash,
          repository,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The score could not be read.");
      setScores((s) => ({ ...s, [idx]: { report: body.report } }));
    } catch (error) {
      setScores((s) => ({
        ...s,
        [idx]: { error: error instanceof Error ? error.message : String(error) },
      }));
    }
  }

  return (
    <section className="scores">
      <ol className="score-rows">
        {milestones.map((milestone, idx) => {
          const state = scores[idx];
          const done = state && state !== "loading" && "report" in state ? state.report : null;

          return (
            <li key={milestone.criteria_hash} className="score-row">
              <span className="score-row-index">0{idx + 1}</span>

              <div className="score-row-name">
                <strong>{milestone.title}</strong>
                <small><UsdcMark /> {formatUsdc(milestone.amount)} USDC</small>
              </div>

              <StatusPill status={milestone.status} />

              <MilestoneActions
                engagement={engagement}
                milestone={milestone}
                index={idx}
                address={address}
                onSubmitProof={setProving}
              />

              {done ? (
                <span className="score-done">
                  <button
                    type="button"
                    className={`score-badge is-${band(done.advisory_score)}`}
                    onClick={() => setOpen(open === idx ? null : idx)}
                    title={
                      state && state !== "loading" && "stored" in state && state.stored
                        ? "The report the reviewer decided on"
                        : "Read from the repository just now"
                    }
                  >
                    {done.advisory_score}
                  </button>
                  {/* Small on purpose: the score is the answer, and running it
                      again is a second thought rather than the main action. */}
                  <button
                    type="button"
                    className="score-again"
                    onClick={() => score(idx, milestone.criteria_hash)}
                    disabled={!repository}
                    aria-label="Score this milestone again"
                    title="Score again from the repository"
                  >
                    ↻
                  </button>
                </span>
              ) : (
                <ScoreButton
                  busy={state === "loading"}
                  disabled={!repository}
                  onClick={() => score(idx, milestone.criteria_hash)}
                />
              )}

              {proving === idx && (
                <SubmitProof
                  engagementId={engagementId}
                  milestoneIdx={idx}
                  builder={engagement.builder}
                  onCancel={() => setProving(null)}
                  onDone={() => {
                    setProving(null);
                    onChanged?.();
                  }}
                />
              )}

              {open === idx && state && state !== "loading" && (
                <div className="score-detail">
                  {"error" in state ? (
                    <p className="notice">
                      {state.error}
                      {/* The server decides whether signing in is even possible
                          on this deployment, and says so in the message. Adding
                          a link here would offer a door that may not exist. */}
                    </p>
                  ) : (
                    <>
                      <ScoreDial score={state.report.advisory_score} size={140} />
                      <ul>
                        {state.report.criteria.map((c) => (
                          <li key={c.id}>
                            <span className={`score-verdict is-${c.verdict}`} />
                            {c.text}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Two short lines, because the number needs a caveat and the caveat does
          not need a section of its own. */}
      <p className="score-note">
        Read from{" "}
        {repository ? (
          <a href={repository} target="_blank" rel="noreferrer">{repository.split("/").slice(-2).join("/")}</a>
        ) : (
          "the repository"
        )}
        . Advisory only — releasing money is a separate signature.
      </p>
    </section>
  );
}

function band(score: number): "high" | "mid" | "low" {
  if (score >= 75) return "high";
  return score >= 40 ? "mid" : "low";
}
