import { AdvisoryReport, type CriteriaDocument, type EvidenceLink } from "@sprintos/schemas";

/**
 * Checks applied to the model's output before a reviewer ever sees it.
 *
 * The schema in `@sprintos/schemas` already guarantees shape. What is left are
 * the claims a well-formed report can still get wrong: citing a URL nobody
 * submitted, assessing a criterion nobody set, or silently dropping one.
 */

export class ReportValidationError extends Error {
  readonly problems: readonly string[];

  constructor(message: string, problems: readonly string[]) {
    super(message);
    this.name = "ReportValidationError";
    this.problems = problems;
  }
}

export interface DraftCriterion {
  id: string;
  text: string;
  verdict: string;
  confidence: string;
  supporting_links: string[];
  rationale: string;
}

export interface Draft {
  advisory_score: number;
  recommendation: string;
  criteria: DraftCriterion[];
  evidence: unknown[];
  missing_information: string[];
}

/** Compare URLs without tripping over a trailing slash or a `.git` suffix. */
function normalizeUrl(url: string): string {
  // Order matters: a trailing slash would hide the .git suffix behind it.
  return url.trim().replace(/\/+$/, "").replace(/\.git$/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * Reject a report that cites anything outside the submitted evidence.
 *
 * A model that has read injected text may try to cite a URL it was handed
 * inside that text. Dropping such citations silently would leave a reviewer
 * looking at a link the builder never offered, so the whole report is refused
 * instead.
 */
export function checkCitations(
  draft: Draft,
  submitted: readonly EvidenceLink[],
): string[] {
  const allowed = new Set(submitted.map((l) => normalizeUrl(l.url)));
  const problems: string[] = [];

  for (const criterion of draft.criteria) {
    for (const link of criterion.supporting_links) {
      if (!allowed.has(normalizeUrl(link))) {
        problems.push(
          `Criterion ${criterion.id} cites ${link}, which was not submitted as evidence.`,
        );
      }
    }
  }
  return problems;
}

/** Every criterion assessed exactly once, and no invented ones. */
/**
 * Compare criterion ids without tripping over how the model wrote them.
 *
 * Asked to assess `c1`, the model sometimes answers `[c1]`, sometimes `C1`.
 * The id is a label the report carries back, not a claim about the work, and
 * refusing an otherwise sound report over a pair of brackets threw away a
 * genuine assessment roughly one run in five. Anything that survives this is
 * still checked against the criteria the sponsor actually set.
 */
export function normalizeCriterionId(id: string): string {
  return id.trim().replace(/^[[({<"'\s]+|[\])}>"'\s]+$/g, "").toLowerCase();
}

export function checkCriteriaCoverage(draft: Draft, criteria: CriteriaDocument): string[] {
  const expected = criteria.criteria.map((c) => normalizeCriterionId(c.id));
  const got = draft.criteria.map((c) => normalizeCriterionId(c.id));
  const problems: string[] = [];

  for (const [i, id] of expected.entries()) {
    if (!got.includes(id)) problems.push(`Criterion ${criteria.criteria[i].id} was not assessed.`);
  }
  for (const [i, id] of got.entries()) {
    if (!expected.includes(id)) {
      problems.push(`Report assesses ${draft.criteria[i].id}, which is not a criterion of this milestone.`);
    }
  }
  const duplicates = got.filter((id, i) => got.indexOf(id) !== i);
  for (const id of new Set(duplicates)) {
    problems.push(`Criterion ${id} was assessed more than once.`);
  }
  return problems;
}

/**
 * A score that contradicts its own findings is worse than no score: a reviewer
 * skimming the number would take away the opposite of what the report says.
 */
export function checkScoreCoherence(draft: Draft): string[] {
  const problems: string[] = [];
  const verdicts = draft.criteria.map((c) => c.verdict);
  const met = verdicts.filter((v) => v === "met").length;
  const total = verdicts.length || 1;

  if (draft.advisory_score >= 90 && met < total) {
    problems.push(
      `Score of ${draft.advisory_score} claims near-perfect delivery, but only ${met} of ${total} criteria are marked met.`,
    );
  }
  if (draft.advisory_score <= 20 && met === total) {
    problems.push(
      `Score of ${draft.advisory_score} suggests failure, but every criterion is marked met.`,
    );
  }
  if (draft.recommendation === "ReadyForReview" && verdicts.includes("not_met")) {
    problems.push("Recommends review while marking a criterion not met.");
  }
  return problems;
}

/** Run every check. Throws with all problems at once rather than the first. */
export function validateDraft(
  draft: Draft,
  criteria: CriteriaDocument,
  submitted: readonly EvidenceLink[],
): void {
  const problems = [
    ...checkCitations(draft, submitted),
    ...checkCriteriaCoverage(draft, criteria),
    ...checkScoreCoherence(draft),
  ];
  if (problems.length > 0) {
    throw new ReportValidationError(
      `The advisory report failed ${problems.length} validation check(s).`,
      problems,
    );
  }
}

/** Final gate: the assembled report must satisfy its own schema. */
export function parseReport(value: unknown) {
  return AdvisoryReport.parse(value);
}
