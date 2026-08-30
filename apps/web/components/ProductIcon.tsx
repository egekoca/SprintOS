export type ProductIconName =
  | "branch"
  | "calendar"
  | "check"
  | "clock"
  | "eye"
  | "github"
  | "link"
  | "milestone"
  | "scan"
  | "shield"
  | "signature"
  | "wallet";

export function ProductIcon({ name, size = 24, className = "" }: { name: ProductIconName; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `product-icon ${className}`.trim(),
    "aria-hidden": true,
  };

  const paths: Record<ProductIconName, React.ReactNode> = {
    branch: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M8 9c5 0 8-1 8-3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    github: <><path d="M9 19c-4.5 1.4-4.5-2.4-6.3-3M15.2 21v-3.5c0-1 .1-1.5-.5-2.1 3.1-.3 6.3-1.5 6.3-6.8A5.3 5.3 0 0 0 19.6 5c.1-.3.6-1.7-.1-3.5 0 0-1.2-.4-3.7 1.4a13 13 0 0 0-6.8 0C6.5 1.1 5.3 1.5 5.3 1.5 4.6 3.3 5.1 4.7 5.2 5a5.3 5.3 0 0 0-1.4 3.6c0 5.3 3.2 6.5 6.3 6.8-.5.5-.7 1.1-.7 2.1V21" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1" /></>,
    milestone: <><path d="M5 3v18" /><path d="M6 5h11l-2 4 2 4H6" /><circle cx="5" cy="19" r="2" /></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M7 12h10" /></>,
    shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3 7.5 7.5 9.5 4.5-2 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    signature: <><path d="M4 17c3-1 4-7 6-7 1.5 0-1 6 .5 6 1 0 2-3 3-3s0 3 1 3 2-2 3-2c.8 0 1.3.5 2.5 1" /><path d="M4 20h16" /></>,
    wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2V19H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}
