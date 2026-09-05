import Link from "next/link";
import type { Metadata } from "next";
import { ProductIcon } from "@/components/ProductIcon";
import { DEPLOYMENT } from "@/lib/evidence";

export const metadata: Metadata = {
  title: "SprintOS — documentation",
  description:
    "Setup, workflow, trust model, verification and API notes for SprintOS.",
};

const NAV = [
  { href: "#getting-started", label: "Getting started" },
  { href: "#workflow", label: "Workflow" },
  { href: "#trust-model", label: "Trust model" },
  { href: "#evidence", label: "Evidence" },
  { href: "#reference", label: "Reference" },
  { href: "#verification", label: "Verification" },
];

const ENVIRONMENT = [
  ["NEXT_PUBLIC_APP_URL", "The public deployment URL. Required before writing evidence on chain."],
  ["BLOB_READ_WRITE_TOKEN", "Vercel Blob token for criteria, evidence, reports and activity."],
  ["OPENAI_API_KEY", "Optional advisory report and milestone-plan generation."],
  ["NEXT_PUBLIC_STELLAR_RPC_URL", "Optional testnet RPC override."],
  ["GITHUB_TOKEN", "Optional higher rate limit for public repository scans."],
] as const;

const ENDPOINTS = [
  ["GET", "/api/health", "Non-secret deployment diagnostics."],
  ["POST", "/api/criteria", "Validate and store acceptance criteria by hash."],
  ["POST", "/api/evidence", "Validate and store a builder evidence bundle by hash."],
  ["POST", "/api/advisory", "Run a requested, non-binding advisory report."],
  ["GET", "/api/advisory", "Read a stored report and verify its hash."],
  ["GET", "/api/activity?engagement_id=2", "Read indexed, network-verified transactions."],
] as const;

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

export default function DocsPage() {
  return (
    <div className="shell docs-page">
      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <div className="docs-sidebar-sticky">
            <p className="eyebrow">SprintOS docs</p>
            <p className="docs-sidebar-title">Milestone settlement with a human at the gate.</p>
            <nav className="docs-nav">
              {NAV.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
            </nav>
            <div className="docs-sidebar-links">
              <Link href="/evidence"><ProductIcon name="eye" size={15} /> Evidence pack</Link>
              <Link href="/evidence/ai-boundary"><ProductIcon name="shield" size={15} /> AI boundary proof</Link>
              <ExternalLink href="https://github.com/egekoca/SprintOS"><ProductIcon name="github" size={15} /> GitHub repository</ExternalLink>
            </div>
          </div>
        </aside>

        <div className="docs-content">
          <header className="docs-hero">
            <p className="eyebrow">Documentation · v0.1 testnet MVP</p>
            <h1>SprintOS</h1>
            <p className="docs-lede">
              A milestone review and settlement workflow on Stellar. The sponsor funds defined work,
              the builder submits public proof, and a human reviewer decides. AI can advise, but it
              cannot approve, sign, or move funds.
            </p>
            <div className="row docs-hero-links">
              <Link href="/projects" className="btn btn-primary"><ProductIcon name="milestone" size={17} /> Open the app</Link>
              <Link href="/evidence" className="btn btn-ghost"><ProductIcon name="eye" size={17} /> Evidence pack</Link>
            </div>
          </header>

          <section className="docs-section" id="getting-started">
            <p className="eyebrow">01 · Getting started</p>
            <h2>Run the app</h2>
            <p>
              SprintOS is a Next.js web app, a Soroban settlement contract and a separate advisory
              package. Reads work without a wallet. Every write is simulated, prepared and signed by
              the connected wallet.
            </p>
            <pre className="docs-code"><code>{`cp .env.example .env.local
pnpm install
pnpm dev`}</code></pre>
            <div className="docs-callout">
              <strong>Serverless storage is required on Vercel.</strong>
              <span>Create a Blob store in the project's Storage tab and connect it to the project.
                Vercel then adds <code>BLOB_READ_WRITE_TOKEN</code>. Never commit that token.</span>
            </div>
            <p>
              Set <code>NEXT_PUBLIC_APP_URL</code> to the deployed HTTPS origin before creating an
              engagement. That URL is written into the evidence pointer stored by the contract.
            </p>
            <p className="docs-inline-links">
              <Link href="/api/health">Check deployment health</Link> · <Link href="/evidence">Read the first-month evidence pack</Link>
            </p>
          </section>

          <section className="docs-section" id="workflow">
            <p className="eyebrow">02 · Workflow</p>
            <h2>One engagement, three roles</h2>
            <div className="docs-steps">
              <article>
                <span className="docs-step-number">01</span>
                <h3>Sponsor</h3>
                <p>Connect a wallet, choose a repository, define up to three milestones, assign distinct builder and reviewer wallets, then fund the escrow.</p>
              </article>
              <article>
                <span className="docs-step-number">02</span>
                <h3>Builder</h3>
                <p>Open the assigned milestone, attach up to five public evidence links, add a note, and sign the evidence hash on chain.</p>
              </article>
              <article>
                <span className="docs-step-number">03</span>
                <h3>Reviewer</h3>
                <p>Compare the criteria and evidence, optionally request the advisory report, attest to reading the work, then sign Approve or Hold.</p>
              </article>
              <article>
                <span className="docs-step-number">04</span>
                <h3>Settlement</h3>
                <p>Release is a separate reviewer signature. A sponsor can refund an eligible overdue milestone; an approved payment can also be claimed by its builder.</p>
              </article>
            </div>
            <div className="docs-callout docs-callout-muted">
              <strong>State changes are final on the deployed contract.</strong>
              <span>Criteria are hashed before creation, evidence is hashed at submission, and a released payment cannot be undone. Review before signing.</span>
            </div>
          </section>

          <section className="docs-section" id="trust-model">
            <p className="eyebrow">03 · Trust model</p>
            <h2>The AI is outside the money path</h2>
            <p>
              The advisory package reads bounded public evidence only when a reviewer asks for it. It
              returns a structured score, checklist, links and missing information. The report is stored
              off chain with a content hash and always has <code>binding: false</code>.
            </p>
            <div className="docs-boundary-grid">
              <div>
                <span className="docs-boundary-label">Can do</span>
                <ul>
                  <li>Read credential-free public evidence.</li>
                  <li>Produce a validated advisory report.</li>
                  <li>Suggest Ready for Review or Revision Suggested.</li>
                </ul>
              </div>
              <div>
                <span className="docs-boundary-label">Cannot do</span>
                <ul>
                  <li>Import Stellar SDK or signing code.</li>
                  <li>Approve, Hold, release, claim or refund.</li>
                  <li>Change milestone state or access private repositories.</li>
                </ul>
              </div>
            </div>
            <p className="docs-inline-links">
              <Link href="/evidence/ai-boundary">See the 100/100 boundary proof</Link> · <ExternalLink href="https://github.com/egekoca/SprintOS/blob/main/docs/SECURITY.md">Security model</ExternalLink>
            </p>
          </section>

          <section className="docs-section" id="evidence">
            <p className="eyebrow">04 · Evidence integrity</p>
            <h2>Documents are identified by their hashes</h2>
            <p>
              Criteria and evidence are canonicalized and SHA-256 hashed. The exact hash is stored in
              the milestone. The reviewer screen asks the server to retrieve the matching document and
              recompute the hash before enabling a decision.
            </p>
            <dl className="docs-definitions">
              <div><dt>Criteria</dt><dd>Written before creation; bound by the criteria hash in <code>create_engagement</code>.</dd></div>
              <div><dt>Evidence</dt><dd>Written by the builder; bound by the evidence hash in <code>submit_evidence</code>.</dd></div>
              <div><dt>Report</dt><dd>Keyed by engagement, milestone and evidence hash; an old report cannot silently follow a new submission.</dd></div>
              <div><dt>Activity</dt><dd>Transaction hashes are read back from RPC and decoded before the public index accepts them.</dd></div>
            </dl>
            <p className="docs-inline-links">
              <Link href="/e/2">Approval and release example</Link> · <Link href="/e/3">Hold and refund example</Link> · <Link href="/evidence">Full evidence pack</Link>
            </p>
          </section>

          <section className="docs-section" id="reference">
            <p className="eyebrow">05 · Reference</p>
            <h2>Configuration and endpoints</h2>
            <h3>Environment</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Variable</th><th>Purpose</th></tr></thead>
                <tbody>{ENVIRONMENT.map(([name, purpose]) => <tr key={name}><td><code>{name}</code></td><td>{purpose}</td></tr>)}</tbody>
              </table>
            </div>
            <h3>HTTP surface</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Method</th><th>Path</th><th>Purpose</th></tr></thead>
                <tbody>{ENDPOINTS.map(([method, path, purpose]) => <tr key={`${method}-${path}`}><td><code>{method}</code></td><td><code>{path}</code></td><td>{purpose}</td></tr>)}</tbody>
              </table>
            </div>
            <p>
              The deployed MVP is pinned to Stellar testnet. The settlement contract is <code>{DEPLOYMENT.contractId}</code> and the asset is the testnet USDC SAC <code>{DEPLOYMENT.usdcSacId}</code>.
            </p>
          </section>

          <section className="docs-section" id="verification">
            <p className="eyebrow">06 · Verification</p>
            <h2>Reproduce the claims</h2>
            <p>These checks require the repository but no wallet, secret key or API token.</p>
            <pre className="docs-code"><code>{`cargo test --package sprintos-settlement
pnpm test
pnpm typecheck
pnpm lint:boundaries
pnpm evidence:doc`}</code></pre>
            <div className="docs-verify-links">
              <Link href="/evidence/ai-boundary"><ProductIcon name="shield" size={16} /> AI boundary evidence</Link>
              <ExternalLink href="https://github.com/egekoca/SprintOS/blob/main/docs/SETUP.md"><ProductIcon name="link" size={16} /> Setup and usage</ExternalLink>
              <ExternalLink href="https://github.com/egekoca/SprintOS/blob/main/docs/ARCHITECTURE.md"><ProductIcon name="branch" size={16} /> Architecture</ExternalLink>
              <ExternalLink href={DEPLOYMENT.contractExplorer}><ProductIcon name="link" size={16} /> Stellar contract</ExternalLink>
            </div>
            <p className="docs-footnote">
              Mainnet settlement is deliberately not enabled in this release. It belongs to the second
              month scope and must be delivered with a separate mainnet deployment, a small explicit
              fund cap, manual wallet signatures, and public transaction evidence.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
