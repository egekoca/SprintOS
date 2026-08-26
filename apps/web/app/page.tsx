import Link from "next/link";
import { FoxSculpture } from "@/components/FoxSculpture";
import { HeroOrbit } from "@/components/HeroOrbit";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";

const PROBLEMS = [
  {
    icon: "milestone",
    title: "The target moves",
    body: "What counted as done in week one is not what counts in week six, and nobody wrote the original down.",
  },
  {
    icon: "link",
    title: "The proof scatters",
    body: "A pull request here, a deploy link there, a screenshot in a DM. By review time nobody can assemble it.",
  },
  {
    icon: "wallet",
    title: "The money waits",
    body: "Payment turns on trust rather than evidence, so it arrives late, in one lump, or after an argument.",
  },
] satisfies Array<VisualItem>;

const SOLUTIONS = [
  {
    icon: "milestone",
    title: "Scope is fixed",
    body: "Requirements are hashed into the contract before work starts, so they cannot move afterwards.",
  },
  {
    icon: "github",
    title: "Work is attached",
    body: "The engagement points at a repository, so the work being judged is the work being paid for.",
  },
  {
    icon: "signature",
    title: "A person signs",
    body: "SprintOS scores the delivery against each requirement. A named human reads it and decides.",
  },
  {
    icon: "wallet",
    title: "Money moves",
    body: "The milestone's share leaves escrow on chain, carrying the address of whoever authorised it.",
  },
] satisfies Array<VisualItem>;

interface VisualItem {
  icon: ProductIconName;
  title: string;
  body: string;
}

export default function LandingPage() {
  return (
    <div className="rec rec-visual">
      <section className="rec-orbit-hero shell">
        <HeroOrbit />

        <div className="rec-orbit-message">
          <h1>Built. Proven.<br /><span className="rec-hot">Paid.</span></h1>
          <p className="rec-orbit-lede">
            Fund a milestone. Prove the work. <span className="rec-hot">A person releases the payment.</span>
          </p>
          <div className="rec-cta">
            <Link href="/app" className="btn btn-primary rec-cta-primary">Open SprintOS</Link>
            <a href="#problem" className="rec-cta-ghost">See why ↓</a>
          </div>
          <p className="rec-orbit-foot">Escrowed on Stellar · testnet · no AI holds a key</p>
        </div>
      </section>

      <section className="rec-visual-section shell" id="problem">
        <VisualHeading eyebrow="The problem" title={<>Good work<br /><span className="rec-hot">gets stuck.</span></>} />
        <div className="rec-problem-grid">
          {PROBLEMS.map((item) => <VisualCard item={item} key={item.title} />)}
        </div>
      </section>

      <section className="rec-visual-section rec-solution-section shell" id="solution">
        <VisualHeading eyebrow="The SprintOS way" title={<>One clear<br /><span className="rec-hot">flow.</span></>} />
        <div className="rec-solution-flow">
          {SOLUTIONS.map((item, index) => (
            <div className="rec-solution-step" key={item.title}>
              <span className="rec-solution-icon"><ProductIcon name={item.icon} size={30} /></span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              {index < SOLUTIONS.length - 1 && <i aria-hidden="true">→</i>}
            </div>
          ))}
        </div>
      </section>

      {/* Where the money actually sits. The claim "your funds are safe in the
          middle" is worth drawing rather than asserting: the contract holds the
          award, and the only arrow out of it is one a person signs. */}
      <section className="rec-visual-section shell" id="escrow">
        <VisualHeading
          eyebrow="Where the money sits"
          title={<>Held by a contract,<br /><span className="rec-hot">not by us.</span></>}
        />

        <div className="escrow-model">
          <div className="escrow-party">
            <ProductIcon name="wallet" size={26} />
            <b>Sponsor</b>
            <small>Commits the whole award up front</small>
          </div>

          <span className="escrow-arrow" aria-hidden="true">→</span>

          <div className="escrow-vault">
            <span className="escrow-vault-tag">Soroban contract</span>
            <strong>5,000 USDC</strong>
            <small>Locked. Nobody can spend it early — not the sponsor, not us, not the AI.</small>
            <span className="escrow-vault-keys">
              <ProductIcon name="shield" size={15} /> Keys held here: none
            </span>
          </div>

          <span className="escrow-arrow is-gated" aria-hidden="true">→</span>

          <div className="escrow-party">
            <ProductIcon name="github" size={26} />
            <b>Builder</b>
            <small>Paid one milestone at a time</small>
          </div>

          {/* The gate on the second arrow: the human signature. */}
          <div className="escrow-gate">
            <ProductIcon name="signature" size={20} />
            <b>A person signs each release</b>
            <small>
              The advisory AI can read the evidence and score it. It has no wallet and no contract
              method that moves a balance, so it cannot open this gate.
            </small>
          </div>
        </div>

        <div className="escrow-example">
          <p className="eyebrow">One milestone, end to end</p>
          <div className="wexample">
            <span className="wexample-cell"><b>5,000</b><small>USDC awarded</small></span>
            <i aria-hidden="true">→</i>
            <span className="wexample-cell"><b>4</b><small>milestones of 1,250</small></span>
            <i aria-hidden="true">→</i>
            <span className="wexample-cell"><b>1</b><small>delivered &amp; proved</small></span>
            <i aria-hidden="true">→</i>
            <span className="wexample-cell is-advisory"><b>87</b><small>advisory score /100</small></span>
            <i aria-hidden="true">→</i>
            <span className="wexample-cell is-human"><b>1,250</b><small>released by you</small></span>
          </div>
          <p className="wexample-note">
            The remaining 3,750 stays locked. If a milestone is never delivered, the sponsor
            reclaims it after the deadline.
          </p>
        </div>
      </section>

      {/* Two circles and an arrow said "reads" and "signs" without saying who,
          or what the difference buys anyone. The boundary is worth stating as
          two lists side by side: what the software may do, and what only a
          person may do. */}
      <section className="rec-simple-trust shell" id="trust">
        <h2>SprintOS advises.<br /><span className="rec-hot">A person decides.</span></h2>

        <div className="boundary">
          <article className="boundary-side is-advisory">
            <header>
              <span className="boundary-mark"><ProductIcon name="eye" size={22} /></span>
              <div>
                <p className="eyebrow">The software</p>
                <h3>Reads and reports</h3>
              </div>
            </header>
            <ul>
              <li><ProductIcon name="check" size={15} /> Opens every piece of public evidence</li>
              <li><ProductIcon name="check" size={15} /> Checks it against each written requirement</li>
              <li><ProductIcon name="check" size={15} /> Returns a cited score out of 100</li>
            </ul>
            <p className="boundary-cannot">
              No wallet. No signing key. No contract method that can move a balance.
            </p>
          </article>

          <span className="boundary-divider" aria-hidden="true">
            <FoxSculpture size={96} idPrefix="trust" />
          </span>

          <article className="boundary-side is-human">
            <header>
              <span className="boundary-mark"><ProductIcon name="signature" size={22} /></span>
              <div>
                <p className="eyebrow">A named person</p>
                <h3>Reads and decides</h3>
              </div>
            </header>
            <ul>
              <li><ProductIcon name="check" size={15} /> Reads the same record, and the report</li>
              <li><ProductIcon name="check" size={15} /> Approves, holds for revision, or refunds</li>
              <li><ProductIcon name="check" size={15} /> Signs the release with their own wallet</li>
            </ul>
            <p className="boundary-cannot is-human">
              The payment moves because they signed — never because the score was high.
            </p>
          </article>
        </div>

        <Link href="/app" className="btn btn-primary rec-cta-primary">Enter SprintOS</Link>
      </section>
    </div>
  );
}

function VisualHeading({ eyebrow, title }: { eyebrow: string; title: React.ReactNode }) {
  return (
    <header className="rec-visual-heading">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
    </header>
  );
}

function VisualCard({ item }: { item: VisualItem }) {
  return (
    <article className="rec-visual-card">
      <span><ProductIcon name={item.icon} size={38} /></span>
      <h3>{item.title}</h3>
      <p>{item.body}</p>
    </article>
  );
}
