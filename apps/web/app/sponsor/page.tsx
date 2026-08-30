"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { createEngagement, fundEngagement, type MilestoneDraft } from "@/lib/stellar/contract";
import { formatUsdc, parseUsdc, usdcInputValue } from "@/lib/stellar/config";
import { TxLink } from "@/components/TxLink";
import { FoxSpinner } from "@/components/FoxLoader";
import { FoxSculpture } from "@/components/FoxSculpture";
import { GitHubRepositoryPanel, type ImportedMilestone } from "@/components/GitHubRepositoryPanel";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";
import { SponsorEngagements } from "@/components/SponsorEngagements";
import type { GitHubRepositorySnapshot } from "@/lib/github";
import {
  clearDraft,
  deadlineSeconds,
  formatMoment,
  loadDraft,
  saveDraft,
  startSeconds,
  type MilestoneForm,
} from "@/lib/sponsor-draft";
import type { MilestonePlan } from "@sprintos/advisory";
import { MAX_CRITERIA, MAX_MILESTONES } from "@sprintos/schemas/milestone";
import { StrKey } from "@stellar/stellar-sdk";

const STEPS: Array<{ label: string; icon: ProductIconName }> = [
  { label: "Repository", icon: "github" },
  { label: "Milestone plan", icon: "milestone" },
  { label: "Roles & wallet", icon: "wallet" },
  { label: "Review & fund", icon: "signature" },
];

function dateAfter(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/* Numbered on creation rather than only hinted at through a placeholder: an
   untitled milestone is never what anyone wants, and "Milestone 3" is both a
   working answer and an obvious thing to type over. */
function autoTitle(index: number): string {
  return `Milestone ${index + 1}`;
}

function emptyMilestone(index = 0): MilestoneForm {
  return {
    title: autoTitle(index),
    summary: "",
    criteria: [""],
    amount: "",
    startDate: dateAfter(index * 14),
    deadline: dateAfter(index * 14 + 13),
    startTime: "",
    deadlineTime: "",
  };
}

/* Keep the automatic names in step with the list after a removal, while leaving
   any title the sponsor actually wrote exactly as they wrote it. Deleting the
   second of four should not leave "Milestone 1, 3, 4" behind, and must not
   rename "Escrow and settlement" either. */
function renumber(milestones: MilestoneForm[]): MilestoneForm[] {
  return milestones.map((milestone, index) => (
    /^Milestone \d+$/.test(milestone.title) ? { ...milestone, title: autoTitle(index) } : milestone
  ));
}

function milestoneProblem(milestone: MilestoneForm): string | null {
  if (!milestone.title.trim()) return "Give every milestone a title.";
  if (new TextEncoder().encode(milestone.title.trim()).length > 200) return "Keep milestone titles under 200 bytes.";
  if (!milestone.startDate || !milestone.deadline) return "Add a start date and due date to every milestone.";
  const deadline = deadlineSeconds(milestone);
  if (!Number.isFinite(deadline)) return "Check the dates on every milestone.";
  if (deadline <= startSeconds(milestone)) return "A milestone cannot be due before it starts.";
  if (deadline * 1000 <= Date.now()) return "Every milestone due date must still be in the future.";

  const criteria = milestone.criteria.map((criterion) => criterion.trim()).filter(Boolean);
  if (criteria.length === 0) return "Add at least one checkable criterion to every milestone.";
  if (criteria.some((criterion) => criterion.length < 4 || criterion.length > 500)) {
    return "Each filled criterion must contain between 4 and 500 characters.";
  }
  try {
    if (parseUsdc(milestone.amount) <= 0n) return "Every milestone needs an amount greater than zero.";
  } catch {
    return "Enter a valid USDC amount with no more than 7 decimal places.";
  }
  return null;
}

function accountIsValid(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value.trim());
}

export default function SponsorPage() {
  const { address, connect } = useWallet();
  const [step, setStep] = useState(1);
  const [repository, setRepository] = useState<GitHubRepositorySnapshot | null>(null);
  const [scopeMode, setScopeMode] = useState<"ai" | "manual">("ai");
  const [brief, setBrief] = useState("");
  const [planSummary, setPlanSummary] = useState("");
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [builder, setBuilder] = useState("");
  const [reviewer, setReviewer] = useState("");
  /* The sponsor may keep the decision themselves. The contract still records a
     reviewer address — it is simply the sponsor's own. */
  const [selfReview, setSelfReview] = useState(false);
  /* The award as a single figure. Sponsors think in "we granted 5,000", so let
     them enter that and spread it, while per-milestone amounts stay editable. */
  const [grantTotal, setGrantTotal] = useState("");
  const [milestones, setMilestones] = useState<MilestoneForm[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ hash: string } | null>(null);
  const [funded, setFunded] = useState<{ hash: string } | null>(null);
  const [engagementId, setEngagementId] = useState("");
  /* Two deliberate gates before the signature. Milestones and their
     requirements are hashed into the contract and can never be edited
     afterwards, so the last thing this wizard does is make sure the sponsor
     knows that and has actually read what they are fixing. */
  const [readEverything, setReadEverything] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /* Whether this session started from work that was already on the machine. */
  const [restored, setRestored] = useState<number | null>(null);
  /* Nothing may be written before the saved draft has been read back, or the
     first render's empty form would overwrite it. */
  const loaded = useRef(false);

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setStep(draft.step);
      setScopeMode(draft.scopeMode);
      setBrief(draft.brief);
      setPlanSummary(draft.planSummary);
      setGrantTotal(draft.grantTotal);
      setBuilder(draft.builder);
      setReviewer(draft.reviewer);
      setSelfReview(draft.selfReview);
      setRepository(draft.repository);
      setMilestones(draft.milestones);
      setRestored(draft.savedAt);
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    /* Once it is signed the engagement lives on the ledger and is listed below,
       so a local copy of the form is no longer the source of anything. */
    if (created) {
      clearDraft();
      return;
    }
    saveDraft({ step, scopeMode, brief, planSummary, grantTotal, builder, reviewer, selfReview, repository, milestones });
  }, [step, scopeMode, brief, planSummary, grantTotal, builder, reviewer, selfReview, repository, milestones, created]);

  function discardDraft() {
    clearDraft();
    setStep(1);
    setScopeMode("ai");
    setBrief("");
    setPlanSummary("");
    setPlanNotice(null);
    setGrantTotal("");
    setBuilder("");
    setReviewer("");
    setSelfReview(false);
    setRepository(null);
    setMilestones([]);
    setError(null);
    setRestored(null);
  }

  const sourceReady = Boolean(repository);
  const planProblem = milestones.length === 0 ? "Add at least one milestone." : milestones.map(milestoneProblem).find(Boolean) ?? null;
  const milestonesReady = planProblem === null;
  /* The reviewer is whoever will sign the decision: the sponsor themselves, or
     a separate address they nominate. */
  const effectiveReviewer = selfReview ? (address ?? "") : reviewer.trim();
  const roleProblem = !address
    ? "Connect the sponsor wallet."
    : !accountIsValid(builder)
      ? "Enter a valid G… account for the builder."
      : !accountIsValid(effectiveReviewer)
        ? "Enter a valid G… account for the reviewer, or choose to review it yourself."
        : builder.trim() === address
          ? "The builder cannot be the sponsor's own account."
          : builder.trim() === effectiveReviewer
            ? "The builder cannot also be the reviewer."
            : null;
  const rolesReady = roleProblem === null;
  const completedThrough = !sourceReady ? 0 : !milestonesReady ? 1 : !rolesReady ? 2 : created ? 4 : 3;

  const total = useMemo(() => milestones.reduce((sum, milestone) => {
    try { return sum + parseUsdc(milestone.amount || "0"); } catch { return sum; }
  }, 0n), [milestones]);

  const grantTarget = useMemo(() => {
    if (!grantTotal.trim()) return null;
    try { return parseUsdc(grantTotal); } catch { return null; }
  }, [grantTotal]);
  const remaining = grantTarget === null ? null : grantTarget - total;

  /* Spread the award across the milestones, giving any indivisible remainder to
     the first one so the split always adds back up to the total exactly. */
  function distributeEvenly() {
    if (grantTarget === null || grantTarget <= 0n || milestones.length === 0) return;
    const share = grantTarget / BigInt(milestones.length);
    const leftover = grantTarget - share * BigInt(milestones.length);
    setCreated(null);
    setFunded(null);
    setMilestones((current) => current.map((milestone, index) => ({
      ...milestone,
      amount: usdcInputValue(index === 0 ? share + leftover : share),
    })));
  }

  function update(index: number, patch: Partial<MilestoneForm>) {
    setCreated(null);
    setFunded(null);
    setReadEverything(false);
    setConfirming(false);
    setMilestones((current) => current.map((milestone, currentIndex) => currentIndex === index ? { ...milestone, ...patch } : milestone));
  }

  function selectRepository(next: GitHubRepositorySnapshot | null) {
    const currentName = repository?.repository.full_name ?? null;
    const nextName = next?.repository.full_name ?? null;
    setRepository(next);
    if (currentName !== nextName) {
      setMilestones([]);
      setPlanSummary("");
      setPlanNotice(null);
      setCreated(null);
      setFunded(null);
      setEngagementId("");
    }
  }

  function removeMilestone(index: number) {
    setCreated(null);
    setFunded(null);
    setReadEverything(false);
    setConfirming(false);
    setMilestones((current) => renumber(current.filter((_, currentIndex) => currentIndex !== index)));
  }

  function addMilestone() {
    setCreated(null);
    setFunded(null);
    setReadEverything(false);
    setConfirming(false);
    setMilestones((current) => [...current, emptyMilestone(current.length)]);
  }

  function importMilestones(imported: ImportedMilestone[]) {
    setError(null);
    setScopeMode("manual");
    setMilestones(imported.slice(0, MAX_MILESTONES).map((milestone, index) => ({
      title: milestone.title,
      summary: `Deliver the selected GitHub milestone for ${repository?.repository.full_name ?? "this repository"}.`,
      criteria: milestone.criteria.slice(0, MAX_CRITERIA),
      amount: "",
      startDate: dateAfter(index * 14),
      deadline: milestone.deadline ?? dateAfter(index * 14 + 13),
      startTime: "",
      deadlineTime: "",
    })));
    setStep(2);
  }

  async function analyzeBrief() {
    setPlanning(true);
    setError(null);
    setPlanNotice(null);
    try {
      const response = await fetch("/api/milestones/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief, repository: repository?.repository.full_name }),
      });
      const body = await response.json() as { plan?: MilestonePlan; mode?: "ai" | "structured"; notice?: string; error?: string };
      if (!response.ok || !body.plan) throw new Error(body.error ?? "A milestone plan could not be created.");
      setPlanSummary(body.plan.project_summary);
      setPlanNotice(body.notice ?? (body.mode === "ai" ? "AI draft ready. Review every date and criterion before continuing." : null));
      setMilestones(body.plan.milestones.map((milestone, index) => ({
        title: milestone.title || autoTitle(index),
        summary: milestone.summary,
        criteria: milestone.criteria,
        amount: "",
        startDate: milestone.start_date,
        deadline: milestone.due_date,
        startTime: "",
        deadlineTime: "",
      })));
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "A milestone plan could not be created.");
    } finally {
      setPlanning(false);
    }
  }

  async function readBriefFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 256_000) {
      setError("Use a text document smaller than 256 KB.");
      return;
    }
    try {
      setBrief((await file.text()).slice(0, 20_000));
      setError(null);
    } catch {
      setError("This document could not be read. Use TXT, Markdown, CSV or JSON.");
    }
  }

  async function handleCreate() {
    if (!address || !rolesReady || !milestonesReady) {
      setError(roleProblem ?? planProblem ?? "Complete the engagement before signing.");
      return;
    }
    setError(null);
    setBusy("create");
    try {
      const draftReference = `draft:${crypto.randomUUID()}`;
      const drafts: MilestoneDraft[] = await Promise.all(milestones.map(async (milestone, index) => {
        const criteria = milestone.criteria.map((text, criterionIndex) => ({ id: `c${criterionIndex + 1}`, text: text.trim() })).filter((criterion) => criterion.text);
        const document = { schema_version: "1.0.0" as const, engagement_id: draftReference, milestone_idx: index, title: milestone.title.trim(), criteria };
        const response = await fetch("/api/criteria", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(document) });
        const body = await response.json() as { hash?: string; error?: string };
        if (!response.ok || !body.hash) throw new Error(body.error ?? "The acceptance criteria were rejected.");
        return { title: milestone.title.trim(), criteriaHash: body.hash, amount: parseUsdc(milestone.amount), deadline: deadlineSeconds(milestone) };
      }));
      const transaction = await createEngagement(address, builder.trim(), effectiveReviewer, drafts);
      setCreated(transaction);
      setEngagementId(String(transaction.engagementId));

    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setBusy(null);
    }
  }

  async function handleFund() {
    if (!address || !engagementId || funded) return;
    setError(null);
    setBusy("fund");
    try { setFunded(await fundEngagement(address, BigInt(engagementId))); }
    catch (fundError) { setError(fundError instanceof Error ? fundError.message : String(fundError)); }
    finally { setBusy(null); }
  }

  return (
    <section className="shell sponsor-page sponsor-wizard" style={{ paddingBlock: "3rem" }}>
      <header className="sponsor-title-row">
        <div className="stack-s"><p className="eyebrow">New engagement</p><h2>Set it up once<span className="rec-hot">.</span></h2><p className="muted">SprintOS keeps each next step locked until the current one is complete.</p></div>
        <div className="wizard-fox"><FoxSculpture size={92} idPrefix="wizard-head" /></div>
      </header>

      <nav className="wizard-steps" aria-label="Engagement setup progress">
        {STEPS.map((item, index) => {
          const number = index + 1;
          const enabled = number <= completedThrough + 1;
          return <button type="button" key={item.label} className={`${step === number ? "is-current" : ""}${number <= completedThrough ? " is-complete" : ""}`} disabled={!enabled || Boolean(created && number < 4)} onClick={() => setStep(number)}><span><ProductIcon name={number <= completedThrough ? "check" : item.icon} size={19} /></span><b>0{number}</b><small>{item.label}</small></button>;
        })}
      </nav>

      {restored !== null && !created && (
        <div className="draft-banner">
          <ProductIcon name="milestone" size={18} />
          <p>
            <b>Picked up where you left off.</b> This setup was saved on this device{" "}
            {sinceWhen(restored)} and nothing has been signed or sent.
          </p>
          <button type="button" onClick={discardDraft}>Start over</button>
        </div>
      )}

      {error && <p className="notice">{error}</p>}

      {step === 1 && (
        <div className="wizard-stage">
          <GitHubRepositoryPanel onRepositorySelected={selectRepository} onImport={importMilestones} />
          <WizardActions nextLabel="Continue to scope" nextDisabled={!sourceReady} onNext={() => setStep(2)} />
        </div>
      )}

      {step === 2 && (
        <div className="wizard-stage">
          <div className="wizard-stage-heading"><div><p className="eyebrow">02 · Scope</p><h3>Turn the brief into a plan</h3></div><span className="source-chip"><ProductIcon name="github" size={15} /> {repository?.repository.full_name}</span></div>
          <div className="scope-mode-tabs"><button type="button" className={scopeMode === "ai" ? "is-active" : ""} onClick={() => setScopeMode("ai")}><ProductIcon name="scan" size={18} /> AI from brief</button><button type="button" className={scopeMode === "manual" ? "is-active" : ""} onClick={() => { setScopeMode("manual"); if (milestones.length === 0) setMilestones([emptyMilestone()]); }}><ProductIcon name="milestone" size={18} /> Manual</button></div>

          {scopeMode === "ai" && (
            <section className="brief-composer">
              <div className={`brief-fox${planning ? " is-thinking" : ""}`}><FoxSculpture size={132} idPrefix="planner" /><span>{planning ? "Reading your brief…" : "I’ll find outcomes, dates and criteria."}</span></div>
              <div className="brief-input">
                <label htmlFor="project-brief">Paste a project brief or requirements document</label>
                <textarea id="project-brief" rows={9} maxLength={20_000} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="What are you building? Include deliverables, dates, phases and what success looks like…" />
                <div className="brief-actions"><label className="btn btn-ghost brief-upload"><ProductIcon name="link" size={17} /> Upload text document<input type="file" accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,application/json" onChange={(event) => void readBriefFile(event.target.files?.[0])} /></label><span>{brief.length.toLocaleString()} / 20,000</span><button type="button" className="btn btn-primary" disabled={planning || brief.trim().length < 30} onClick={analyzeBrief}>{planning ? <><FoxSpinner /> Building plan…</> : <><ProductIcon name="scan" size={18} /> Generate milestones</>}</button></div>
              </div>
            </section>
          )}

          {planNotice && <p className="notice notice-ok">{planNotice}</p>}
          {planSummary && <p className="plan-summary"><span>Project</span>{planSummary}</p>}

          {milestones.length > 0 && (
            <section className="budget-bar">
              <div className="field budget-total">
                <label htmlFor="grant-total">Total award (optional)</label>
                <input
                  id="grant-total"
                  type="text"
                  inputMode="decimal"
                  value={grantTotal}
                  onChange={(event) => setGrantTotal(event.target.value)}
                  placeholder="5000"
                />
              </div>
              <button type="button" className="btn btn-ghost" onClick={distributeEvenly} disabled={grantTarget === null || grantTarget <= 0n}>
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

          {milestones.length > 0 && <MilestoneEditor milestones={milestones} update={update} remove={removeMilestone} add={addMilestone} />}
          <WizardActions back onBack={() => setStep(1)} nextLabel="Confirm plan" nextDisabled={!milestonesReady} nextHint={planProblem ?? undefined} onNext={() => setStep(3)} />
        </div>
      )}

      {step === 3 && (
        <div className="wizard-stage">
          <div className="wizard-stage-heading"><div><p className="eyebrow">03 · Roles</p><h3>Assign the people</h3></div><span className="source-chip"><ProductIcon name="milestone" size={15} /> {milestones.length} milestones · {formatUsdc(total)} USDC</span></div>
          <div className="roles-gate">
            <div className="panel stack"><div className="sponsor-section-title"><span><ProductIcon name="wallet" size={22} /></span><div><p className="eyebrow">Sponsor</p><h3>Your wallet</h3></div></div>{address ? <p className="wallet-ready"><ProductIcon name="check" size={17} /><span>Connected</span><b>{address.slice(0, 8)}…{address.slice(-6)}</b></p> : <button type="button" className="btn btn-primary" onClick={connect}><ProductIcon name="wallet" size={18} /> Connect wallet</button>}</div>
            <div className="panel stack">
              <div className="field">
                <label htmlFor="builder">Builder wallet address</label>
                <input id="builder" type="text" placeholder="G…" value={builder} onChange={(event) => setBuilder(event.target.value)} />
                <small className="field-hint">The account that submits proof and receives each released milestone.</small>
              </div>

              <div className="field">
                <label>Who signs the payout decision?</label>
                <div className="reviewer-choice">
                  <button type="button" className={selfReview ? "is-active" : ""} onClick={() => setSelfReview(true)}>
                    <ProductIcon name="signature" size={19} />
                    <b>I&rsquo;ll review it myself</b>
                    <small>You wrote the milestones, so you read the score and release the money.</small>
                  </button>
                  <button type="button" className={!selfReview ? "is-active" : ""} onClick={() => setSelfReview(false)}>
                    <ProductIcon name="eye" size={19} />
                    <b>Someone else reviews</b>
                    <small>Nominate an independent account to decide. You cannot overrule it.</small>
                  </button>
                </div>
              </div>

              {selfReview ? (
                <p className="reviewer-self-note">
                  <ProductIcon name="check" size={16} />
                  The engagement will record your own account as reviewer{address ? ` (${address.slice(0, 8)}…${address.slice(-6)})` : ""}.
                </p>
              ) : (
                <div className="field">
                  <label htmlFor="reviewer">Reviewer wallet address</label>
                  <input id="reviewer" type="text" placeholder="G…" value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
                </div>
              )}
            </div>
          </div>
          <WizardActions back onBack={() => setStep(2)} nextLabel="Review engagement" nextDisabled={!rolesReady} nextHint={roleProblem ?? undefined} onNext={() => setStep(4)} />
        </div>
      )}

      {step === 4 && (
        <div className="wizard-stage">
          <div className="wizard-stage-heading"><div><p className="eyebrow">04 · Final review</p><h3>Everything in one view</h3></div><span className="amount">{formatUsdc(total)} <small>USDC</small></span></div>
          <div className="review-receipt"><ReceiptRow icon="github" label="Repository" value={repository?.repository.full_name ?? "—"} /><ReceiptRow icon="wallet" label="Builder" value={short(builder)} /><ReceiptRow icon="signature" label="Reviewer" value={selfReview ? `${short(address ?? "")} · you` : short(reviewer)} />{milestones.map((milestone, index) => <div className="receipt-milestone" key={`${milestone.title}-${index}`}><span>0{index + 1}</span><div><strong>{milestone.title}</strong><small>{formatMoment(milestone.startDate, milestone.startTime)} → {formatMoment(milestone.deadline, milestone.deadlineTime)}</small><ul>{milestone.criteria.filter(Boolean).map((criterion, criterionIndex) => <li key={`${criterionIndex}-${criterion}`}>{criterion}</li>)}</ul></div><b>{milestone.amount} USDC</b></div>)}</div>
          {!created ? (
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
                <li><span>{milestones.reduce((count, milestone) => count + milestone.criteria.filter(Boolean).length, 0)}</span> requirements, fixed</li>
                <li><span>{formatUsdc(total)}</span> USDC committed to escrow</li>
                <li><span>{selfReview ? "You" : short(reviewer)}</span> will decide each payout</li>
              </ul>

              <label className="attest">
                <input
                  type="checkbox"
                  checked={readEverything}
                  onChange={(event) => { setReadEverything(event.target.checked); setConfirming(false); }}
                />
                <span>
                  I have read every milestone and requirement above, and I understand they cannot be
                  edited after this signature.
                </span>
              </label>

              {!confirming ? (
                <div className="wizard-sign">
                  <FoxSculpture size={108} idPrefix="final-sign" />
                  <div>
                    <h3>Ready when you are</h3>
                    <p>One more confirmation before your wallet opens.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!readEverything}
                    onClick={() => setConfirming(true)}
                  >
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
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy !== null}>
                      No — let me change something
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy !== null}>
                      {busy === "create" ? <><FoxSpinner /> Waiting for signature…</> : "Yes, lock and sign"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : <div className="panel panel-marked stack sponsor-sign-panel"><p className="notice notice-ok">Engagement created.</p><TxLink hash={created.hash} /><div className="row"><div className="field" style={{ maxWidth: "10rem" }}><label htmlFor="eid">Engagement id</label><input id="eid" type="text" value={engagementId} readOnly aria-readonly="true" /></div>{!funded && <button type="button" className="btn btn-primary" onClick={handleFund} disabled={busy !== null || !engagementId}>{busy === "fund" ? <><FoxSpinner /> Funding escrow…</> : `Fund ${formatUsdc(total)} USDC`}</button>}</div>{funded && <div className="stack-s"><p className="notice notice-ok">Escrow funded.</p><TxLink hash={funded.hash} /><Link href={`/e/${engagementId}`} className="badge-link">Open engagement →</Link></div>}</div>}
          {!created && <WizardActions back onBack={() => setStep(3)} />}
        </div>
      )}
      <SponsorEngagements />
    </section>
  );
}

function MilestoneEditor({ milestones, update, remove, add }: { milestones: MilestoneForm[]; update: (index: number, patch: Partial<MilestoneForm>) => void; remove: (index: number) => void; add: () => void }) {
  return <section className="plan-timeline"><header><div><p className="eyebrow">Editable plan</p><h3>Milestone timeline</h3></div><span>{milestones.length}/{MAX_MILESTONES}</span></header><div className="plan-line">{milestones.map((milestone, index) => <article className="plan-milestone" key={index}><span className="plan-node">0{index + 1}</span><div className="plan-card"><div className="spread"><div className="field plan-title"><label htmlFor={`title-${index}`}>Milestone</label><input id={`title-${index}`} type="text" value={milestone.title} onChange={(event) => update(index, { title: event.target.value })} placeholder={`Milestone ${index + 1}`} /></div>{milestones.length > 1 && <button type="button" className="plan-remove" onClick={() => remove(index)}>Remove</button>}</div><div className="field"><label htmlFor={`summary-${index}`}>Outcome</label><textarea id={`summary-${index}`} rows={2} value={milestone.summary} onChange={(event) => update(index, { summary: event.target.value })} placeholder="What will be delivered?" /></div><MilestoneDates index={index} milestone={milestone} update={update} /><div className="field"><label>Must be true at delivery</label><div className="criteria-list">{milestone.criteria.map((criterion, criterionIndex) => <div key={criterionIndex}><ProductIcon name="check" size={15} /><input type="text" value={criterion} onChange={(event) => update(index, { criteria: milestone.criteria.map((value, currentIndex) => currentIndex === criterionIndex ? event.target.value : value) })} placeholder={`Checkable requirement ${criterionIndex + 1}`} /></div>)}{milestone.criteria.length < MAX_CRITERIA && <button type="button" onClick={() => update(index, { criteria: [...milestone.criteria, ""] })}>+ Add criterion</button>}</div></div></div></article>)}</div>{milestones.length < MAX_MILESTONES && <button type="button" className="btn btn-ghost" onClick={add}>+ Add milestone</button>}</section>;
}

/**
 * When a milestone starts and falls due, and what it is worth.
 *
 * The dates carry their own calendar button rather than relying on the browser's
 * own indicator, which is a few grey pixels wedged inside the field and easy to
 * miss. Times are opt-in: most milestones are agreed in whole days, and a form
 * that demands an hour for every one of them is asking for a decision nobody
 * has made.
 */
function MilestoneDates({ index, milestone, update }: { index: number; milestone: MilestoneForm; update: (index: number, patch: Partial<MilestoneForm>) => void }) {
  const exact = Boolean(milestone.startTime || milestone.deadlineTime);

  return (
    <>
      <div className="plan-dates">
        <div className="field">
          <label htmlFor={`start-${index}`}>Starts</label>
          <div className="picker-row">
            <PickerInput id={`start-${index}`} type="date" icon="calendar" hint="Pick a start date" value={milestone.startDate} onChange={(value) => update(index, { startDate: value })} />
            {exact && <PickerInput id={`start-time-${index}`} type="time" icon="clock" hint="Pick a start time" value={milestone.startTime} onChange={(value) => update(index, { startTime: value })} />}
          </div>
        </div>

        <span aria-hidden="true">&rarr;</span>

        <div className="field">
          <label htmlFor={`due-${index}`}>Due</label>
          <div className="picker-row">
            <PickerInput id={`due-${index}`} type="date" icon="calendar" hint="Pick a due date" min={milestone.startDate} value={milestone.deadline} onChange={(value) => update(index, { deadline: value })} />
            {exact && <PickerInput id={`due-time-${index}`} type="time" icon="clock" hint="Pick a due time" value={milestone.deadlineTime} onChange={(value) => update(index, { deadlineTime: value })} />}
          </div>
        </div>

        <div className="field plan-amount">
          <label htmlFor={`amount-${index}`}>USDC</label>
          <input id={`amount-${index}`} type="text" inputMode="decimal" value={milestone.amount} onChange={(event) => update(index, { amount: event.target.value })} placeholder="500" />
        </div>
      </div>

      <button
        type="button"
        className="plan-precise"
        onClick={() => update(index, exact ? { startTime: "", deadlineTime: "" } : { startTime: "09:00", deadlineTime: "18:00" })}
      >
        <ProductIcon name="clock" size={14} />
        {exact ? "Use whole days" : "Set exact times"}
      </button>

      <p className="plan-dates-note">
        {exact
          ? "Times are read in your own timezone and stored on chain as one exact moment."
          : "Due at the end of the day, in your own timezone."}
      </p>
    </>
  );
}

/**
 * A native date or time field with a legible button to open its picker.
 *
 * The button duplicates what the input already offers a keyboard, so it stays
 * out of the tab order and out of the accessibility tree; it exists so that the
 * calendar is something you can see and hit with a mouse.
 */
function PickerInput({ id, type, icon, hint, value, min, onChange }: { id: string; type: "date" | "time"; icon: ProductIconName; hint: string; value: string; min?: string; onChange: (value: string) => void }) {
  const field = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = field.current;
    if (!input) return;
    /* showPicker throws when the browser has no picker to show, or when it does
       not consider this a user gesture. Focusing the field is a working answer
       in both cases. */
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  return (
    <span className={`picker picker-${type}`}>
      <input ref={field} id={id} type={type} value={value} min={min} onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="picker-open" onClick={openPicker} tabIndex={-1} aria-hidden="true" title={hint}>
        <ProductIcon name={icon} size={16} />
      </button>
    </span>
  );
}

/** Plain-language age of a restored draft — "a moment ago", "yesterday". */
function sinceWhen(savedAt: number): string {
  const minutes = Math.round((Date.now() - savedAt) / 60_000);
  if (minutes < 2) return "a moment ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function WizardActions({ back = false, onBack, onNext, nextLabel, nextDisabled = false, nextHint }: { back?: boolean; onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; nextHint?: string }) {
  return <div className="wizard-actions">{back ? <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button> : <span />}{nextLabel && <div><small>{nextHint}</small><button type="button" className="btn btn-primary" disabled={nextDisabled} onClick={onNext}>{nextLabel} →</button></div>}</div>;
}

function ReceiptRow({ icon, label, value }: { icon: ProductIconName; label: string; value: string }) {
  return <div className="receipt-row"><span><ProductIcon name={icon} size={18} /></span><small>{label}</small><strong>{value}</strong></div>;
}

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value || "—";
}
