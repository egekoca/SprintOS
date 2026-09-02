import { StrKey } from "@stellar/stellar-sdk";
import { parseUsdc, usdcInputValue } from "./stellar/config.ts";
import { deadlineSeconds, startSeconds, type MilestoneForm } from "./sponsor-draft.ts";

/**
 * The rules the sponsor wizard runs on, with no React around them.
 *
 * All of this used to live inside the page component, where none of it could be
 * tested without rendering a four-step form. It is the part most worth testing:
 * everything here decides whether a sponsor is allowed to sign, and a signature
 * fixes the milestone terms on chain for good.
 */

/** A calendar date `offsetDays` from today, as `YYYY-MM-DD`. */
export function dateAfter(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/* Milestones get a number the moment they are created rather than only a grey
   placeholder. An untitled milestone is never what anyone wants, and
   "Milestone 3" is both a working answer and an obvious thing to type over. */
export function autoTitle(index: number): string {
  return `Milestone ${index + 1}`;
}

export function emptyMilestone(index = 0): MilestoneForm {
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

/**
 * Keep the automatic names in step with the list after a removal, and leave
 * every title the sponsor actually wrote alone.
 *
 * Delete the second of four and you should not be left staring at "Milestone 1,
 * 3, 4". But if someone typed "Escrow and settlement", renaming that to
 * "Milestone 2" would be worse than the gap.
 */
export function renumber(milestones: MilestoneForm[]): MilestoneForm[] {
  return milestones.map((milestone, index) =>
    /^Milestone \d+$/.test(milestone.title) ? { ...milestone, title: autoTitle(index) } : milestone,
  );
}

/**
 * What is wrong with this milestone, in words a sponsor can act on.
 *
 * Returns null when nothing is. The contract enforces most of these too, but it
 * enforces them by reverting a transaction the sponsor has already signed and
 * paid a fee for, which is a terrible way to learn that a date is in the past.
 */
export function milestoneProblem(milestone: MilestoneForm): string | null {
  if (!milestone.title.trim()) return "Give every milestone a title.";
  if (new TextEncoder().encode(milestone.title.trim()).length > 200) {
    return "Keep milestone titles under 200 bytes.";
  }
  if (!milestone.startDate || !milestone.deadline) {
    return "Add a start date and due date to every milestone.";
  }

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

/** The first problem across the whole plan, or null when it is ready to sign. */
export function planProblemOf(milestones: readonly MilestoneForm[]): string | null {
  if (milestones.length === 0) return "Add at least one milestone.";
  return milestones.map(milestoneProblem).find(Boolean) ?? null;
}

export function accountIsValid(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value.trim());
}

export interface RoleCheck {
  sponsor: string | null;
  builder: string;
  reviewer: string;
}

/**
 * Why these three accounts cannot be used together, or null when they can.
 *
 * The contract refuses to create an engagement whose roles are not three
 * distinct addresses, so catching it here saves a wasted signature.
 */
export function roleProblemOf({ sponsor, builder, reviewer }: RoleCheck): string | null {
  if (!sponsor) return "Connect the sponsor wallet.";
  if (!accountIsValid(builder)) return "Enter a valid G… account for the builder.";
  if (!accountIsValid(reviewer)) {
    return "Enter a valid G… account for the reviewer, or choose to review it yourself.";
  }
  if (builder.trim() === sponsor) return "The builder cannot be the sponsor's own account.";
  if (builder.trim() === reviewer) return "The builder cannot also be the reviewer.";
  return null;
}

/** Total USDC allocated across the plan, skipping anything unparseable. */
export function allocatedTotal(milestones: readonly MilestoneForm[]): bigint {
  return milestones.reduce((sum, milestone) => {
    try {
      return sum + parseUsdc(milestone.amount || "0");
    } catch {
      return sum;
    }
  }, 0n);
}

/**
 * Spread an award evenly, handing any indivisible remainder to the first
 * milestone so the split always adds back up to exactly the total.
 *
 * Losing a stroop to rounding would leave the escrow short of what the sponsor
 * thinks they committed, and the contract funds the sum of the parts.
 */
export function splitEvenly(total: bigint, count: number): string[] {
  if (total <= 0n || count <= 0) return [];
  const share = total / BigInt(count);
  const leftover = total - share * BigInt(count);
  return Array.from({ length: count }, (_, index) =>
    usdcInputValue(index === 0 ? share + leftover : share),
  );
}

/** How far the sponsor has got, as the index of the last completed step. */
export function completedThrough(gates: {
  sourceReady: boolean;
  milestonesReady: boolean;
  rolesReady: boolean;
  signed: boolean;
}): number {
  if (!gates.sourceReady) return 0;
  if (!gates.milestonesReady) return 1;
  if (!gates.rolesReady) return 2;
  return gates.signed ? 4 : 3;
}

/** Plain-language age of a restored draft — "a moment ago", "yesterday". */
export function sinceWhen(savedAt: number, now = Date.now()): string {
  const minutes = Math.round((now - savedAt) / 60_000);
  if (minutes < 2) return "a moment ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** An account address short enough to sit in a receipt row. */
export function shortAccount(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value || "—";
}
