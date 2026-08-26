import Link from "next/link";
import { FoxSculpture } from "@/components/FoxSculpture";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";

/**
 * The workspace entry page.
 *
 * This used to carry the full explanation of the model — six stages, a worked
 * example, the escrow argument. All of that now lives on the landing page,
 * where someone deciding whether to use SprintOS actually reads it. Anyone who
 * has already opened the app wants to *do* something, so the primary action
 * comes first and the recap is a line with a link to the long version.
 */

/** What setting up an award involves, so starting is not a leap of faith. */
const SETUP_STEPS: Array<{ icon: ProductIconName; title: string; body: string }> = [
  {
    icon: "github",
    title: "Point it at a repository",
    body: "Sign in to GitHub or paste any public repo URL. Existing GitHub milestones and issues can become your acceptance criteria.",
  },
  {
    icon: "milestone",
    title: "Write the milestones",
    body: "Enter one total and split it, or price each milestone directly. Each gets dates and the requirements that must be true at delivery.",
  },
  {
    icon: "signature",
    title: "Assign and fund",
    body: "Name the builder, decide who reviews, then sign once. The criteria are hashed and the escrow is funded in the same step.",
  },
];

const DESKS: Array<{
  href: string;
  icon: ProductIconName;
  role: string;
  title: string;
  when: string;
}> = [
  {
    href: "/awards",
    icon: "milestone",
    role: "Any role",
    title: "Your awards",
    when: "Everything this wallet takes part in",
  },
  {
    href: "/builder",
    icon: "scan",
    role: "Builder",
    title: "Submit proof",
    when: "You are doing the work",
  },
  {
    href: "/review",
    icon: "signature",
    role: "Reviewer",
    title: "Score & release",
    when: "You decide whether it gets paid",
  },
];

export default function AppGatewayPage() {
  return (
    <div className="workspace">
      <section className="shell workspace-intro">
        <div>
          <p className="eyebrow">SprintOS workspace</p>
          <h1>
            One grant.<br />
            Several milestones.<br />
            <span className="rec-hot">One human signature.</span>
          </h1>
          <p className="lede">
            The award is locked in a contract and released a milestone at a time, and every release
            is somebody&rsquo;s signed decision.{" "}
            <Link href="/#escrow" className="badge-link">See how it is held →</Link>
          </p>
        </div>
        <div className="workspace-mark" aria-hidden="true">
          <FoxSculpture size={168} interactive idPrefix="workspace" />
        </div>
      </section>

      {/* The primary action, and what it will ask of you before you commit. */}
      <section className="shell start-band">
        <div className="start-band-head">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>Set up a new award</h2>
            <p className="muted">Three steps, one signature at the end. Nothing moves until you sign.</p>
          </div>
          <Link href="/sponsor" className="btn btn-primary start-band-cta">
            <ProductIcon name="milestone" size={18} /> Create an award
          </Link>
        </div>

        <ol className="start-steps">
          {SETUP_STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="start-step-icon"><ProductIcon name={step.icon} size={20} /></span>
              <span className="start-step-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="shell workspace-desks">
        <header className="workspace-section-head">
          <p className="eyebrow">Or pick up where you left off</p>
          <h2>Your desks</h2>
        </header>

        <div className="wdesk-grid">
          {DESKS.map((desk) => (
            <Link href={desk.href} className="wdesk" key={desk.href}>
              <span className="wdesk-icon">
                <ProductIcon name={desk.icon} size={24} />
              </span>
              <p className="eyebrow">{desk.role}</p>
              <h3>{desk.title}</h3>
              <small className="wdesk-when">{desk.when}</small>
              <span className="wdesk-go">
                Open <b>↗</b>
              </span>
            </Link>
          ))}
        </div>

        <div className="workspace-foot">
          <span className="mono faint">Stellar testnet · Publicly verifiable · Human authorized</span>
          <Link href="/review" className="badge-link">Browse public engagements →</Link>
        </div>
      </section>
    </div>
  );
}
