"use client";

import Link from "next/link";
import { FoxSpinner } from "@/components/FoxLoader";
import { FoxSculpture } from "@/components/FoxSculpture";
import { GitHubRepositoryPanel } from "@/components/GitHubRepositoryPanel";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";
import { TxLink } from "@/components/TxLink";
import { formatUsdc } from "@/lib/stellar/config";
import { formatMoment } from "@/lib/sponsor-draft";
import { MAX_EXTRA_REVIEWERS, shortAccount } from "@/lib/sponsor-plan";
import { MilestoneEditor } from "./MilestoneEditor";
import type { EngagementSetup } from "./useEngagementSetup";

/**
 * The four steps of the wizard, one component each.
 *
 * They all read the same setup object and hold no state of their own, so the
 * rule that each step stays locked until the previous one is complete lives in
 * exactly one place instead of being re-implemented four times.
 */

/** Step 1 — where the work lives. */
export function RepositoryStep({ setup }: { setup: EngagementSetup }) {
  return (
    <div className="wizard-stage">
      <GitHubRepositoryPanel onRepositorySelected={setup.selectRepository} onImport={setup.importMilestones} />
      <WizardActions nextLabel="Continue to scope" nextDisabled={!setup.sourceReady} onNext={() => setup.setStep(2)} />
    </div>
  );
}

/** Step 2 — what will be delivered, when, and for how much. */
export function ScopeStep({ setup }: { setup: EngagementSetup }) {
  const { milestones, grantTarget, total, remaining } = setup;

  return (
    <div className="wizard-stage">
      <div className="wizard-stage-heading">
        <div><p className="eyebrow">02 · Scope</p><h3>Turn the brief into a plan</h3></div>
        <span className="source-chip">
          <ProductIcon name="github" size={15} /> {setup.repository?.repository.full_name}
        </span>
      </div>

      <div className="scope-mode-tabs">
        <button type="button" className={setup.scopeMode === "ai" ? "is-active" : ""} onClick={() => setup.setScopeMode("ai")}>
          <ProductIcon name="scan" size={18} /> AI from brief
        </button>
        <button type="button" className={setup.scopeMode === "manual" ? "is-active" : ""} onClick={setup.startManualPlan}>
          <ProductIcon name="milestone" size={18} /> Manual
        </button>
      </div>

      {setup.scopeMode === "ai" && (
        <section className="brief-composer">
          <div className={`brief-fox${setup.planning ? " is-thinking" : ""}`}>
            <FoxSculpture size={132} idPrefix="planner" />
            <span>{setup.planning ? "Reading your brief…" : "I’ll find outcomes, dates and criteria."}</span>
          </div>
          <div className="brief-input">
            <label htmlFor="project-brief">Paste a project brief or requirements document</label>
            <textarea
              id="project-brief"
              rows={9}
              maxLength={20_000}
              value={setup.brief}
              onChange={(event) => setup.setBrief(event.target.value)}
              placeholder="What are you building? Include deliverables, dates, phases and what success looks like…"
            />
            <div className="brief-actions">
              <label className="btn btn-ghost brief-upload">
                <ProductIcon name="link" size={17} /> Upload text document
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,application/json"
                  onChange={(event) => void setup.readBriefFile(event.target.files?.[0])}
                />
              </label>
              <span>{setup.brief.length.toLocaleString()} / 20,000</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={setup.planning || setup.brief.trim().length < 30}
                onClick={setup.analyzeBrief}
              >
                {setup.planning
                  ? <><FoxSpinner /> Building plan…</>
                  : <><ProductIcon name="scan" size={18} /> Generate milestones</>}
              </button>
            </div>
          </div>
        </section>
      )}

      {setup.planNotice && <p className="notice notice-ok">{setup.planNotice}</p>}
      {setup.planSummary && <p className="plan-summary"><span>Project</span>{setup.planSummary}</p>}

      {milestones.length > 0 && (
        <section className="budget-bar">
          <div className="field budget-total">
            <label htmlFor="grant-total">Total award (optional)</label>
            <input
              id="grant-total"
              type="text"
              inputMode="decimal"
              value={setup.grantTotal}
              onChange={(event) => setup.setGrantTotal(event.target.value)}
              placeholder="5000"
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={setup.distributeEvenly}
            disabled={grantTarget === null || grantTarget <= 0n}
          >
            Split across {milestones.length} milestone{milestones.length === 1 ? "" : "s"}
          </button>
          <div className="budget-readout">
            <span><small>Allocated</small><b>{formatUsdc(total)}</b></span>
            {remaining !== null && (
              <span className={remaining === 0n ? "is-balanced" : remaining < 0n ? "is-over" : ""}>
                <small>{remaining < 0n ? "Over by" : "Unallocated"}</small>
                <b>{formatUsdc(remaining < 0n ? -remaining : remaining)}</b>
              </span>
            )}
          </div>
          <p className="budget-hint">
            Enter the whole award and split it, or leave this blank and price each milestone
            directly below. Either way the escrow is funded with the allocated total.
          </p>
        </section>
      )}

      {milestones.length > 0 && (
        <MilestoneEditor
          milestones={milestones}
          update={setup.update}
          remove={setup.removeMilestone}
          add={setup.addMilestone}
        />
      )}

      <WizardActions
        back
        onBack={() => setup.setStep(1)}
        nextLabel="Confirm plan"
        nextDisabled={!setup.milestonesReady}
        nextHint={setup.planProblem ?? undefined}
        onNext={() => setup.setStep(3)}
      />
    </div>
  );
}

/** Step 3 — who builds it and who decides whether it was built. */
export function RolesStep({ setup }: { setup: EngagementSetup }) {
  const { address } = setup;

  return (
    <div className="wizard-stage">
      <div className="wizard-stage-heading">
        <div><p className="eyebrow">03 · Roles</p><h3>Assign the people</h3></div>
        <span className="source-chip">
          <ProductIcon name="milestone" size={15} /> {setup.milestones.length} milestones · {formatUsdc(setup.total)} USDC
        </span>
      </div>

      <div className="roles-gate">
        <div className="panel stack">
          <div className="sponsor-section-title">
            <span><ProductIcon name="wallet" size={22} /></span>
            <div><p className="eyebrow">Sponsor</p><h3>Your wallet</h3></div>
          </div>
          {address ? (
            <p className="wallet-ready">
              <ProductIcon name="check" size={17} />
              <span>Connected</span>
              <b>{shortAccount(address)}</b>
            </p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={setup.connect}>
              <ProductIcon name="wallet" size={18} /> Connect wallet
            </button>
          )}
        </div>

        <div className="panel stack">
          <div className="field">
            <label htmlFor="builder">Builder wallet address</label>
            <input id="builder" type="text" placeholder="G…" value={setup.builder} onChange={(event) => setup.setBuilder(event.target.value)} />
            <small className="field-hint">The account that submits proof and receives each released milestone.</small>
          </div>

          <div className="field">
            <span className="group-label" id="deciders-label">Who can release the money?</span>
            <div className="deciders" role="group" aria-labelledby="deciders-label">
              <p className="decider-you">
                <ProductIcon name="check" size={16} />
                <span>
                  <b>You do{address ? ` — ${shortAccount(address)}` : ""}.</b> You wrote the
                  milestones and you are funding them, so your wallet decides every payout.
                  Nothing below is required.
                </span>
              </p>

              {setup.extraReviewers.map((who, index) => (
                <div className="decider-row" key={index}>
                  <input
                    type="text"
                    placeholder="G…"
                    value={who}
                    aria-label={`Authorised wallet ${index + 1}`}
                    onChange={(event) => setup.updateReviewer(index, event.target.value)}
                  />
                  <button
                    type="button"
                    className="decider-remove"
                    onClick={() => setup.removeReviewer(index)}
                    aria-label={`Remove authorised wallet ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              ))}

              {setup.extraReviewers.length < MAX_EXTRA_REVIEWERS && (
                <button type="button" className="decider-add" onClick={setup.addReviewer}>
                  + Authorise another wallet
                </button>
              )}

              <small className="field-hint">
                Anyone you add can read the evidence and release payments on this engagement,
                acting on their own. You can add or remove them later. The builder can never
                be added.
              </small>
            </div>
          </div>
        </div>
      </div>

      <WizardActions
        back
        onBack={() => setup.setStep(2)}
        nextLabel="Review engagement"
        nextDisabled={!setup.rolesReady}
        nextHint={setup.roleProblem ?? undefined}
        onNext={() => setup.setStep(4)}
      />
    </div>
  );
}

/** Step 4 — read it all once more, then sign it into the ledger. */
export function ReviewStep({ setup }: { setup: EngagementSetup }) {
  const { milestones, total, created, funded, busy } = setup;

  return (
    <div className="wizard-stage">
      <div className="wizard-stage-heading">
        <div><p className="eyebrow">04 · Final review</p><h3>Everything in one view</h3></div>
        <span className="amount">{formatUsdc(total)} <small>USDC</small></span>
      </div>

      <div className="review-receipt">
        <ReceiptRow icon="github" label="Repository" value={setup.repository?.repository.full_name ?? "—"} />
        <ReceiptRow icon="wallet" label="Builder" value={shortAccount(setup.builder)} />
        <ReceiptRow
          icon="signature"
          label="Decides payouts"
          value={
            setup.extraReviewers.filter(Boolean).length === 0
              ? `${shortAccount(setup.address ?? "")} · you`
              : `you, plus ${setup.extraReviewers.filter(Boolean).length} more`
          }
        />
        {milestones.map((milestone, index) => (
          <div className="receipt-milestone" key={`${milestone.title}-${index}`}>
            <span>0{index + 1}</span>
            <div>
              <strong>{milestone.title}</strong>
              <small>
                {formatMoment(milestone.startDate, milestone.startTime)} → {formatMoment(milestone.deadline, milestone.deadlineTime)}
              </small>
              <ul>
                {milestone.criteria.filter(Boolean).map((criterion, criterionIndex) => (
                  <li key={`${criterionIndex}-${criterion}`}>{criterion}</li>
                ))}
              </ul>
            </div>
            <b>{milestone.amount} USDC</b>
          </div>
        ))}
      </div>

      {!created ? <CommitGate setup={setup} /> : (
        <div className="panel panel-marked stack sponsor-sign-panel">
          <p className="notice notice-ok">Engagement created.</p>
          <TxLink hash={created.hash} />
          <div className="row">
            <div className="field" style={{ maxWidth: "10rem" }}>
              <label htmlFor="eid">Engagement id</label>
              <input id="eid" type="text" value={setup.engagementId} readOnly aria-readonly="true" />
            </div>
            {!funded && (
              <button type="button" className="btn btn-primary" onClick={setup.handleFund} disabled={busy !== null || !setup.engagementId}>
                {busy === "fund" ? <><FoxSpinner /> Funding escrow…</> : `Fund ${formatUsdc(total)} USDC`}
              </button>
            )}
          </div>
          {funded && (
            <div className="stack-s">
              <p className="notice notice-ok">Escrow funded.</p>
              <TxLink hash={funded.hash} />
              <Link href={`/e/${setup.engagementId}`} className="badge-link">Open engagement →</Link>
            </div>
          )}
        </div>
      )}

      {!created && <WizardActions back onBack={() => setup.setStep(3)} />}
    </div>
  );
}

/**
 * The last thing between the sponsor and an unchangeable set of terms.
 *
 * Two separate gates on purpose. The checkbox is an attestation that the plan
 * above has actually been read; the confirmation after it is the moment the
 * wallet is about to open. Collapsing them into one button would make the most
 * irreversible action in the product a single click.
 */
function CommitGate({ setup }: { setup: EngagementSetup }) {
  const { milestones, total, busy } = setup;
  const requirements = milestones.reduce((count, milestone) => count + milestone.criteria.filter(Boolean).length, 0);

  return (
    <div className="commit-gate">
      <div className="commit-warning">
        <ProductIcon name="shield" size={22} />
        <div>
          <h3>This is the last point you can change anything</h3>
          <p>
            Signing hashes every milestone, requirement, date and amount into the contract.
            After that they are fixed for good — not by policy, but because the builder is
            working against them and the ledger has recorded them. There is no edit screen
            later, and nobody can add or reword a requirement once work has started.
          </p>
        </div>
      </div>

      <ul className="commit-facts">
        <li><span>{milestones.length}</span> milestone{milestones.length === 1 ? "" : "s"}, fixed</li>
        <li><span>{requirements}</span> requirements, fixed</li>
        <li><span>{formatUsdc(total)}</span> USDC committed to escrow</li>
        <li><span>You{setup.extraReviewers.filter(Boolean).length > 0 ? ` +${setup.extraReviewers.filter(Boolean).length}` : ""}</span> will decide each payout</li>
      </ul>

      <label className="attest">
        <input
          type="checkbox"
          checked={setup.readEverything}
          onChange={(event) => { setup.setReadEverything(event.target.checked); setup.setConfirming(false); }}
        />
        <span>
          I have read every milestone and requirement above, and I understand they cannot be
          edited after this signature.
        </span>
      </label>

      {!setup.confirming ? (
        <div className="wizard-sign">
          <FoxSculpture size={108} idPrefix="final-sign" />
          <div>
            <h3>Ready when you are</h3>
            <p>One more confirmation before your wallet opens.</p>
          </div>
          <button type="button" className="btn btn-primary" disabled={!setup.readEverything} onClick={() => setup.setConfirming(true)}>
            <ProductIcon name="signature" size={18} /> Continue to sign
          </button>
        </div>
      ) : (
        <div className="commit-confirm">
          <p className="commit-confirm-question">
            Lock {milestones.length} milestone{milestones.length === 1 ? "" : "s"} and{" "}
            {formatUsdc(total)} USDC into engagement terms that can never be changed?
          </p>
          <div className="commit-confirm-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setup.setConfirming(false)} disabled={busy !== null}>
              No — let me change something
            </button>
            <button type="button" className="btn btn-primary" onClick={setup.handleCreate} disabled={busy !== null}>
              {busy === "create" ? <><FoxSpinner /> Waiting for signature…</> : "Yes, lock and sign"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WizardActions({
  back = false, onBack, onNext, nextLabel, nextDisabled = false, nextHint,
}: {
  back?: boolean;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextHint?: string;
}) {
  return (
    <div className="wizard-actions">
      {back ? <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button> : <span />}
      {nextLabel && (
        <div>
          <small>{nextHint}</small>
          <button type="button" className="btn btn-primary" disabled={nextDisabled} onClick={onNext}>
            {nextLabel} →
          </button>
        </div>
      )}
    </div>
  );
}

function ReceiptRow({ icon, label, value }: { icon: ProductIconName; label: string; value: string }) {
  return (
    <div className="receipt-row">
      <span><ProductIcon name={icon} size={18} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
