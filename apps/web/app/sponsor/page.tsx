"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { createEngagement, fundEngagement, type MilestoneDraft } from "@/lib/stellar/contract";
import { formatUsdc, parseUsdc } from "@/lib/stellar/config";
import { TxLink } from "@/components/TxLink";
import { FoxSpinner } from "@/components/FoxLoader";
import { FoxSculpture } from "@/components/FoxSculpture";
import { GitHubRepositoryPanel, type ImportedMilestone } from "@/components/GitHubRepositoryPanel";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";
import { SponsorEngagements } from "@/components/SponsorEngagements";
import type { GitHubRepositorySnapshot } from "@/lib/github";
import type { MilestonePlan } from "@sprintos/advisory";
import { MAX_CRITERIA, MAX_MILESTONES } from "@sprintos/schemas/milestone";
import { StrKey } from "@stellar/stellar-sdk";

interface MilestoneForm {
  title: string;
  summary: string;
  criteria: string[];
  amount: string;
  startDate: string;
  deadline: string;
}

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

function emptyMilestone(index = 0): MilestoneForm {
  return {
    title: "",
    summary: "",
    criteria: [""],
    amount: "",
    startDate: dateAfter(index * 14),
    deadline: dateAfter(index * 14 + 13),
  };
}

function milestoneProblem(milestone: MilestoneForm): string | null {
  if (!milestone.title.trim()) return "Give every milestone a title.";
  if (new TextEncoder().encode(milestone.title.trim()).length > 200) return "Keep milestone titles under 200 bytes.";
  if (!milestone.startDate || !milestone.deadline) return "Add a start date and due date to every milestone.";
  if (milestone.deadline < milestone.startDate) return "A milestone due date cannot be before its start date.";
  const deadline = new Date(`${milestone.deadline}T23:59:59Z`).getTime();
  if (!Number.isFinite(deadline) || deadline <= Date.now()) return "Every milestone due date must still be in the future.";

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
  const [milestones, setMilestones] = useState<MilestoneForm[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ hash: string } | null>(null);
  const [funded, setFunded] = useState<{ hash: string } | null>(null);
  const [engagementId, setEngagementId] = useState("");

  const sourceReady = Boolean(repository);
  const planProblem = milestones.length === 0 ? "Add at least one milestone." : milestones.map(milestoneProblem).find(Boolean) ?? null;
  const milestonesReady = planProblem === null;
  const roleProblem = !address
    ? "Connect the sponsor wallet."
    : !accountIsValid(builder)
      ? "Enter a valid G… account for the builder."
      : !accountIsValid(reviewer)
        ? "Enter a valid G… account for the reviewer."
        : new Set([address, builder.trim(), reviewer.trim()]).size !== 3
          ? "Sponsor, builder and reviewer must use three different accounts."
          : null;
  const rolesReady = roleProblem === null;
  const completedThrough = !sourceReady ? 0 : !milestonesReady ? 1 : !rolesReady ? 2 : created ? 4 : 3;

  const total = useMemo(() => milestones.reduce((sum, milestone) => {
    try { return sum + parseUsdc(milestone.amount || "0"); } catch { return sum; }
  }, 0n), [milestones]);

  function update(index: number, patch: Partial<MilestoneForm>) {
    setCreated(null);
    setFunded(null);
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
    setMilestones((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function addMilestone() {
    setCreated(null);
    setFunded(null);
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
      setMilestones(body.plan.milestones.map((milestone) => ({
        title: milestone.title,
        summary: milestone.summary,
        criteria: milestone.criteria,
        amount: "",
        startDate: milestone.start_date,
        deadline: milestone.due_date,
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
        return { title: milestone.title.trim(), criteriaHash: body.hash, amount: parseUsdc(milestone.amount), deadline: Math.floor(new Date(`${milestone.deadline}T23:59:59Z`).getTime() / 1000) };
      }));
      const transaction = await createEngagement(address, builder.trim(), reviewer.trim(), drafts);
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
          {milestones.length > 0 && <MilestoneEditor milestones={milestones} update={update} remove={removeMilestone} add={addMilestone} />}
          <WizardActions back onBack={() => setStep(1)} nextLabel="Confirm plan" nextDisabled={!milestonesReady} nextHint={planProblem ?? undefined} onNext={() => setStep(3)} />
        </div>
      )}

      {step === 3 && (
        <div className="wizard-stage">
          <div className="wizard-stage-heading"><div><p className="eyebrow">03 · Roles</p><h3>Assign the people</h3></div><span className="source-chip"><ProductIcon name="milestone" size={15} /> {milestones.length} milestones · {formatUsdc(total)} USDC</span></div>
          <div className="roles-gate">
            <div className="panel stack"><div className="sponsor-section-title"><span><ProductIcon name="wallet" size={22} /></span><div><p className="eyebrow">Sponsor</p><h3>Your wallet</h3></div></div>{address ? <p className="wallet-ready"><ProductIcon name="check" size={17} /><span>Connected</span><b>{address.slice(0, 8)}…{address.slice(-6)}</b></p> : <button type="button" className="btn btn-primary" onClick={connect}><ProductIcon name="wallet" size={18} /> Connect wallet</button>}</div>
            <div className="panel stack"><div className="field"><label htmlFor="builder">Builder wallet address</label><input id="builder" type="text" placeholder="G…" value={builder} onChange={(event) => setBuilder(event.target.value)} /></div><div className="field"><label htmlFor="reviewer">Reviewer wallet address</label><input id="reviewer" type="text" placeholder="G…" value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></div></div>
          </div>
          <WizardActions back onBack={() => setStep(2)} nextLabel="Review engagement" nextDisabled={!rolesReady} nextHint={roleProblem ?? undefined} onNext={() => setStep(4)} />
        </div>
      )}

      {step === 4 && (
        <div className="wizard-stage">
          <div className="wizard-stage-heading"><div><p className="eyebrow">04 · Final review</p><h3>Everything in one view</h3></div><span className="amount">{formatUsdc(total)} <small>USDC</small></span></div>
          <div className="review-receipt"><ReceiptRow icon="github" label="Repository" value={repository?.repository.full_name ?? "—"} /><ReceiptRow icon="wallet" label="Builder" value={short(builder)} /><ReceiptRow icon="signature" label="Reviewer" value={short(reviewer)} />{milestones.map((milestone, index) => <div className="receipt-milestone" key={`${milestone.title}-${index}`}><span>0{index + 1}</span><div><strong>{milestone.title}</strong><small>{milestone.startDate} → {milestone.deadline}</small><ul>{milestone.criteria.filter(Boolean).map((criterion, criterionIndex) => <li key={`${criterionIndex}-${criterion}`}>{criterion}</li>)}</ul></div><b>{milestone.amount} USDC</b></div>)}</div>
          {!created ? <div className="wizard-sign"><FoxSculpture size={108} idPrefix="final-sign" /><div><h3>Ready for your signature</h3><p>Criteria are hashed first. Your wallet then creates the engagement.</p></div><button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy !== null}>{busy === "create" ? <><FoxSpinner /> Waiting for signature…</> : <><ProductIcon name="signature" size={18} /> Sign engagement</>}</button></div> : <div className="panel panel-marked stack sponsor-sign-panel"><p className="notice notice-ok">Engagement created.</p><TxLink hash={created.hash} /><div className="row"><div className="field" style={{ maxWidth: "10rem" }}><label htmlFor="eid">Engagement id</label><input id="eid" type="text" value={engagementId} readOnly aria-readonly="true" /></div>{!funded && <button type="button" className="btn btn-primary" onClick={handleFund} disabled={busy !== null || !engagementId}>{busy === "fund" ? <><FoxSpinner /> Funding escrow…</> : `Fund ${formatUsdc(total)} USDC`}</button>}</div>{funded && <div className="stack-s"><p className="notice notice-ok">Escrow funded.</p><TxLink hash={funded.hash} /><Link href={`/e/${engagementId}`} className="badge-link">Open engagement →</Link></div>}</div>}
          {!created && <WizardActions back onBack={() => setStep(3)} />}
        </div>
      )}
      <SponsorEngagements />
    </section>
  );
}

function MilestoneEditor({ milestones, update, remove, add }: { milestones: MilestoneForm[]; update: (index: number, patch: Partial<MilestoneForm>) => void; remove: (index: number) => void; add: () => void }) {
  return <section className="plan-timeline"><header><div><p className="eyebrow">Editable plan</p><h3>Milestone timeline</h3></div><span>{milestones.length}/{MAX_MILESTONES}</span></header><div className="plan-line">{milestones.map((milestone, index) => <article className="plan-milestone" key={index}><span className="plan-node">0{index + 1}</span><div className="plan-card"><div className="spread"><div className="field plan-title"><label htmlFor={`title-${index}`}>Milestone</label><input id={`title-${index}`} type="text" value={milestone.title} onChange={(event) => update(index, { title: event.target.value })} placeholder={`Milestone ${index + 1}`} /></div>{milestones.length > 1 && <button type="button" className="plan-remove" onClick={() => remove(index)}>Remove</button>}</div><div className="field"><label htmlFor={`summary-${index}`}>Outcome</label><textarea id={`summary-${index}`} rows={2} value={milestone.summary} onChange={(event) => update(index, { summary: event.target.value })} placeholder="What will be delivered?" /></div><div className="plan-dates"><div className="field"><label htmlFor={`start-${index}`}>Starts</label><input id={`start-${index}`} type="date" value={milestone.startDate} onChange={(event) => update(index, { startDate: event.target.value })} /></div><span>→</span><div className="field"><label htmlFor={`due-${index}`}>Due</label><input id={`due-${index}`} type="date" min={milestone.startDate} value={milestone.deadline} onChange={(event) => update(index, { deadline: event.target.value })} /></div><div className="field plan-amount"><label htmlFor={`amount-${index}`}>USDC</label><input id={`amount-${index}`} type="text" inputMode="decimal" value={milestone.amount} onChange={(event) => update(index, { amount: event.target.value })} placeholder="500" /></div></div><div className="field"><label>Must be true at delivery</label><div className="criteria-list">{milestone.criteria.map((criterion, criterionIndex) => <div key={criterionIndex}><ProductIcon name="check" size={15} /><input type="text" value={criterion} onChange={(event) => update(index, { criteria: milestone.criteria.map((value, currentIndex) => currentIndex === criterionIndex ? event.target.value : value) })} placeholder={`Checkable requirement ${criterionIndex + 1}`} /></div>)}{milestone.criteria.length < MAX_CRITERIA && <button type="button" onClick={() => update(index, { criteria: [...milestone.criteria, ""] })}>+ Add criterion</button>}</div></div></div></article>)}</div>{milestones.length < MAX_MILESTONES && <button type="button" className="btn btn-ghost" onClick={add}>+ Add milestone</button>}</section>;
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
