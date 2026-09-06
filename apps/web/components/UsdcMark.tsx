/**
 * The USDC mark, inline.
 *
 * Drawn rather than loaded: it appears beside almost every amount on the site,
 * and a request per figure would be a lot of network for a shape this simple.
 * Inline also means it stays sharp at any size and carries no colour of its own
 * beyond the one Circle uses, which is the point of a currency mark.
 */
export function UsdcMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="presentation"
      aria-hidden="true"
      className="usdc-mark"
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      {/* The two arcs, left open at top and bottom the way the mark is drawn. */}
      <path
        d="M12.6 5.4a11.2 11.2 0 0 0 0 21.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M19.4 5.4a11.2 11.2 0 0 1 0 21.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16 8.4v1.5m0 12.2v1.5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18.9 13.1c-.2-1.6-1.4-2.5-3-2.5-1.8 0-3 .9-3 2.3 0 1.2.8 1.9 2.5 2.3l1.3.3c1.9.4 3 1.4 3 3.1 0 1.9-1.6 3.1-3.8 3.1-2.1 0-3.6-1-3.8-2.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
