import { z } from "zod";
import { MAX_MILESTONES } from "./milestone.ts";

/**
 * The settlement log for one engagement.
 *
 * The contract is the authority for *state*; it does not and cannot record the
 * transaction hash that produced each state change. That hash is what the
 * Statement of Work asks the interface to display, and what an Ambassador needs
 * in order to open a payment on an explorer rather than take a screenshot's word
 * for it.
 *
 * So the application keeps an index of them. It is deliberately only an index:
 * every entry is verified against the network before it is stored, carries the
 * hash it claims, and is presented next to a link that lets the reader check it
 * on chain themselves. Nothing in the system reads this log to make a decision.
 */

export const ACTIVITY_SCHEMA_VERSION = "1.0.0" as const;

export const ActivityAction = z.enum([
  /** Engagement-level: no milestone index. */
  "created",
  "funded",
  /** Milestone-level. */
  "evidence_submitted",
  "approved",
  "held",
  "released",
  "claimed",
  "refunded",
]);
export type ActivityAction = z.infer<typeof ActivityAction>;

/** Which actions belong to a single milestone rather than the engagement. */
export const MILESTONE_ACTIONS: ReadonlySet<ActivityAction> = new Set([
  "evidence_submitted",
  "approved",
  "held",
  "released",
  "claimed",
  "refunded",
]);

export const ActivityEntry = z.object({
  engagement_id: z.string().regex(/^(0|[1-9]\d*)$/, "Activity must reference a numeric engagement id"),
  milestone_idx: z.number().int().min(0).max(MAX_MILESTONES - 1).optional(),
  action: ActivityAction,
  /** The Stellar transaction hash, lower-case hex. */
  tx_hash: z.string().regex(/^[0-9a-f]{64}$/, "Expected a 32-byte hexadecimal transaction hash"),
  /** The account that signed it. */
  actor: z.string().regex(/^G[A-Z2-7]{55}$/, "Expected a Stellar account id"),
  at: z.iso.datetime(),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;

/**
 * The whole log, capped.
 *
 * Three milestones can produce at most a handful of transitions each; the cap
 * is generous enough for resubmissions and mean enough that a wrong or hostile
 * caller cannot grow the file without bound.
 */
export const ActivityLog = z.object({
  schema_version: z.literal(ACTIVITY_SCHEMA_VERSION),
  engagement_id: z.string().regex(/^(0|[1-9]\d*)$/),
  entries: z.array(ActivityEntry).max(60),
});
export type ActivityLog = z.infer<typeof ActivityLog>;
