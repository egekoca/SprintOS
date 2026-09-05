import Link from "next/link";
import { FoxSculpture } from "@/components/FoxSculpture";
import { HeroOrbit } from "@/components/HeroOrbit";
import { MilestoneTree } from "@/components/MilestoneTree";
import { LiveTotals } from "@/components/LiveTotals";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";
import { Reveal } from "@/components/Reveal";

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
      {/* Taller than the screen on purpose: the extra height is the scroll the
          opening sequence runs on, while the stage inside stays pinned. */}
      <section className="rec-orbit-hero shell">
        <div className="rec-orbit-viewport">
          <HeroOrbit />

          <div className="rec-orbit-message">
            <h1>Built. Proven.<br /><span className="rec-hot">Paid.</span></h1>
            <p className="rec-orbit-lede">
              Fund a milestone. Prove the work. <span className="rec-hot">A person releases the payment.</span>
            </p>
            <div className="rec-cta">
              <Link href="/projects" className="btn btn-primary rec-cta-primary">Open SprintOS</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="rec-visual-section shell" id="problem">
        <VisualHeading eyebrow="The problem" title={<>Good work<br /><span className="rec-hot">gets stuck.</span></>} />
        <Reveal className="rec-problem-grid" motion="drop" stagger={170}>
          {PROBLEMS.map((item) => <VisualCard item={item} key={item.title} />)}
        </Reveal>
      </section>

      <section className="rec-visual-section rec-solution-section shell" id="solution">
        <VisualHeading eyebrow="The SprintOS way" title={<>One clear<br /><span className="rec-hot">flow.</span></>} />
        <Reveal className="rec-solution-flow" motion="wipe" stagger={90}>
          {SOLUTIONS.map((item, index) => (
            <div className="rec-solution-step" key={item.title}>
              <span className="rec-solution-icon"><ProductIcon name={item.icon} size={30} /></span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              {index < SOLUTIONS.length - 1 && <i aria-hidden="true">→</i>}
            </div>
          ))}
        </Reveal>
      </section>

      {/* Where the money actually sits. The claim is better shown than argued:
          one budget in at the top, four proved pieces out at the bottom. */}
      <section className="rec-visual-section shell" id="escrow">
        <VisualHeading
          eyebrow="Where the money sits"
          title={<>One budget,<br /><span className="rec-hot">three proofs.</span></>}
        />
        <MilestoneTree />
      </section>

      {/* The argument above is checkable, so state the checkable part. */}
      <LiveTotals />

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

        <Link href="/projects" className="btn btn-primary rec-cta-primary">Enter SprintOS</Link>
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
