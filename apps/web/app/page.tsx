import Link from "next/link";
import { FoxSculpture } from "@/components/FoxSculpture";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";

const PROBLEMS = [
  { icon: "milestone", title: "Scope shifts", body: "The target moves." },
  { icon: "link", title: "Proof scatters", body: "Evidence gets lost." },
  { icon: "wallet", title: "Payment waits", body: "Trust slows settlement." },
] satisfies Array<VisualItem>;

const SOLUTIONS = [
  { icon: "milestone", title: "Lock scope", body: "Criteria hashed." },
  { icon: "github", title: "Connect work", body: "GitHub linked." },
  { icon: "signature", title: "Human signs", body: "Decision authorized." },
  { icon: "wallet", title: "Funds settle", body: "On-chain payout." },
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
        {/* The three orbiting marks were unlabelled, which left the actual
            mechanism unsaid. Naming them is also where the category label that
            used to sit awkwardly above the ring has gone. */}
        <div className="rec-orbit-stage" aria-label="A milestone is proved, then paid">
          <span className="rec-orbit-word rec-orbit-word-left">Work</span>
          <span className="rec-orbit-word rec-orbit-word-right">Paid</span>
          <span className="rec-orbit-ring rec-orbit-ring-one" />
          <span className="rec-orbit-ring rec-orbit-ring-two" />
          <span className="rec-orbit-node rec-orbit-node-one">
            <ProductIcon name="milestone" size={20} />
            <b>Milestone</b>
          </span>
          <span className="rec-orbit-node rec-orbit-node-two">
            <ProductIcon name="github" size={20} />
            <b>Proof</b>
          </span>
          <span className="rec-orbit-node rec-orbit-node-three">
            <ProductIcon name="signature" size={20} />
            <b>Payment</b>
          </span>
          <FoxSculpture size={350} interactive idPrefix="hero" />
        </div>

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
        <VisualHeading index="01" eyebrow="The problem" title={<>Good work<br /><span className="rec-hot">gets stuck.</span></>} />
        <div className="rec-problem-grid">
          {PROBLEMS.map((item) => <VisualCard item={item} key={item.title} />)}
        </div>
      </section>

      <section className="rec-visual-section rec-solution-section shell" id="solution">
        <VisualHeading index="02" eyebrow="The SprintOS way" title={<>One clear<br /><span className="rec-hot">flow.</span></>} />
        <div className="rec-solution-flow">
          {SOLUTIONS.map((item, index) => (
            <div className="rec-solution-step" key={item.title}>
              <span className="rec-solution-index">0{index + 1}</span>
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
          index="03"
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

      <section className="rec-simple-trust shell" id="trust">
        <div className="rec-permission-visual" aria-hidden="true">
          <span><ProductIcon name="eye" size={31} /><b>Reads</b></span>
          <i>→</i>
          <FoxSculpture size={108} idPrefix="trust" />
          <i>→</i>
          <span className="is-human"><ProductIcon name="signature" size={31} /><b>Signs</b></span>
        </div>
        <h2>AI advises.<br /><span className="rec-hot">Human decides.</span></h2>
        <Link href="/app" className="btn btn-primary rec-cta-primary">Enter SprintOS</Link>
      </section>
    </div>
  );
}

function VisualHeading({ index, eyebrow, title }: { index: string; eyebrow: string; title: React.ReactNode }) {
  return (
    <header className="rec-visual-heading">
      <span>{index}</span>
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
