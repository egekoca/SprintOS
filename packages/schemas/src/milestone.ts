import { z } from "zod";

/**
 * Shapes shared by the contract, the advisory module and the web app.
 *
 * The contract stores only amounts, deadlines, statuses and hashes. The prose —
 * acceptance criteria, evidence links, advisory reports — lives here and
 * off-chain, with a sha256 anchored on ledger so the record is tamper-evident.
 */

/** The SOW caps both of these at five. */
export const MAX_CRITERIA = 5;
export const MAX_EVIDENCE = 5;
export const MAX_MILESTONES = 3;

export const MilestoneStatus = z.enum([
  "Pending",
  "EvidenceSubmitted",
  "Approved",
  "Held",
  "Released",
  "Refunded",
]);
export type MilestoneStatus = z.infer<typeof MilestoneStatus>;

export const EngagementStatus = z.enum(["Draft", "Funded", "Closed"]);
export type EngagementStatus = z.infer<typeof EngagementStatus>;

/** A single, checkable condition for accepting a milestone. */
export const AcceptanceCriterion = z.object({
  id: z.string().min(1),
  text: z.string().min(4).max(500),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

export const EvidenceType = z.enum([
  "repo",
  "commit",
  "pull_request",
  "test_result",
  "docs",
  "demo",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

/**
 * A public link the builder offers as proof.
 *
 * `https` only, and no credentials in the URL — the advisory module fetches
 * these, and it must never be handed a secret to replay.
 */
export const EvidenceLink = z.object({
  url: z
    .url()
    .refine((u) => u.startsWith("https://"), "Evidence links must use https")
    .refine((u) => !/:\/\/[^/@]*@/.test(u), "Evidence links must not embed credentials"),
  type: EvidenceType,
  label: z.string().max(120).optional(),
});
export type EvidenceLink = z.infer<typeof EvidenceLink>;

/** What the builder submits, and what `evidence_hash` on chain commits to. */
export const EvidenceBundle = z.object({
  schema_version: z.literal("1.0.0"),
  engagement_id: z.string().regex(/^(0|[1-9]\d*)$/, "Evidence must reference a numeric engagement id"),
  milestone_idx: z.number().int().min(0).max(MAX_MILESTONES - 1),
  submitted_at: z.iso.datetime(),
  note: z.string().max(2000).optional(),
  links: z.array(EvidenceLink).min(1).max(MAX_EVIDENCE),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundle>;

/** What `criteria_hash` on chain commits to. */
export const CriteriaDocument = z.object({
  schema_version: z.literal("1.0.0"),
  engagement_id: z.string().regex(
    /^(?:0|[1-9]\d*|draft:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    "Criteria must reference a numeric engagement id or a UUID draft reference",
  ),
  milestone_idx: z.number().int().min(0).max(MAX_MILESTONES - 1),
  title: z.string().min(1).max(200),
  criteria: z.array(AcceptanceCriterion).min(1).max(MAX_CRITERIA),
});
export type CriteriaDocument = z.infer<typeof CriteriaDocument>;
