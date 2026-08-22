import Link from "next/link";
import { SETTLEMENT_CONTRACT_ID, explorerContract, shortAddress } from "@/lib/stellar/config";

/**
 * The landing page.
 *
 * It has one job: make the guarantee legible before anyone connects a wallet.
 * The hero puts the AI panel and the human panel side by side, in the exact
 * treatment they get inside the app — grey and dashed against orange and solid
 * — so the security model is something you see, not something you read about.
 */
export default function HomePage() {
  return (
    <>
      <section className="shell" style={{ paddingBlock: "clamp(3rem, 8vw, 6rem) 3rem" }}>
        <div className="stack-l">
          <div className="stack">
            <span className="tape-label">Stellar testnet · Instawards</span>

            <h1 style={{ maxWidth: "16ch" }}>
              The AI reads<br />
              the receipts.<br />
              <span className="stencil">You sign</span>{" "}
              <span style={{ position: "relative", display: "inline-block" }}>
                the cheque.
                <Drip />
              </span>
            </h1>

            <p className="lede">
              Sponsors lock milestone payments in testnet USDC. Builders submit public proof of
              work. An advisory module reads the evidence against the criteria and writes a
              report — then gets out of the way, because it has no wallet, no key, and no
              function to call.
            </p>

            <div className="row" style={{ marginTop: "0.5rem" }}>
              <Link href="/review" className="btn btn-primary">Open the reviewer desk</Link>
              <Link href="/sponsor" className="btn btn-ghost">Fund an engagement</Link>
            </div>

            <a
              href={explorerContract(SETTLEMENT_CONTRACT_ID)}
              target="_blank"
              rel="noreferrer"
              className="badge-link"
              style={{ marginTop: "0.5rem" }}
            >
              Contract {shortAddress(SETTLEMENT_CONTRACT_ID, 8, 6)} — live on testnet ↗
            </a>
          </div>

          <Thesis />
        </div>
      </section>

      <section className="shell" style={{ paddingBlock: "2rem 1rem" }}>
        <hr className="hr-spray" />
      </section>

      <Flow />
      <Guarantees />
    </>
  );
}

/** A paint drip running off the headline. Decorative only. */
function Drip() {
  return (
    <svg
      aria-hidden="true"
      className="drip"
      width="100%"
      height="26"
      viewBox="0 0 200 26"
      preserveAspectRatio="none"
      style={{ position: "absolute", left: 0, right: 0, top: "100%", opacity: 0.85 }}
    >
      <path d="M18 0 v13 a3 3 0 0 0 6 0 V0 Z" fill="currentColor" />
      <path d="M78 0 v20 a3.5 3.5 0 0 0 7 0 V0 Z" fill="currentColor" />
      <path d="M150 0 v9 a2.5 2.5 0 0 0 5 0 V0 Z" fill="currentColor" />
    </svg>
  );
}

/** The two panels, in the treatment they carry throughout the app. */
function Thesis() {
  return (
    <div className="grid-2">
      <div className="advisory">
        <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Advisory · non-binding</p>
        <div className="row" style={{ gap: "1rem", alignItems: "baseline" }}>
          <span className="advisory-score">92</span>
          <span className="mono" style={{ fontSize: "0.8125rem" }}>ReadyForReview</span>
        </div>
        <p style={{ fontSize: "0.9375rem", marginTop: "0.75rem" }}>
          Five criteria checked against five public links. Every claim cited. Anything it could
          not see is marked <span className="mono">cannot_verify</span>, never{" "}
          <span className="mono">not_met</span>.
        </p>
        <p className="advisory-banner" style={{ marginTop: "1rem" }}>
          No wallet · no signing key · no contract permission
        </p>
      </div>

      <div className="panel" style={{ borderColor: "var(--orange)", boxShadow: "0 0 0 3px rgba(250,100,25,0.08)" }}>
        <p className="eyebrow" style={{ color: "var(--orange-lo)", marginBottom: "0.75rem" }}>
          Human decision · binding
        </p>
        <p style={{ fontSize: "0.9375rem", color: "var(--chalk-dim)" }}>
          The assigned reviewer reads the same evidence, disagrees with the score if they like,
          and signs with their own wallet. That signature is the only thing on this page that
          moves money.
        </p>
        <div className="row" style={{ marginTop: "1.25rem" }}>
          <span className="btn btn-primary btn-sm">Approve</span>
          <span className="btn btn-hold btn-sm">Hold</span>
        </div>
        <p className="mono faint" style={{ fontSize: "0.75rem", marginTop: "1rem" }}>
          reviewer.require_auth()
        </p>
      </div>
    </div>
  );
}

const STEPS = [
  { n: "01", title: "Define", body: "The sponsor writes up to three milestones — a title, up to five acceptance criteria, an amount, and a deadline. The criteria are hashed onto the ledger so nobody can quietly rewrite them later." },
  { n: "02", title: "Fund", body: "The full total moves into escrow in one transaction. All or nothing: a sponsor cannot advertise three milestones while backing one." },
  { n: "03", title: "Submit", body: "The builder attaches up to five public links — a repo, a commit, a pull request, a test run, docs, a demo. The bundle is hashed on chain too." },
  { n: "04", title: "Advise", body: "On request only, the module fetches those public sources, compares them to the criteria, and writes a report. It never runs code, never opens a private repo, and never watches anything in the background." },
  { n: "05", title: "Decide", body: "The reviewer reads criteria, evidence and report side by side, attests that they checked the work themselves, and chooses Approve or Hold." },
  { n: "06", title: "Settle", body: "Release pays the builder. Or the deadline passes and the sponsor reclaims. Either way a human wallet signs, and the transaction hash is on the engagement page." },
];

function Flow() {
  return (
    <section className="shell" style={{ paddingBlock: "3rem" }}>
      <div className="stack-l">
        <div className="stack-s">
          <p className="eyebrow">How a milestone settles</p>
          <h2>Six steps, two signatures<span style={{ color: "var(--orange)" }}>.</span></h2>
        </div>
        <div className="grid-3">
          {STEPS.map((step) => (
            <article key={step.n} className="panel stack-s">
              <span className="stencil-num">{step.n}</span>
              <h3 style={{ color: "var(--chalk)" }}>{step.title}</h3>
              <p style={{ fontSize: "0.9375rem", color: "var(--chalk-dim)" }}>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const GUARANTEES = [
  {
    label: "In the contract",
    body: "No function accepts a score, a recommendation, or any advisory input. There is no admin, no pause, no upgrade hatch, and no set_status. There is nothing to talk into paying out.",
  },
  {
    label: "In the build",
    body: "The advisory package is forbidden from importing any Stellar SDK, and CI fails if someone adds one. The boundary is enforced at build time, not described in a README.",
  },
  {
    label: "In the tests",
    body: "test_ai_score_100_cannot_release builds a perfect 100/100 report and tries every payout path with its own signature. USDC moves only after the human reviewer approves; then the reviewer may release it or the builder may claim it.",
  },
];

function Guarantees() {
  return (
    <section className="shell" style={{ paddingBlock: "1rem 3rem" }}>
      <div className="panel panel-marked stack">
        <div className="stack-s">
          <p className="eyebrow">Why a score of 100 still pays nobody</p>
          <h2 style={{ maxWidth: "20ch" }}>
            Proved three times over<span className="tag" style={{ marginLeft: "0.5rem", fontSize: "0.5em" }}>no shortcuts</span>
          </h2>
        </div>
        <div className="grid-3">
          {GUARANTEES.map((g) => (
            <div key={g.label} className="stack-s">
              <span className="pill pill-neutral">{g.label}</span>
              <p style={{ fontSize: "0.9375rem", color: "var(--chalk-dim)" }}>{g.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
