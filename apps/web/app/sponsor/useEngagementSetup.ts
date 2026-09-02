"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import type { ImportedMilestone } from "@/components/GitHubRepositoryPanel";
import type { GitHubRepositorySnapshot } from "@/lib/github";
import { createEngagement, fundEngagement, type MilestoneDraft } from "@/lib/stellar/contract";
import { parseUsdc } from "@/lib/stellar/config";
import {
  clearDraft,
  deadlineSeconds,
  loadDraft,
  saveDraft,
  type MilestoneForm,
} from "@/lib/sponsor-draft";
import {
  allocatedTotal,
  completedThrough,
  dateAfter,
  emptyMilestone,
  autoTitle,
  planProblemOf,
  renumber,
  roleProblemOf,
  splitEvenly,
} from "@/lib/sponsor-plan";
import type { MilestonePlan } from "@sprintos/advisory";
import { MAX_CRITERIA, MAX_MILESTONES } from "@sprintos/schemas/milestone";

/**
 * Everything the sponsor wizard remembers and everything it can do.
 *
 * The four steps read from this and call back into it; none of them hold state
 * of their own. Keeping it in one place is what makes the "each step stays
 * locked until the last one is finished" rule enforceable rather than a
 * convention four components have to agree on.
 */
export function useEngagementSetup() {
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

  /* Any edit to the plan invalidates a signature that has not happened yet and
     un-ticks the "I have read all of this" box, so the sponsor cannot approve
     one set of terms and sign another. */
  function invalidateSignature() {
    setCreated(null);
    setFunded(null);
    setReadEverything(false);
    setConfirming(false);
  }

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
  const planProblem = planProblemOf(milestones);
  const milestonesReady = planProblem === null;
  /* The reviewer is whoever will sign the decision: the sponsor themselves, or
     a separate address they nominate. */
  const effectiveReviewer = selfReview ? (address ?? "") : reviewer.trim();
  const roleProblem = roleProblemOf({ sponsor: address, builder, reviewer: effectiveReviewer });
  const rolesReady = roleProblem === null;
  const progress = completedThrough({ sourceReady, milestonesReady, rolesReady, signed: Boolean(created) });

  const total = useMemo(() => allocatedTotal(milestones), [milestones]);

  const grantTarget = useMemo(() => {
    if (!grantTotal.trim()) return null;
    try {
      return parseUsdc(grantTotal);
    } catch {
      return null;
    }
  }, [grantTotal]);
  const remaining = grantTarget === null ? null : grantTarget - total;

  function distributeEvenly() {
    if (grantTarget === null) return;
    const parts = splitEvenly(grantTarget, milestones.length);
    if (parts.length === 0) return;
    setCreated(null);
    setFunded(null);
    setMilestones((current) => current.map((milestone, index) => ({ ...milestone, amount: parts[index] })));
  }

  function update(index: number, patch: Partial<MilestoneForm>) {
    invalidateSignature();
    setMilestones((current) => current.map((milestone, currentIndex) => (
      currentIndex === index ? { ...milestone, ...patch } : milestone
    )));
  }

  /* Changing repository throws away a plan written against the old one. The
     milestones were drawn from that repository's issues and wording, so
     carrying them across would quietly attach them to the wrong project. */
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
    invalidateSignature();
    setMilestones((current) => renumber(current.filter((_, currentIndex) => currentIndex !== index)));
  }

  function addMilestone() {
    invalidateSignature();
    setMilestones((current) => [...current, emptyMilestone(current.length)]);
  }

  function startManualPlan() {
    setScopeMode("manual");
    if (milestones.length === 0) setMilestones([emptyMilestone()]);
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

  /**
   * Store each milestone's criteria, then sign the engagement into existence.
   *
   * The criteria documents are written first because the contract stores only
   * their hash. If this signature is refused, those documents are harmless —
   * nothing points at them and no engagement exists.
   */
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
        const criteria = milestone.criteria
          .map((text, criterionIndex) => ({ id: `c${criterionIndex + 1}`, text: text.trim() }))
          .filter((criterion) => criterion.text);
        const document = {
          schema_version: "1.0.0" as const,
          engagement_id: draftReference,
          milestone_idx: index,
          title: milestone.title.trim(),
          criteria,
        };
        const response = await fetch("/api/criteria", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(document),
        });
        const body = await response.json() as { hash?: string; error?: string };
        if (!response.ok || !body.hash) throw new Error(body.error ?? "The acceptance criteria were rejected.");
        return {
          title: milestone.title.trim(),
          criteriaHash: body.hash,
          amount: parseUsdc(milestone.amount),
          deadline: deadlineSeconds(milestone),
        };
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
    try {
      setFunded(await fundEngagement(address, BigInt(engagementId)));
    } catch (fundError) {
      setError(fundError instanceof Error ? fundError.message : String(fundError));
    } finally {
      setBusy(null);
    }
  }

  return {
    address, connect,
    step, setStep, progress,
    repository, selectRepository, sourceReady,
    scopeMode, setScopeMode, startManualPlan,
    brief, setBrief, readBriefFile, analyzeBrief, planning, planSummary, planNotice,
    milestones, update, addMilestone, removeMilestone, importMilestones,
    grantTotal, setGrantTotal, grantTarget, distributeEvenly, total, remaining,
    builder, setBuilder, reviewer, setReviewer, selfReview, setSelfReview, effectiveReviewer,
    planProblem, milestonesReady, roleProblem, rolesReady,
    readEverything, setReadEverything, confirming, setConfirming,
    handleCreate, handleFund, busy, created, funded, engagementId,
    error, restored, discardDraft,
  };
}

export type EngagementSetup = ReturnType<typeof useEngagementSetup>;
