"use client";

import { FoxSculpture } from "@/components/FoxSculpture";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";
import { SponsorEngagements } from "@/components/SponsorEngagements";
import { sinceWhen } from "@/lib/sponsor-plan";
import { RepositoryStep, ReviewStep, RolesStep, ScopeStep } from "./steps";
import { useEngagementSetup } from "./useEngagementSetup";

const STEPS: Array<{ label: string; icon: ProductIconName }> = [
  { label: "Repository", icon: "github" },
  { label: "Milestone plan", icon: "milestone" },
  { label: "Roles & wallet", icon: "wallet" },
  { label: "Review & fund", icon: "signature" },
];

/**
 * Setting up an engagement, in four steps that cannot be taken out of order.
 *
 * The rules and the state live in `useEngagementSetup`; each step is its own
 * component in `steps.tsx`. What is left here is the frame: the progress bar,
 * the restored-draft banner, and which step is on screen.
 */
export default function SponsorPage() {
  const setup = useEngagementSetup();
  const { step, progress, created, restored } = setup;

  return (
    <section className="shell sponsor-page sponsor-wizard" style={{ paddingBlock: "3rem" }}>
      <header className="sponsor-title-row">
        <div className="stack-s">
          <p className="eyebrow">New engagement</p>
          <h2>Set it up once<span className="rec-hot">.</span></h2>
          <p className="muted">SprintOS keeps each next step locked until the current one is complete.</p>
        </div>
        <div className="wizard-fox"><FoxSculpture size={92} idPrefix="wizard-head" /></div>
      </header>

      <nav className="wizard-steps" aria-label="Engagement setup progress">
        {STEPS.map((item, index) => {
          const number = index + 1;
          const reachable = number <= progress + 1;
          return (
            <button
              type="button"
              key={item.label}
              className={`${step === number ? "is-current" : ""}${number <= progress ? " is-complete" : ""}`}
              /* Once the engagement is signed, only the final step still means
                 anything — the earlier ones would offer edits the ledger will
                 not accept. */
              disabled={!reachable || Boolean(created && number < 4)}
              onClick={() => setup.setStep(number)}
            >
              <span><ProductIcon name={number <= progress ? "check" : item.icon} size={19} /></span>
              <b>0{number}</b>
              <small>{item.label}</small>
            </button>
          );
        })}
      </nav>

      {restored !== null && !created && (
        <div className="draft-banner">
          <ProductIcon name="milestone" size={18} />
          <p>
            <b>Picked up where you left off.</b> This setup was saved on this device{" "}
            {sinceWhen(restored)} and nothing has been signed or sent.
          </p>
          <button type="button" onClick={setup.discardDraft}>Start over</button>
        </div>
      )}

      {setup.error && <p className="notice">{setup.error}</p>}

      {step === 1 && <RepositoryStep setup={setup} />}
      {step === 2 && <ScopeStep setup={setup} />}
      {step === 3 && <RolesStep setup={setup} />}
      {step === 4 && <ReviewStep setup={setup} />}

      <SponsorEngagements />
    </section>
  );
}
