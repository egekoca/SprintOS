"use client";

import { useEffect, useRef, useState } from "react";
import { FoxSculpture } from "./FoxSculpture";
import { ProductIcon } from "./ProductIcon";

/**
 * One budget, branching into the milestones it is paid out through.
 *
 * The section this replaces argued the point in three paragraphs, a five-cell
 * strip and a warning box. The thing worth understanding is simpler than that
 * and is better shown than described: money goes in once at the top, comes out
 * in four pieces at the bottom, and each piece waits for its own proof.
 *
 * Scrolling advances the trunk's light, walks the fox down it, and lights each
 * milestone as it is passed — so reading downward is the same motion as a
 * project being delivered.
 */

const TOTAL = "6,000";

/* Three, because three is the contract's ceiling. A four-milestone diagram
   promised a shape the product cannot actually create. */
const MILESTONES = [
  { amount: "1,500", title: "Contract skeleton", note: "Types, storage and a passing test suite." },
  { amount: "2,000", title: "Escrow and settlement", note: "Funds lock, release and refund on chain." },
  { amount: "2,500", title: "Reviewer desk", note: "Criteria, evidence, advisory score — deployed." },
];

export function MilestoneTree() {
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const viewport = window.innerHeight;
      /* Empty while the tree is still below the fold, full once its foot has
         risen past the middle of the screen — so the fill tracks reading
         position rather than raw scroll distance. */
      const start = viewport * 0.78;
      const end = viewport * 0.35;
      const travelled = start - box.top;
      const total = box.height + (start - end);
      setProgress(Math.min(1, Math.max(0, travelled / total)));
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  /* A milestone lights once the trunk's fill has reached its own branch. */
  const reached = (index: number) => progress >= (index + 0.65) / MILESTONES.length;
  const paidCount = MILESTONES.filter((_, index) => reached(index)).length;

  return (
    <div
      className="tree"
      ref={root}
      style={{ "--tree-progress": progress.toFixed(4) } as React.CSSProperties}
    >
      <div className="tree-root">
        <p className="eyebrow">Project budget</p>
        <strong>{TOTAL} <small>USDC</small></strong>
        <p className="tree-root-note">Locked in the contract on day one. Nothing leaves it without a signature.</p>
      </div>

      <div className="tree-body">
        <span className="tree-trunk" aria-hidden="true"><i /></span>

        <span className="tree-fox" aria-hidden="true">
          <FoxSculpture size={58} idPrefix="tree" />
        </span>

        <ol className="tree-branches">
          {MILESTONES.map((milestone, index) => (
            <li className={reached(index) ? "is-paid" : ""} key={milestone.title}>
              <span className="tree-branch" aria-hidden="true" />
              <span className="tree-dot" aria-hidden="true" />
              <div className="tree-card">
                <div className="tree-card-head">
                  <span className="tree-card-amount">{milestone.amount} <small>USDC</small></span>
                  <span className="tree-card-state">
                    {reached(index) ? <><ProductIcon name="check" size={13} /> Paid</> : "Waiting on proof"}
                  </span>
                </div>
                <h3>{milestone.title}</h3>
                <p>{milestone.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="tree-foot">
        <b>{paidCount} of {MILESTONES.length}</b> released ·{" "}
        {paidCount === MILESTONES.length
          ? "the budget is spent, and every payment names who signed it"
          : "the rest stays locked until its milestone is proved"}
      </p>
    </div>
  );
}
