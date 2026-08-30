"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { FoxSculpture } from "./FoxSculpture";
import { ProductIcon } from "./ProductIcon";

/**
 * The landing page's opening sequence.
 *
 * The page arrives as the mark alone — no header, no headline, no framing
 * words. Scrolling settles the fox out of its oversized entrance, swings the
 * three stage marks into their places, and unlocks the rest of the page around
 * it, so the first thing anyone does on the site is assemble it.
 *
 * All of it runs off one scroll position and is published as custom properties
 * on `document.body`, because the header being revealed lives outside this
 * component's tree. `--reveal` is what everything else keys off; the fox and
 * the marks use their own curves so they finish just as the page settles.
 *
 * The properties are written in a layout effect so the intro state is in place
 * before the first paint — set in an ordinary effect they would flash the whole
 * page first. Their CSS defaults are the *finished* values, so a visitor
 * without JavaScript gets the page rather than an empty screen.
 */

/** How big the fox enters, how far the marks swing, and over how much scroll. */
const START_SCALE = 1.52;
const START_SPIN = -40;
const SETTLE_DISTANCE = 620;

/**
 * How much of that distance the mark keeps to itself before the page starts
 * appearing. Without the pause the reveal begins immediately and the entrance
 * reads as a slow page load rather than as a deliberate opening.
 */
const HOLD = 0.26;

const NODES = [
  { className: "rec-orbit-node-one", icon: "milestone", label: "Milestone", angle: -125 },
  { className: "rec-orbit-node-two", icon: "github", label: "Proof", angle: -35 },
  { className: "rec-orbit-node-three", icon: "signature", label: "Payment", angle: 55 },
] as const;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HeroOrbit() {
  const raf = useRef(0);

  useIsomorphicLayoutEffect(() => {
    const body = document.body;
    const properties = ["--reveal", "--hero-fox-scale", "--orbit-spin", "--orbit-emerge", "--hero-shift"];

    /* While the copy is hidden it still occupies its space, so the stage sits
       above the middle of the screen and the enlarged fox clips against the
       top. The correction is exactly half the copy's height — measured rather
       than guessed, because a fixed offset is wrong at every viewport but the
       one it was tuned on, which is how the mark ended up cropped and riding
       high. */
    const measure = () => {
      const copy = document.querySelector<HTMLElement>(".rec-orbit-message");
      const shift = copy ? copy.getBoundingClientRect().height / 2 : 0;
      body.style.setProperty("--hero-shift", `${Math.round(shift)}px`);
    };

    const set = (reveal: number, scale: number, spin: number, emerge: number) => {
      body.style.setProperty("--reveal", reveal.toFixed(4));
      body.style.setProperty("--hero-fox-scale", scale.toFixed(3));
      body.style.setProperty("--orbit-spin", `${spin.toFixed(2)}deg`);
      body.style.setProperty("--orbit-emerge", emerge.toFixed(3));
      /* Invisible is not unclickable: while the page is still locked its
         header and copy would otherwise keep taking the pointer. */
      body.dataset.heroLocked = reveal < 0.5 ? "true" : "false";
    };

    const clear = () => {
      for (const property of properties) body.style.removeProperty(property);
      delete body.dataset.heroLocked;
    };

    measure();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      set(1, 1, 0, 1);
      return clear;
    }

    const apply = () => {
      raf.current = 0;
      const progress = Math.min(1, Math.max(0, window.scrollY / SETTLE_DISTANCE));
      /* Ease out, so most of the motion happens early and the last stretch
         glides in rather than snapping. */
      const eased = 1 - (1 - progress) ** 3;
      /* The ring keeps its own curve. On the fox's ease-out the marks tore
         through most of the arc inside the first flick of the wheel, which
         read as the ring being thrown rather than settled. A smoothstep
         leaves the fastest part in the middle of the travel and arrives at
         both ends slowly, so the group looks driven rather than flung. */
      const swung = progress * progress * (3 - 2 * progress);
      const reveal = Math.min(1, Math.max(0, (progress - HOLD) / (1 - HOLD)));
      set(
        1 - (1 - reveal) ** 2,
        START_SCALE - (START_SCALE - 1) * eased,
        START_SPIN * (1 - swung),
        0.9 + 0.1 * eased,
      );
    };

    const onScroll = () => {
      if (raf.current === 0) raf.current = window.requestAnimationFrame(apply);
    };

    const onResize = () => {
      measure();
      onScroll();
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    /* Web fonts land after first paint and change the copy's height, so the
       measurement has to be taken again once they have. */
    void document.fonts?.ready.then(onResize).catch(() => undefined);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf.current !== 0) window.cancelAnimationFrame(raf.current);
      /* Leaving the landing page must not leave the rest of the app dimmed. */
      clear();
    };
  }, []);

  return (
    <div className="rec-orbit-stage" aria-label="What was promised becomes what is paid">
      {/* Two pairs in the same places. The name flanks the mark while the page
          is still locked and hands over to the words that describe the product
          as it assembles, so the opening reads as a title card. */}
      <span className="rec-orbit-brand rec-orbit-word-left">
        Sprint<span className="rec-orbit-brand-os">OS</span>
      </span>
      <span className="rec-orbit-brand rec-orbit-word-right">
        Sprint<span className="rec-orbit-brand-os">OS</span>
      </span>
      <span className="rec-orbit-word rec-orbit-word-left">Promised</span>
      <span className="rec-orbit-word rec-orbit-word-right">Paid</span>
      <span className="rec-orbit-ring rec-orbit-ring-one" />
      <span className="rec-orbit-ring rec-orbit-ring-two" />

      {/* The marks rotate as a group around the fox; each counter-rotates its
          own icon and label so they never read upside down. */}
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

      {/* Cue only while the page is still locked — with nothing but a fox on
          screen there is otherwise no sign that scrolling does anything. */}
      <span className="rec-orbit-cue" aria-hidden="true">
        <b>Scroll</b>
        <i />
      </span>
    </div>
  );
}
