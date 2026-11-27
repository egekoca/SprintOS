/**
 * The Review API's keyless demo sample.
 *
 * Exactly the request shown in `docs/REVIEW-API.md`'s own "Calling it"
 * section, assembled from a fixed draft rather than a live model call — the
 * same reasoning `make-fixtures.ts` gives for the three Month-1 samples. The
 * public demo endpoint (`GET /api/v1/review/demo`) calls `buildDemoReport`
 * directly, so what a curious caller gets back with no API key and no wallet
 * is byte-identical to what ships in the evidence package, and `pnpm
 * --filter @sprintos/advisory fixtures` regenerates that copy from this same
 * definition.
 */
import type { CriteriaDocument, EvidenceBundle } from "@sprintos/schemas";
import { assembleReport } from "./generate.ts";
import type { FetchedEvidence } from "./fetch.ts";
import type { Draft } from "./validate.ts";

const REPO = "https://github.com/egekoca/SprintOS";
const DEMO_VIDEO = "https://sprintos-ai.vercel.app/evidence";

export const DEMO_CRITERIA: CriteriaDocument = {
  schema_version: "1.0.0",
  engagement_id: "0",
  milestone_idx: 0,
  title: "Hackathon submission rubric",
  outcome: "A complete, judgeable submission",
  criteria: [
    { id: "c1", text: "Project has a public repository with a README" },
    { id: "c2", text: "Project demonstrates a working demo" },
  ],
};

export const DEMO_EVIDENCE: EvidenceBundle = {
  schema_version: "1.0.0",
  engagement_id: "0",
  milestone_idx: 0,
  submitted_at: "2026-11-01T00:00:00.000Z",
  links: [
    { url: REPO, type: "repo" },
    { url: DEMO_VIDEO, type: "demo" },
  ],
};

const DEMO_FETCHED: FetchedEvidence[] = [
  {
    url: REPO,
    type: "repo",
    fetched: true,
    public: true,
    content: "Repository: egekoca/SprintOS · README present · MIT licensed",
  },
  {
    url: DEMO_VIDEO,
    type: "demo",
    fetched: true,
    public: true,
    content: "Public evidence pack: live Mainnet engagements, AI-boundary proof, demo recordings",
  },
];

const DEMO_DRAFT: Draft = {
  advisory_score: 82,
  recommendation: "ReadyForReview",
  criteria: [
    {
      id: "c1",
      text: "Project has a public repository with a README",
      verdict: "met",
      score: 95,
      confidence: "high",
      supporting_links: [REPO],
      rationale: "The repository is public and its README documents the project.",
    },
    {
      id: "c2",
      text: "Project demonstrates a working demo",
      verdict: "met",
      score: 78,
      confidence: "medium",
      supporting_links: [DEMO_VIDEO],
      rationale: "The linked evidence pack shows the product running against real Mainnet engagements rather than a mockup.",
    },
  ],
  evidence: [],
  missing_information: [],
};

const DEMO_REPORT_ID = "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0";
const DEMO_GENERATED_AT = "2026-11-01T00:00:00.000Z";

/**
 * Build the fixed demo report.
 *
 * Deterministic: same inputs, same `reportId`, same `generatedAt` in, same
 * `report_hash` out, every time — the whole point of a sample anyone can
 * check independently rather than one that only looks reproducible.
 */
export function buildDemoReport() {
  return assembleReport({
    draft: DEMO_DRAFT,
    criteria: DEMO_CRITERIA,
    evidence: DEMO_EVIDENCE,
    fetched: DEMO_FETCHED,
    model: "gpt-5.6",
    reportId: DEMO_REPORT_ID,
    generatedAt: DEMO_GENERATED_AT,
  });
}
