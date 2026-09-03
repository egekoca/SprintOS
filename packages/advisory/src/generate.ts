import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type AdvisoryReport,
  type CriteriaDocument,
  type EvidenceBundle,
  DISCLAIMER,
  REPORT_SCHEMA_VERSION,
  sha256Prefixed,
} from "@sprintos/schemas";
import { fetchAllEvidence, type FetchedEvidence } from "./fetch.ts";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.ts";
import { type Draft, normalizeCriterionId, parseReport, validateDraft } from "./validate.ts";
import { requestStructuredJson } from "./openai.ts";

export const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.6";

/**
 * What the model is asked to return.
 *
 * Narrower than the stored report on purpose: `binding`, `disclaimer`,
 * `report_hash` and the identifiers are set by this module afterwards, so
 * there is no shape in which the model could assert that its own report is
 * binding.
 */
const ModelOutput = z.object({
  advisory_score: z.number().int().min(0).max(100),
  recommendation: z.enum(["ReadyForReview", "RevisionSuggested"]),
  criteria: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        verdict: z.enum(["met", "partially_met", "not_met", "cannot_verify"]),
        confidence: z.enum(["high", "medium", "low"]),
        supporting_links: z.array(z.string()),
        rationale: z.string(),
      }),
    )
    .min(1)
    .max(5),
  missing_information: z.array(z.string()).max(20),
});

const MODEL_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["advisory_score", "recommendation", "criteria", "missing_information"],
  properties: {
    advisory_score: { type: "integer", minimum: 0, maximum: 100 },
    recommendation: { type: "string", enum: ["ReadyForReview", "RevisionSuggested"] },
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "verdict", "confidence", "supporting_links", "rationale"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          verdict: { type: "string", enum: ["met", "partially_met", "not_met", "cannot_verify"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          supporting_links: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
      },
    },
    missing_information: { type: "array", maxItems: 20, items: { type: "string" } },
  },
} as const;

export interface GenerateOptions {
  criteria: CriteriaDocument;
  evidence: EvidenceBundle;
  model?: string;
  /** Injected in tests and fixtures so no network call is made. */
  fetcher?: (bundle: EvidenceBundle) => Promise<FetchedEvidence[]>;
}

/**
 * Raised when a report cannot be produced.
 *
 * The reviewer screen catches this and carries on: Approve and Hold stay
 * available with no report at all. The module is an aid, and an aid that is
 * down must not stop a human from working.
 */
export class AdvisoryUnavailableError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AdvisoryUnavailableError";
    this.cause = cause;
  }
}

/**
 * Produce an advisory report for one milestone.
 *
 * Runs only when called. Nothing in this package schedules, polls, or watches a
 * repository, and there is no webhook that reaches it.
 */
export async function generateReport(options: GenerateOptions): Promise<AdvisoryReport> {
  const { criteria, evidence } = options;
  const model = options.model ?? DEFAULT_MODEL;

  // Criteria are created before the contract assigns its numeric engagement
  // id and are bound later by their on-chain content hash. The milestone index
  // must still agree; the final report identity comes from the post-creation
  // evidence bundle.
  if (criteria.milestone_idx !== evidence.milestone_idx) {
    throw new AdvisoryUnavailableError(
      "The criteria and the evidence bundle describe different milestone indexes.",
    );
  }

  const fetched = options.fetcher
    ? await options.fetcher(evidence)
    : await fetchAllEvidence(evidence.links);

  let draft: Draft;
  try {
    const response = await requestStructuredJson({
      model,
      maxOutputTokens: 16000,
      reasoningEffort: "medium",
      instructions: SYSTEM_PROMPT,
      input: buildUserPrompt(criteria, fetched),
      name: "advisory_report",
      schema: MODEL_OUTPUT_SCHEMA,
    });
    draft = ModelOutput.parse(response) as Draft;
  } catch (err) {
    if (err instanceof AdvisoryUnavailableError) throw err;
    throw new AdvisoryUnavailableError(
      err instanceof Error ? err.message : "The advisory service could not be reached.",
      err,
    );
  }

  validateDraft(draft, criteria, evidence.links);

  /* Store the sponsor's own id for each criterion, not whatever spelling the
     model handed back. The report is read next to the criteria document, and
     a reviewer should not have to work out that `[c1]` and `c1` are the same
     requirement. */
  draft.criteria = draft.criteria.map((assessed) => {
    const match = criteria.criteria.find(
      (c) => normalizeCriterionId(c.id) === normalizeCriterionId(assessed.id),
    );
    return match ? { ...assessed, id: match.id } : assessed;
  });

  return assembleReport({ draft, criteria, evidence, fetched, model });
}

interface AssembleInput {
  draft: Draft;
  criteria: CriteriaDocument;
  evidence: EvidenceBundle;
  fetched: readonly FetchedEvidence[];
  model: string;
  /** Overrides for deterministic fixtures. */
  reportId?: string;
  generatedAt?: string;
}

/**
 * Attach the module's own fields and seal the report with a hash.
 *
 * `binding: false` and the disclaimer are written here, from constants, not
 * copied from anything the model produced.
 */
export function assembleReport(input: AssembleInput): AdvisoryReport {
  const { draft, criteria, evidence, fetched, model } = input;

  const withoutHash = {
    schema_version: REPORT_SCHEMA_VERSION,
    report_id: input.reportId ?? randomUUID(),
    engagement_id: evidence.engagement_id,
    milestone_idx: criteria.milestone_idx,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    model,
    binding: false as const,
    disclaimer: DISCLAIMER,
    advisory_score: draft.advisory_score,
    recommendation: draft.recommendation as AdvisoryReport["recommendation"],
    criteria: draft.criteria as AdvisoryReport["criteria"],
    evidence: fetched.map((f) => ({
      url: f.url,
      type: f.type,
      fetched: f.fetched,
      public: f.public,
      summary: f.fetched ? summarize(f.content) : (f.error ?? "Not retrieved."),
      ...(f.error ? { error: f.error } : {}),
    })),
    missing_information: draft.missing_information,
  };

  return parseReport({ ...withoutHash, report_hash: sha256Prefixed(withoutHash) });
}

/** First couple of lines of a fetched source, for the evidence table. */
function summarize(content: string): string {
  const summary = content.split("\n").filter(Boolean).slice(0, 3).join(" · ");
  return summary.length > 800 ? `${summary.slice(0, 797)}...` : summary;
}

/**
 * Recompute a report's hash and compare.
 *
 * Lets a reviewer — or an Ambassador auditing the evidence pack — confirm that
 * a stored report is byte-identical to the one that was generated.
 */
export function verifyReportHash(report: AdvisoryReport): boolean {
  const { report_hash, ...rest } = report;
  return sha256Prefixed(rest) === report_hash;
}
