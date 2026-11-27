/**
 * Inline marks for the Stellar-network assets SprintOS accepts, in the same
 * spirit as `UsdcMark`: drawn rather than loaded, so a row of four never
 * costs four requests and stays sharp at any size. Colours approximate each
 * issuer's own brand (Circle, Tether, the Stellar Development Foundation) —
 * close enough to be recognised at a glance, not a claim to their exact
 * trademarked artwork.
 */

function Badge({
  size, fill, children,
}: { size: number; fill: string; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="presentation" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill={fill} />
      {children}
    </svg>
  );
}

export { UsdcMark } from "./UsdcMark";

/** Circle's EURC — the same two-arc shape as USDC, recoloured, with a euro sign. */
export function EurcMark({ size = 15 }: { size?: number }) {
  return (
    <Badge size={size} fill="#1A56DB">
      <path d="M12.6 5.4a11.2 11.2 0 0 0 0 21.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19.4 5.4a11.2 11.2 0 0 1 0 21.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10.5 13h8M10.5 17.5h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M19 10.2c-1.3-.9-2.9-1.4-4.4-1.1-3 .6-4.9 3.6-4.3 6.6s3.6 4.9 6.6 4.3c1.5-.3 2.8-1.2 3.6-2.4"
        fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"
      />
    </Badge>
  );
}

/** Tether's USDT — the recognisable teal, labelled USDT0 wherever the bridged asset needs naming. */
export function UsdtMark({ size = 15 }: { size?: number }) {
  return (
    <Badge size={size} fill="#50AF95">
      <path d="M9 10h14M16 10v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M11 16.6c0 1.8 2.3 2.9 5 2.9s5-1.1 5-2.9-2.3-2.4-5-2.4-5 .6-5 2.4Z"
        fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"
      />
      <path d="M16 19.5v3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </Badge>
  );
}

/** Stellar's own XLM — near-black, the four-pointed mark. */
export function XlmMark({ size = 15 }: { size?: number }) {
  return (
    <Badge size={size} fill="#0F0F0F">
      <path
        d="M16 7.5 18.6 14.4 25.5 17 18.6 19.6 16 26.5 13.4 19.6 6.5 17 13.4 14.4 16 7.5Z"
        fill="#fff"
      />
    </Badge>
  );
}
