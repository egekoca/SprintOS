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
        <p className="rec-simple-kicker">Milestone settlement · Stellar</p>

        <div className="rec-orbit-stage" aria-label="Work moves from proof to settlement">
          <span className="rec-orbit-word rec-orbit-word-left">Proof</span>
          <span className="rec-orbit-word rec-orbit-word-right">Paid</span>
          <span className="rec-orbit-ring rec-orbit-ring-one" />
          <span className="rec-orbit-ring rec-orbit-ring-two" />
          <span className="rec-orbit-node rec-orbit-node-one"><ProductIcon name="github" size={20} /></span>
          <span className="rec-orbit-node rec-orbit-node-two"><ProductIcon name="milestone" size={20} /></span>
          <span className="rec-orbit-node rec-orbit-node-three"><ProductIcon name="signature" size={20} /></span>
          <FoxSculpture size={350} interactive idPrefix="hero" />
        </div>

        <div className="rec-orbit-message">
          <h1>Built. Proven.<br /><span className="rec-hot">Paid.</span></h1>
          <p>Work settled with proof.</p>
          <div className="rec-cta">
            <Link href="/app" className="btn btn-primary rec-cta-primary">Open SprintOS</Link>
            <a href="#problem" className="rec-cta-ghost">See why ↓</a>
          </div>
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
