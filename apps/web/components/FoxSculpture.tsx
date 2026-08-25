"use client";

import { useRef } from "react";
import { WIDTH, HEIGHT, SILHOUETTE, MID, BRIGHT, NAVY } from "./fox-paths";

/**
 * The fox mark as a solid object rather than a picture of one.
 *
 * The supplied PNG is 278x306 with a soft fringe baked into its alpha, so it
 * goes blurry the moment it is drawn larger than its own pixel grid — which is
 * exactly what the landing page needs to do. These are the same shapes traced
 * to vector, then given thickness: the silhouette is stamped repeatedly along
 * the light axis to build an extruded side wall, and the face plates sit on top
 * with a directional gradient and a rim highlight.
 *
 * It is lit from the upper left, like everything else on the page.
 */

const DEPTH = 16;

type FoxSculptureProps = {
  size?: number;
  /** Follows the pointer. Off for the small marks that sit inside prose. */
  interactive?: boolean;
  className?: string;
  idPrefix?: string;
};

export function FoxSculpture({
  size = 420,
  interactive = false,
  className = "",
  idPrefix = "fox",
}: FoxSculptureProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  /* The tilt is written straight to custom properties so the transform stays in
     CSS, where the reduced-motion rule can switch it off. */
  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    stage.style.setProperty("--fox-tilt-y", `${(x * 17).toFixed(2)}deg`);
    stage.style.setProperty("--fox-tilt-x", `${(-y * 13).toFixed(2)}deg`);
    stage.style.setProperty("--fox-shift", `${(-x * 9).toFixed(2)}px`);
  }

  function handleLeave() {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--fox-tilt-y", "0deg");
    stage.style.setProperty("--fox-tilt-x", "0deg");
    stage.style.setProperty("--fox-shift", "0px");
  }

  const id = (name: string) => `${idPrefix}-${name}`;
  const extrusion = Array.from({ length: DEPTH }, (_, step) => step + 1);

  return (
    <div
      ref={stageRef}
      className={`fox-stage ${interactive ? "fox-stage-live" : ""} ${className}`.trim()}
      style={{ "--fox-size": `${size}px` } as React.CSSProperties}
      onPointerMove={interactive ? handleMove : undefined}
      onPointerLeave={interactive ? handleLeave : undefined}
    >
      <svg
        className="fox-sculpture"
        viewBox={`-14 -10 ${WIDTH + 34} ${HEIGHT + 34}`}
        role="img"
        aria-label="SprintOS fox"
        focusable="false"
      >
        <defs>
          <path id={id("sil")} d={SILHOUETTE} fillRule="evenodd" />

          <linearGradient id={id("plate")} x1="0.05" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#FF9440" />
            <stop offset="42%" stopColor="#FF5A12" />
            <stop offset="100%" stopColor="#C2380B" />
          </linearGradient>

          <linearGradient id={id("plateMid")} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#E4470D" />
            <stop offset="100%" stopColor="#9A2A06" />
          </linearGradient>

          <linearGradient id={id("plateDark")} x1="0.2" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#8E2405" />
            <stop offset="100%" stopColor="#521402" />
          </linearGradient>

          <linearGradient id={id("navy")} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#2E3E4B" />
            <stop offset="100%" stopColor="#131B22" />
          </linearGradient>

          {/* Rim light. Stroked wide, then clipped to the shape so only the
              inside half of the stroke survives — a bevel, not an outline. */}
          <linearGradient id={id("rim")} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#FFD9B4" stopOpacity="0.95" />
            <stop offset="38%" stopColor="#FFB077" stopOpacity="0.28" />
            <stop offset="70%" stopColor="#FF5A12" stopOpacity="0" />
          </linearGradient>

          <clipPath id={id("clip")}>
            <use href={`#${id("sil")}`} />
          </clipPath>

          <linearGradient id={id("sheen")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.16" />
            <stop offset="58%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          <filter id={id("cast")} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        {/* Shadow the object throws onto the wall behind it. */}
        <g className="fox-cast" filter={`url(#${id("cast")})`}>
          <use href={`#${id("sil")}`} fill="#000000" opacity="0.72" transform="translate(26 22)" />
        </g>

        <g className="fox-body">
          {/* Side wall. Each stamp is one slice of thickness. */}
          <g className="fox-wall">
            {extrusion.map((step) => (
              <use
                key={step}
                href={`#${id("sil")}`}
                transform={`translate(${step * 0.92} ${step * 0.72})`}
                fill={step > DEPTH - 3 ? "#20090280" : "#2A0B02"}
              />
            ))}
          </g>

          {/* Front face, darkest plate first. */}
          <use href={`#${id("sil")}`} fill={`url(#${id("plateDark")})`} />
          <path d={MID} fillRule="evenodd" fill={`url(#${id("plateMid")})`} />
          <path d={BRIGHT} fillRule="evenodd" fill={`url(#${id("plate")})`} />
          <path d={NAVY} fillRule="evenodd" fill={`url(#${id("navy")})`} />

          <g clipPath={`url(#${id("clip")})`}>
            <use
              href={`#${id("sil")}`}
              fill="none"
              stroke={`url(#${id("rim")})`}
              strokeWidth="5"
            />
            {/* A slow highlight travelling across the face, which is what
                sells the surface as something with a sheen. */}
            <g className="fox-sheen">
              <g transform="rotate(-14)">
                <rect x="-150" y="-60" width="96" height={HEIGHT + 160} fill={`url(#${id("sheen")})`} />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
