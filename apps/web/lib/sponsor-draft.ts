import type { GitHubRepositorySnapshot } from "./github";

/**
 * The sponsor wizard's work in progress, kept in the browser.
 *
 * Setting up an engagement takes several minutes of typing — a repository, a
 * milestone plan, dates, requirements, two addresses — and until now all of it
 * lived in React state alone. One accidental Back, one closed tab, and it was
 * gone. Nothing here is on chain and nothing is sent anywhere: this is the same
 * form, saved on the machine that typed it, so returning to the page picks up
 * where the sponsor left off.
 *
 * Only the pre-signature form is kept. Once the engagement is signed it exists
 * on the ledger and is listed on the page, so restoring a stale copy of it
 * would be misleading rather than helpful.
 */

/** One milestone as the wizard edits it — all strings, all still changeable. */
export interface MilestoneForm {
  title: string;
  summary: string;
  criteria: string[];
  amount: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  deadline: string;
  /** `HH:MM`, or empty for "whenever that day ends". */
  startTime: string;
  deadlineTime: string;
}

export interface SponsorDraft {
  savedAt: number;
  step: number;
  scopeMode: "ai" | "manual";
  brief: string;
  planSummary: string;
  grantTotal: string;
  builder: string;
  reviewer: string;
  selfReview: boolean;
  repository: GitHubRepositorySnapshot | null;
  milestones: MilestoneForm[];
}

/* Versioned, so a draft written by an older shape of the form is dropped rather
   than restored into fields that no longer mean the same thing. */
const KEY = "sprintos.sponsor.draft.v1";

/** Drafts older than this are stale enough that restoring them would surprise. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/* Storage throws in private windows and when the origin's quota is full, and a
   half-typed form is never worth breaking the page over. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Omit<SponsorDraft, "savedAt">): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* Quota. The form still works; it just will not survive a reload. */
  }
}

export function clearDraft(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* Nothing to do — the draft is only a convenience. */
  }
}

/**
 * Read back a draft, or null when there is nothing worth restoring.
 *
 * Everything is re-checked rather than trusted: this is JSON from the user's
 * own browser, but it may have been written by a different version of the form,
 * or edited by hand.
 */
export function loadDraft(): SponsorDraft | null {
  const store = storage();
  if (!store) return null;

  let parsed: unknown;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Partial<SponsorDraft>;

  if (typeof draft.savedAt !== "number" || Date.now() - draft.savedAt > MAX_AGE_MS) {
    clearDraft();
    return null;
  }

  const milestones = Array.isArray(draft.milestones)
    ? draft.milestones.filter(isMilestoneForm).map(normalizeMilestone)
    : [];

  /* An empty form is not a draft. Restoring one would show the "we kept your
     work" banner to somebody who has not typed anything yet. */
  if (milestones.length === 0 && !draft.brief?.trim() && !draft.repository) return null;

  return {
    savedAt: draft.savedAt,
    step: typeof draft.step === "number" && draft.step >= 1 && draft.step <= 4 ? draft.step : 1,
    scopeMode: draft.scopeMode === "manual" ? "manual" : "ai",
    brief: typeof draft.brief === "string" ? draft.brief : "",
    planSummary: typeof draft.planSummary === "string" ? draft.planSummary : "",
    grantTotal: typeof draft.grantTotal === "string" ? draft.grantTotal : "",
    builder: typeof draft.builder === "string" ? draft.builder : "",
    reviewer: typeof draft.reviewer === "string" ? draft.reviewer : "",
    selfReview: draft.selfReview === true,
    repository: isRepository(draft.repository) ? draft.repository : null,
    milestones,
  };
}

function isMilestoneForm(value: unknown): value is Partial<MilestoneForm> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeMilestone(value: Partial<MilestoneForm>): MilestoneForm {
  const criteria = Array.isArray(value.criteria) ? value.criteria.map(text) : [];
  return {
    title: text(value.title),
    summary: text(value.summary),
    /* Every milestone needs at least one criterion row to type into. */
    criteria: criteria.length > 0 ? criteria : [""],
    amount: text(value.amount),
    startDate: text(value.startDate),
    deadline: text(value.deadline),
    startTime: text(value.startTime),
    deadlineTime: text(value.deadlineTime),
  };
}

function isRepository(value: unknown): value is GitHubRepositorySnapshot {
  if (typeof value !== "object" || value === null) return false;
  const repository = (value as GitHubRepositorySnapshot).repository;
  return typeof repository === "object" && repository !== null && typeof repository.full_name === "string";
}

/**
 * When a milestone falls due, as a Unix timestamp.
 *
 * A date with no time means the end of that day where the sponsor is sitting,
 * which is what "due 9 September" means to a person. A date with a time means
 * exactly that time, also local. The contract stores the resulting instant, so
 * everyone downstream reads one unambiguous moment.
 */
export function deadlineSeconds(milestone: Pick<MilestoneForm, "deadline" | "deadlineTime">): number {
  const at = new Date(`${milestone.deadline}T${milestone.deadlineTime || "23:59"}:59`);
  return Math.floor(at.getTime() / 1000);
}

/** The same reading for the start of a milestone, used to order the two. */
export function startSeconds(milestone: Pick<MilestoneForm, "startDate" | "startTime">): number {
  const at = new Date(`${milestone.startDate}T${milestone.startTime || "00:00"}:00`);
  return Math.floor(at.getTime() / 1000);
}

/** How a date and optional time read back to the sponsor in the receipt. */
export function formatMoment(date: string, time: string): string {
  if (!date) return "—";
  return time ? `${date} ${time}` : date;
}
