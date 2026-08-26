"use client";

import { useEffect, useRef } from "react";
import { FoxSculpture } from "./FoxSculpture";

/**
 * The hero mark, oversized on arrival and settling into the ring as you scroll.
 *
 * The fox is the first thing on the page and it should own the screen before
 * the layout resolves around it. It starts well beyond the ring and reaches its
 * resting size within the first screenful, so the shrink reads as the page
 * composing itself rather than as a separate animation.
 *
 * The scale is written to a custom property and applied in CSS, which keeps the
 * reduced-motion rule able to switch it off, and the write is scheduled on a
 * frame so a fast scroll cannot queue up layout work per event.
 */

/**
 * How far the fox travels, and over how much scroll it settles.
 *
 * Kept modest deliberately: the mark sits high in its stage, so a large scale
 * pushes its ears behind the header and its body over the headline. This is
 * as big as it can be while staying whole on a laptop viewport.
 */
const START_SCALE = 1.28;
const SETTLE_DISTANCE = 460;

export function HeroFox() {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      node.style.setProperty("--hero-fox-scale", "1");
      return;
    }

    let frame = 0;
    const apply = () => {
      frame = 0;
      /* Ease out, so most of the shrink happens in the first few pixels and
         the last stretch is gentle rather than snapping to its final size. */
      const progress = Math.min(1, Math.max(0, window.scrollY / SETTLE_DISTANCE));
      const eased = 1 - (1 - progress) ** 3;
      const scale = START_SCALE - (START_SCALE - 1) * eased;
      node.style.setProperty("--hero-fox-scale", scale.toFixed(3));
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
    <div className="hero-fox-scaler" ref={stage}>
      <FoxSculpture size={350} interactive idPrefix="hero" />
    </div>
  );
}
