import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "SprintOS — milestone settlement on Stellar",
  description:
    "Fund milestones in testnet USDC, submit public proof of work, and let a human reviewer decide. The AI advises; it cannot pay anyone.",
  icons: { icon: "/brand/sprintos-fox.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Permanent+Marker&display=swap"
        />
      </head>
      <body>
        <WalletProvider>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </WalletProvider>
      </body>
    </html>
  );
}

function SiteFooter() {
  return (
    <footer className="shell" style={{ padding: "3rem 0 2.5rem", marginTop: "4rem", borderTop: "1px solid var(--edge)" }}>
      <div className="spread">
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          SprintOS · Stellar testnet · Instawards with Stellar Türkiye
        </p>
        {/* The evidence pack is the link an Ambassador is given, so it has to be
            findable from any page rather than only from a message. */}
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          <Link href="/evidence" style={{ color: "inherit" }}>Evidence pack</Link>
        </p>
        <p className="faint mono" style={{ fontSize: "0.75rem" }}>
          Testnet only. No real funds move here.
        </p>
      </div>
    </footer>
  );
}
