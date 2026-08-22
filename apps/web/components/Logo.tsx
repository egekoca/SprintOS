/**
 * The SprintOS mark, drawn rather than loaded.
 *
 * The supplied PNG has no alpha channel — its "transparent" checkerboard is
 * baked into the pixels — so it cannot sit on the dark ground this interface
 * uses. An inline SVG also inherits currentColor and scales without a second
 * asset.
 */
export function Logo({ size = 28, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="SprintOS"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="fox" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF7A1E" />
            <stop offset="100%" stopColor="#E63C14" />
          </linearGradient>
        </defs>
        {/* Fox head: two ears, a tapering muzzle, and a tail curling behind. */}
        <path
          d="M12 14 L21 25 Q32 20 43 25 L52 14 L50 30 Q56 38 48 47 Q38 56 26 52 Q14 48 12 36 Z"
          fill="url(#fox)"
        />
        <path
          d="M12 30 Q4 38 10 48 Q16 57 28 55 Q18 50 16 41 Q15 35 12 30 Z"
          fill="url(#fox)"
          opacity="0.75"
        />
        <path d="M24 33 l6 2 -5 3 Z" fill="#12171D" />
        <path d="M44 33 l-6 2 5 3 Z" fill="#12171D" />
        <path d="M31 42 h6 l-3 4 Z" fill="#12171D" />
      </svg>
      {withWordmark && (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: `${size * 0.66}px`,
            letterSpacing: "0.01em",
            textTransform: "uppercase",
            color: "var(--chalk)",
          }}
        >
          Sprint<span className="stencil">OS</span>
        </span>
      )}
    </span>
  );
}
