"use client";

import { useEffect, useRef } from "react";
import { FoxSculpture } from "./FoxSculpture";
import { ProductIcon } from "./ProductIcon";

/**
 * The hero stage: an oversized fox that settles as you scroll, with the three
 * stage marks swinging clockwise into their places as it goes.
 *
 * Both are driven from one scroll position so they finish together — the fox
 * reaches its resting size at the same moment the marks reach the spots they
 * keep for the rest of the page. Anything less and the two motions read as two
 * unrelated animations that happen to overlap.
 *
 * The values are written to custom properties and applied in CSS, which keeps
 * the reduced-motion rule able to switch the whole thing off, and the write is
 * scheduled on a frame so a fast scroll cannot queue layout work per event.
 */

/**
 * How big the fox starts, how far the marks swing, and over how much scroll it
 * all settles.
 *
 * The scale is kept modest deliberately: the mark sits high in its stage, so
 * anything larger pushes its ears behind the header and its body across the
 * headline. The swing is three-quarters of a turn — a full turn would land
 * where it started and read as no movement at all.
 */
const START_SCALE = 1.28;
const START_SPIN = -270;
const SETTLE_DISTANCE = 460;

/**
 * Where each mark sits on the ring, measured clockwise from twelve o'clock.
 *
 * They are placed on one shared circle rather than at three hand-picked
 * offsets. Rotating marks that sit at different radii does not read as an
 * orbit — it drags them through the fox on the way past.
 */
const NODES = [
  { className: "rec-orbit-node-one", icon: "milestone", label: "Milestone", angle: -125 },
  { className: "rec-orbit-node-two", icon: "github", label: "Proof", angle: -35 },
  { className: "rec-orbit-node-three", icon: "signature", label: "Payment", angle: 55 },
] as const;

export function HeroOrbit() {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;

    const settle = () => {
      node.style.setProperty("--hero-fox-scale", "1");
      node.style.setProperty("--orbit-spin", "0deg");
      node.style.setProperty("--orbit-emerge", "1");
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settle();
      return;
    }

    let frame = 0;
    const apply = () => {
      frame = 0;
      /* Ease out, so most of the movement happens in the first few pixels and
         the last stretch glides in rather than snapping. */
      const progress = Math.min(1, Math.max(0, window.scrollY / SETTLE_DISTANCE));
      const eased = 1 - (1 - progress) ** 3;
      node.style.setProperty("--hero-fox-scale", (START_SCALE - (START_SCALE - 1) * eased).toFixed(3));
      node.style.setProperty("--orbit-spin", `${(START_SPIN * (1 - eased)).toFixed(2)}deg`);
      /* Ghosted while they sweep, solid once they arrive. The lower part of
         the ring passes behind the headline, and marks at full strength
         crossing it read as stray circles rather than as travel. */
      node.style.setProperty("--orbit-emerge", (0.22 + 0.78 * eased).toFixed(3));
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="rec-orbit-stage" ref={stage} aria-label="What was promised becomes what is paid">
      <span className="rec-orbit-word rec-orbit-word-left">Promised</span>
      <span className="rec-orbit-word rec-orbit-word-right">Paid</span>
      <span className="rec-orbit-ring rec-orbit-ring-one" />
      <span className="rec-orbit-ring rec-orbit-ring-two" />

      {/* The marks rotate as a group around the fox; each one counter-rotates
          its own icon and label so they never read upside down. */}
      <span className="rec-orbit-spin">
        {NODES.map((item) => (
          <span
            className="rec-orbit-slot"
            key={item.label}
            style={{ "--angle": `${item.angle}deg` } as React.CSSProperties}
          >
            <span className={`rec-orbit-node ${item.className}`}>
              <ProductIcon name={item.icon} size={20} />
              <b>{item.label}</b>
            </span>
          </span>
        ))}
      </span>

      <FoxSculpture size={350} interactive idPrefix="hero" />
    </div>
  );
}
