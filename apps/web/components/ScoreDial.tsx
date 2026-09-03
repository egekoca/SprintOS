"use client";

import { FoxSculpture } from "./FoxSculpture";

/**
 * The advisory score, as a gauge that fills from red to green.
 *
 * A bare number made a reviewer do arithmetic before they knew whether to pay
 * attention. A gauge is read at a glance, which is the whole job: this is the
 * first thing on the panel and it should say "worth a careful look" or "this
 * looks complete" before anyone reads a word.
 *
 * Two rules keep it from overreaching. The colour scale is deliberately not the
 * brand orange — orange means a human may act here, and a score is never a
 * permission. And green at 100 must not read as approval, so the disclaimer sits
 * directly underneath and the dial keeps the advisory panel's dull surface. What
 * this shows is how complete the evidence looked, not what should happen next.
 */

/** Sweep of the arc, in degrees. A gap at the bottom is what makes it a gauge. */
const SWEEP = 250;
const START = 90 + (360 - SWEEP) / 2;

const SIZE = 180;
const RADIUS = 72;
const CENTRE = SIZE / 2;

function pointAt(angleDeg: number, radius = RADIUS): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CENTRE + radius * Math.cos(rad), CENTRE + radius * Math.sin(rad)];
}

function arcPath(fromDeg: number, toDeg: number, radius = RADIUS): string {
  const [x1, y1] = pointAt(fromDeg, radius);
  const [x2, y2] = pointAt(toDeg, radius);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

/** Red at nothing, amber in the middle, green at a hundred. */
const RAMP: Array<[number, [number, number, number]]> = [
  [0, [196, 70, 58]],
  [0.5, [201, 150, 63]],
  [1, [78, 158, 115]],
];

function colourAt(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [stop, to] = RAMP[i];
    const [prevStop, from] = RAMP[i - 1];
    if (x <= stop) {
      const k = (x - prevStop) / (stop - prevStop);
      const mix = from.map((c, j) => Math.round(c + (to[j] - c) * k));
      return `rgb(${mix[0]} ${mix[1]} ${mix[2]})`;
    }
  }
  return `rgb(${RAMP[RAMP.length - 1][1].join(" ")})`;
}

/**
 * Which band the score falls in, for the number and the cap.
 *
 * Three bands rather than the continuous ramp: a reviewer reading "61" and "64"
 * should not be shown two visibly different colours, because the model's own
 * confidence does not resolve that finely.
 */
function bandOf(score: number): { colour: string; label: string } {
  if (score >= 75) return { colour: "var(--dial-high)", label: "Evidence looks complete" };
  if (score >= 40) return { colour: "var(--dial-mid)", label: "Gaps worth checking" };
  return { colour: "var(--dial-low)", label: "Little could be verified" };
}

export function ScoreDial({
  score,
  recommendation,
  size = SIZE,
}: {
  score: number;
  recommendation?: "ReadyForReview" | "RevisionSuggested";
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const band = bandOf(clamped);
  const endAngle = START + (SWEEP * clamped) / 100;

  /* Overlap each segment slightly so the joins do not show as hairlines. */
  const steps = Math.max(1, Math.round(clamped * 0.6));
  const segments = Array.from({ length: steps }, (_, i) => {
    const from = clamped * (i / steps);
    const to = clamped * ((i + 1) / steps);
    return {
      key: i,
      colour: colourAt(to / 100),
      d: arcPath(START + (SWEEP * from) / 100, START + (SWEEP * Math.min(to + 0.9, 100)) / 100),
    };
  });

  /* Ticks every ten points. They give the fill something to be read against —
     without them a three-quarter arc is just a shape. */
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const angle = START + (SWEEP * i) / 10;
    const [x1, y1] = pointAt(angle, RADIUS + 11);
    const [x2, y2] = pointAt(angle, RADIUS + (i % 5 === 0 ? 18 : 15));
    return { key: i, x1, y1, x2, y2, major: i % 5 === 0 };
  });

  return (
    <div className="score-dial" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
        aria-label={`Advisory score ${clamped} out of 100. ${band.label}.`}>
        {/* The full scale, dimmed. The reader can see where 100 would be. */}
        <path className="score-dial-track" d={arcPath(START, START + SWEEP)} />

        {ticks.map((t) => (
          <line key={t.key} className={`score-dial-tick${t.major ? " is-major" : ""}`}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
        ))}

        {/* The fill is drawn in short segments, each coloured by where it sits on
            the 0–100 scale rather than by where it sits within the filled part.
            An SVG gradient would stretch itself across whatever it was painted
            on, so a score of 50 came out reaching full green — the dial showed a
            better answer than the model gave. */}
        {segments.map((seg) => (
          <path key={seg.key} className="score-dial-fill" d={seg.d} style={{ stroke: seg.colour }} />
        ))}

        {/* A cap at the reached value, in that band's flat colour, so the exact
            stopping point is legible against the gradient behind it. */}
        {clamped > 0 && (
          <circle className="score-dial-cap" cx={pointAt(endAngle)[0]} cy={pointAt(endAngle)[1]} r={6}
            style={{ fill: band.colour }} />
        )}
      </svg>

      <div className="score-dial-face">
        <FoxSculpture size={Math.round(size * 0.3)} idPrefix={`dial-${score}`} />
        <span className="score-dial-value" style={{ color: band.colour }}>{clamped}</span>
        <span className="score-dial-unit">/ 100</span>
      </div>

      {recommendation && (
        <span className={`score-dial-verdict${recommendation === "ReadyForReview" ? " is-ready" : ""}`}>
          {recommendation === "ReadyForReview" ? "Ready for review" : "Revision suggested"}
        </span>
      )}
    </div>
  );
}
