import { z } from "zod";
import { EvidenceType, MAX_CRITERIA, MAX_EVIDENCE } from "./milestone.ts";

/**
 * The advisory report.
 *
 * Two fields carry the project's central guarantee and are pinned as literals
 * so a report can never be constructed claiming otherwise: `binding` is always
 * false, and `disclaimer` always says so in words. A report is an opinion
 * handed to a human, and nothing else in the system reads it.
 */

export const REPORT_SCHEMA_VERSION = "1.0.0" as const;

export const DISCLAIMER =
  "Advisory only. This report is not binding. It cannot approve a milestone, authorize a transaction, or release funds. Only the assigned human reviewer can do that, by signing with their own wallet." as const;

export const CriterionVerdict = z.enum([
  /** The evidence plainly satisfies the criterion. */
  "met",
  /** Some of it is there; something specific is missing. */
  "partially_met",
  /** The evidence contradicts the criterion or shows it undone. */
  "not_met",
  /**
   * The evidence does not say. Distinct from `not_met` on purpose: a dead link
   * or a private repo is the module failing to see, not the builder failing to
   * deliver, and collapsing the two would quietly punish builders for the
   * module's blind spots.
   */
  "cannot_verify",
]);
export type CriterionVerdict = z.infer<typeof CriterionVerdict>;

export const Confidence = z.enum(["high", "medium", "low"]);

export const Recommendation = z.enum(["ReadyForReview", "RevisionSuggested"]);
export type Recommendation = z.infer<typeof Recommendation>;

export const CriterionAssessment = z.object({
  id: z.string(),
  text: z.string(),
  verdict: CriterionVerdict,
  confidence: Confidence,
  /** Must be a subset of the submitted evidence URLs — enforced on validation. */
  supporting_links: z.array(z.url()).max(MAX_EVIDENCE),
  rationale: z.string().min(1).max(600),
});
export type CriterionAssessment = z.infer<typeof CriterionAssessment>;

export const EvidenceAssessment = z.object({
  url: z.url(),
  type: EvidenceType,
  /** Whether the module successfully retrieved it. */
  fetched: z.boolean(),
  /** Whether it was publicly readable. Private sources are never opened. */
  public: z.boolean(),
  summary: z.string().max(800),
  error: z.string().max(300).optional(),
});
export type EvidenceAssessment = z.infer<typeof EvidenceAssessment>;

export const AdvisoryReport = z.object({
  schema_version: z.literal(REPORT_SCHEMA_VERSION),
  report_id: z.uuid(),
  engagement_id: z.string(),
  milestone_idx: z.number().int().min(0),
  generated_at: z.iso.datetime(),
  model: z.string(),

  /** Always false. The type system will not let a binding report exist. */
  binding: z.literal(false),
  disclaimer: z.literal(DISCLAIMER),

  advisory_score: z.number().int().min(0).max(100),
  recommendation: Recommendation,

  criteria: z.array(CriterionAssessment).min(1).max(MAX_CRITERIA),
  evidence: z.array(EvidenceAssessment).max(MAX_EVIDENCE),
  missing_information: z.array(z.string().max(300)).max(20),

  /** sha256 of the canonical report with this field removed. */
  report_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});
export type AdvisoryReport = z.infer<typeof AdvisoryReport>;

/** The report before hashing — what the model is asked to produce. */
export const AdvisoryReportDraft = AdvisoryReport.omit({
  report_hash: true,
  report_id: true,
  generated_at: true,
  model: true,
  binding: true,
  disclaimer: true,
  schema_version: true,
  engagement_id: true,
  milestone_idx: true,
});
export type AdvisoryReportDraft = z.infer<typeof AdvisoryReportDraft>;
