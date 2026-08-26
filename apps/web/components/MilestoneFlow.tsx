"use client";

import { formatUsdc } from "@/lib/stellar/config";
import type { Milestone, MilestoneStatus } from "@/lib/stellar/contract";
import { ProductIcon, type ProductIconName } from "./ProductIcon";

/**
 * A funded engagement read as one left-to-right track.
 *
 * A stacked list of panels hides the only thing that matters here: where the
 * money has got to. This renders the milestones as connected stages so the
 * paid ones, the one waiting on a decision, and the ones not started yet are
 * all legible at a glance, and clicking any stage opens its detail below.
 */

const STAGE: Record<MilestoneStatus, { label: string; icon: ProductIconName; tone: string }> = {
  Pending: { label: "Not started", icon: "milestone", tone: "is-pending" },
  EvidenceSubmitted: { label: "Proof submitted", icon: "scan", tone: "is-submitted" },
  Approved: { label: "Approved", icon: "check", tone: "is-approved" },
  Held: { label: "On hold", icon: "eye", tone: "is-held" },
  Released: { label: "Paid", icon: "wallet", tone: "is-paid" },
  Refunded: { label: "Reclaimed", icon: "shield", tone: "is-refunded" },
};

/** Statuses where the money has finished moving, so the track reads as done. */
const SETTLED: MilestoneStatus[] = ["Released", "Refunded"];

export function MilestoneFlow({
  milestones,
  activeIndex,
  onSelect,
}: {
  milestones: Milestone[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const settledCount = milestones.filter((milestone) => SETTLED.includes(milestone.status)).length;
  const progress = milestones.length > 0 ? (settledCount / milestones.length) * 100 : 0;

  return (
    <div className="mflow">
      <div className="mflow-head">
        <p className="eyebrow">Milestone flow</p>
        <span className="mflow-progress-label">
          <b>{settledCount}</b> of {milestones.length} settled
        </span>
      </div>

      <div className="mflow-track" role="tablist" aria-label="Milestones">
        {/* The filled rail behind the stages is the share of money that has
            finished moving, not the share of time elapsed. */}
        <span className="mflow-rail" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </span>

        {milestones.map((milestone, index) => {
          const stage = STAGE[milestone.status] ?? STAGE.Pending;
          const decisive = milestone.status === "EvidenceSubmitted" || milestone.status === "Approved";
          return (
            <button
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              key={index}
              className={`mflow-stage ${stage.tone}${index === activeIndex ? " is-active" : ""}${decisive ? " needs-you" : ""}`}
              onClick={() => onSelect(index)}
            >
              <span className="mflow-node">
                <ProductIcon name={stage.icon} size={17} />
              </span>
              <span className="mflow-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="mflow-title">{milestone.title}</span>
              <span className="mflow-amount">
                {formatUsdc(milestone.amount)} <small>USDC</small>
              </span>
              <span className="mflow-stage-label">{stage.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The advisory score, drawn as a dial.
 *
 * Deliberately colourless — a score is the AI's opinion, and orange in this
 * interface is reserved for the places a human can act.
 */
export function ScoreDial({ score, size = 92 }: { score: number; size?: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="score-dial" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className="score-dial-track" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="score-dial-fill"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="score-dial-value">
        {score}
        <small>/100</small>
      </span>
    </div>
  );
}
