import { WIDTH, HEIGHT, SILHOUETTE, MID, BRIGHT, NAVY } from "./fox-paths";

type FoxMarkProps = {
  size?: number;
  className?: string;
  decorative?: boolean;
};

const LOGO_ASPECT_RATIO = 978 / 306;
const FOX_ASPECT_RATIO = WIDTH / HEIGHT;

/**
 * The fox mark, drawn from vector.
 *
 * The team supplied the artwork as a 278x306 PNG with a soft fringe in its
 * alpha channel, so it blurs as soon as it is drawn any larger — which it is,
 * on the landing page and the app gateway. These are the same shapes traced to
 * paths, so the mark stays sharp at any size, and the fills are taken from
 * custom properties so callers can recolour it (the button spinner does).
 *
 * FoxSculpture uses the same paths for the lit, three-dimensional hero mark.
 */
export function FoxMark({ size = 36, className = "", decorative = false }: FoxMarkProps) {
  return (
    <svg
      className={`fox-mark ${className}`.trim()}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={Math.round(size * FOX_ASPECT_RATIO)}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "SprintOS fox"}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <path d={SILHOUETTE} fillRule="evenodd" fill="var(--orange-hi, #D9360B)" />
      <path d={MID} fillRule="evenodd" fill="var(--orange, #FF5A12)" />
      <path d={BRIGHT} fillRule="evenodd" fill="var(--orange-lo, #FF7A1E)" />
      <path d={NAVY} fillRule="evenodd" fill="var(--fox-eye, #22303A)" />
    </svg>
  );
}

/** The exact horizontal fox + SprintOS wordmark supplied by the team. */
export function Logo({ size = 36, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  if (!withWordmark) return <FoxMark size={size} decorative />;

  return (
    <span className="brand-lockup">
      <img
        className="brand-logo"
        src="/brand/sprintos-logo.png"
        width={Math.round(size * LOGO_ASPECT_RATIO)}
        height={size}
        alt="SprintOS"
        draggable={false}
      />
    </span>
  );
}
