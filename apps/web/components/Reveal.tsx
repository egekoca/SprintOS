"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * A container whose children arrive one at a time when it is scrolled into
 * view, rather than being there already when the reader gets to them.
 *
 * The stagger is the point: three cards that drop in sequence read as three
 * separate claims, and four steps that wipe in left to right read as an order
 * of events. Everything is done with `--i` and a class — the component only
 * decides *when*, and the stylesheet decides what the motion looks like.
 *
 * It runs every time the row is entered, from either direction, not once per
 * page load. That takes two observers rather than one, because entering and
 * leaving must not share a boundary:
 *
 *   · `enter` watches a band inset from both edges, so the row has to be
 *     properly on the page before it plays — arriving from above or below.
 *   · `leave` watches the whole viewport and only rearms the row once it is
 *     completely gone.
 *
 * The gap between those two boundaries is the hysteresis. Sharing one edge
 * would let a few pixels of scroll jitter retrigger the animation on a loop.
 */

type RevealMotion = "drop" | "wipe";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** How each child enters: falling from above, or opening from the left. */
  motion?: RevealMotion;
  /** Milliseconds between one child landing and the next. */
  stagger?: number;
}

export function Reveal({ children, className, motion = "drop", stagger = 120 }: RevealProps) {
  const root = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    /* Anything that cannot watch the viewport — an old browser, a reader who
       has asked for less motion — gets the finished state and keeps it. */
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setRevealed(true);
      return;
    }

    const enter = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setRevealed(true);
      },
      { rootMargin: "-25% 0px -25% 0px" },
    );

    const leave = new IntersectionObserver(
      (entries) => {
        if (entries.every((entry) => !entry.isIntersecting)) setRevealed(false);
      },
      { rootMargin: "0px" },
    );

    enter.observe(node);
    leave.observe(node);
    return () => {
      enter.disconnect();
      leave.disconnect();
    };
  }, []);

  const classes = ["rec-reveal", `is-${motion}`, className, revealed ? "is-revealed" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={root}
      className={classes}
      style={{ "--reveal-step": `${stagger}ms` } as CSSProperties}
    >
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        const element = child as ReactElement<{ style?: CSSProperties }>;
        return cloneElement(element, {
          style: { ...element.props.style, "--i": index } as CSSProperties,
        });
      })}
    </div>
  );
}
