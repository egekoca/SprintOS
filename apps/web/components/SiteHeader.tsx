"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { useWallet } from "./WalletProvider";
import { explorerAccount, shortAddress } from "@/lib/stellar/config";

const NAV = [
  { href: "/sponsor", label: "Sponsor" },
  { href: "/builder", label: "Builder" },
  { href: "/review", label: "Review" },
];

export function SiteHeader() {
  const { address, connecting, connect, disconnect, error } = useWallet();
  const pathname = usePathname();

  return (
    <header style={{ borderBottom: "1px solid var(--edge)", background: "rgba(11,14,18,0.82)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 20 }}>
      <div className="shell spread" style={{ paddingBlock: "0.875rem" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <Logo />
        </Link>

        <nav className="row" style={{ gap: "0.25rem" }}>
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "0.375rem 0.75rem",
                  borderRadius: "var(--radius)",
                  textDecoration: "none",
                  color: active ? "var(--chalk)" : "var(--chalk-faint)",
                  background: active ? "var(--concrete-2)" : "transparent",
                  border: `1px solid ${active ? "var(--edge-bright)" : "transparent"}`,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="row" style={{ gap: "0.5rem" }}>
          {address ? (
            <>
              <a
                href={explorerAccount(address)}
                target="_blank"
                rel="noreferrer"
                className="badge-link"
                title={address}
              >
                {shortAddress(address, 6, 6)}
              </a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="shell" style={{ paddingBottom: "0.75rem" }}>
          <p className="notice">{error}</p>
        </div>
      )}
    </header>
  );
}
