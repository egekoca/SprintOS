import Link from "next/link";
import { FoxMark } from "@/components/Logo";

const WORKSPACES = [
  {
    href: "/sponsor",
    index: "01",
    role: "Sponsor",
    title: "Define & fund",
    body: "Set the milestones, assign the parties, and fund the escrow with your wallet.",
    action: "Open sponsor desk",
  },
  {
    href: "/builder",
    index: "02",
    role: "Builder",
    title: "Submit evidence",
    body: "Find work assigned to your wallet and anchor public proof against each milestone.",
    action: "Open builder desk",
  },
  {
    href: "/review",
    index: "03",
    role: "Reviewer",
    title: "Review & settle",
    body: "Compare criteria, evidence, and advisory findings before signing a decision.",
    action: "Open reviewer desk",
  },
];

export default function AppGatewayPage() {
  return (
    <section className="shell app-gateway">
      <div className="app-gateway-heading">
        <div>
          <p className="eyebrow">SprintOS workspace</p>
          <h1>Choose your desk<span style={{ color: "var(--orange)" }}>.</span></h1>
        </div>
        <div className="app-gateway-mark" aria-hidden="true">
          <FoxMark size={112} decorative />
        </div>
        <p className="lede">
          Your connected wallet determines what you can sign. Every engagement remains publicly
          readable, while the contract independently enforces each role.
        </p>
      </div>

      <div className="workspace-grid">
        {WORKSPACES.map((workspace) => (
          <Link href={workspace.href} className="workspace-card" key={workspace.href}>
            <span className="workspace-index">{workspace.index}</span>
            <p className="eyebrow">{workspace.role}</p>
            <h2>{workspace.title}</h2>
            <p>{workspace.body}</p>
            <span className="workspace-action">{workspace.action} <b>↗</b></span>
          </Link>
        ))}
      </div>

      <div className="app-gateway-foot">
        <span className="mono faint">Stellar testnet · Publicly verifiable · Human authorized</span>
        <Link href="/review" className="badge-link">Browse public engagements →</Link>
      </div>
    </section>
  );
}
