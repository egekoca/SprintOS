import Link from "next/link";
import type { Metadata } from "next";
import { ProductIcon } from "@/components/ProductIcon";

export const metadata: Metadata = {
  title: "SprintOS — AI payment boundary",
  description: "Public proof that a perfect advisory score cannot approve or release a payment.",
};

const APPROVE_TX = "9085da84d543a32695089604e5fbf3a0449ebe97bb1f796061d8a10f4434ca9b";
const RELEASE_TX = "8e368dcf2c2886aa3149cdb70794c954da9d2fd81a963c7d58ce8ab9eafbeb55";
const REPORT_URL = "/api/advisory?engagement_id=2&milestone_idx=0&evidence_hash=243f8ae7bbfa484711fa8522423cd36b88b64d39f5a7ba198f8d9b2ba420773e";

const EXPLORER = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;

export default function AiBoundaryPage() {
  return (
    <div className="shell proof-page">
      <header className="proof-head">
        <p className="eyebrow">Evidence · Deliverable 2 · Contract boundary</p>
        <h1>AI cannot move money</h1>
        <p className="proof-lede">
          A perfect advisory score is still only an off-chain test input. Approval and payment require
          the wallet authorized in the engagement.
        </p>
        <div className="row proof-head-links">
          <Link href="/evidence" className="btn btn-ghost"><ProductIcon name="eye" size={17} /> Evidence pack</Link>
          <Link href="/docs#trust-model" className="btn btn-ghost"><ProductIcon name="link" size={17} /> Trust model</Link>
        </div>
      </header>

      <section className="proof-facts" aria-label="Boundary summary">
        <div><span className="proof-fact-label">Test vector</span><strong>100 / 100</strong><small>perfect advisory score</small></div>
        <div><span className="proof-fact-label">Binding</span><strong>false</strong><small>report cannot authorize a state change</small></div>
        <div><span className="proof-fact-label">AI transaction</span><strong>none</strong><small>the score is never an argument to the contract</small></div>
        <div><span className="proof-fact-label">Authority</span><strong>human wallet</strong><small>reviewer authorization is required</small></div>
      </section>

      <section className="proof-section">
        <div className="proof-section-heading">
          <p className="eyebrow">What is actually proven</p>
          <h2>The 100/100 vector is local and deterministic</h2>
        </div>
        <p>
          The contract test constructs an advisory report with <code>advisory_score: 100</code> and
          <code> binding: false</code>. With no reviewer authorization, approve and release fail; the
          escrow and builder balance remain unchanged. The test then adds the reviewer signature and the
          same milestone can be approved and released.
        </p>
        <div className="proof-callout">
          <ProductIcon name="shield" size={22} />
          <div>
            <strong>Important evidence distinction</strong>
            <span>There is no live “100 score transaction”. The report never enters the contract. That absence is the security property being demonstrated.</span>
          </div>
        </div>
        <div className="proof-links">
          <a href="https://github.com/egekoca/SprintOS/blob/main/contracts/settlement/src/test/ai_cannot_release.rs" target="_blank" rel="noreferrer">Read the contract test</a>
          <a href="https://github.com/egekoca/SprintOS/blob/main/scripts/check-boundaries.mjs" target="_blank" rel="noreferrer">Read the boundary check</a>
          <code>cargo test --package sprintos-settlement</code>
        </div>
      </section>

      <section className="proof-section">
        <div className="proof-section-heading">
          <p className="eyebrow">Attempt matrix</p>
          <h2>Only the configured human can cross the gate</h2>
        </div>
        <div className="proof-table-wrap">
          <table className="proof-table">
            <thead><tr><th>Attempt</th><th>Result</th><th>Reason</th></tr></thead>
            <tbody>
              <tr><td>100/100 report by itself</td><td className="proof-negative">Rejected</td><td>The report is off chain and non-binding.</td></tr>
              <tr><td>AI address calls <code>approve</code></td><td className="proof-negative">Rejected</td><td>Soroban requires the stored reviewer authorization.</td></tr>
              <tr><td>AI address calls <code>release</code></td><td className="proof-negative">Rejected</td><td>Release requires reviewer authorization and Approved state.</td></tr>
              <tr><td>Reviewer signs <code>approve</code></td><td className="proof-positive">Accepted</td><td>Human decision changes EvidenceSubmitted to Approved.</td></tr>
              <tr><td>Reviewer signs <code>release</code></td><td className="proof-positive">Accepted</td><td>Separate human signature moves the escrowed USDC.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="proof-section proof-live-section">
        <div className="proof-section-heading">
          <p className="eyebrow">Live Stellar testnet evidence</p>
          <h2>Engagement #2 was settled by two human signatures</h2>
        </div>
        <p>
          These are real testnet transactions from the public approval and release example. They prove
          the wallet-authorized path; they do not claim that an AI score performed either action.
        </p>
        <div className="proof-live-grid">
          <a className="proof-tx" href={EXPLORER(APPROVE_TX)} target="_blank" rel="noreferrer">
            <span className="proof-tx-label"><ProductIcon name="signature" size={17} /> Reviewer approval</span>
            <code>{APPROVE_TX}</code>
            <small>Open on Stellar Expert ↗</small>
          </a>
          <a className="proof-tx" href={EXPLORER(RELEASE_TX)} target="_blank" rel="noreferrer">
            <span className="proof-tx-label"><ProductIcon name="signature" size={17} /> Reviewer release</span>
            <code>{RELEASE_TX}</code>
            <small>Open on Stellar Expert ↗</small>
          </a>
        </div>
        <p className="proof-inline-links">
          <Link href="/e/2">Open the complete public engagement</Link> · <a href={REPORT_URL}>Read the stored advisory report</a>
        </p>
      </section>

      <section className="proof-next">
        <ProductIcon name="eye" size={18} />
        <p><strong>Screenshot to capture for the grant packet:</strong> `/review/2/0` with the criteria, evidence, advisory report and both manual decision controls visible, then this page with the two explorer transactions.</p>
      </section>
    </div>
  );
}
