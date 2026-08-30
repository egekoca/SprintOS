/**
 * Build the three sample advisory reports the Statement of Work asks for:
 * a complete delivery, a partial delivery, and insufficient evidence.
 *
 * They are assembled from fixed drafts rather than a live model call, so anyone
 * — including an Ambassador checking the evidence pack — can regenerate them
 * byte-for-byte with `pnpm --filter @sprintos/advisory fixtures` and get the
 * same report hashes. A sample that changed on every run would prove nothing.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CriteriaDocument, EvidenceBundle } from "@sprintos/schemas";
import { assembleReport } from "./generate.ts";
import type { FetchedEvidence } from "./fetch.ts";
import type { Draft } from "./validate.ts";
import { validateDraft } from "./validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "fixtures");

const REPO = "https://github.com/egekoca/SprintOS";
const PR = "https://github.com/egekoca/SprintOS/pull/1";
const TESTS = "https://github.com/egekoca/SprintOS/actions/runs/1";
const DOCS = "https://github.com/egekoca/SprintOS/blob/main/docs/ARCHITECTURE.md";
const EXPLORER =
  "https://stellar.expert/explorer/testnet/contract/CAJUEUOEP6UUNLQ65XOINCUNVBXYPOGNWZC2XZQE7HRV66KTLERPHLND";

const criteria: CriteriaDocument = {
  schema_version: "1.0.0",
  engagement_id: "0",
  milestone_idx: 0,
  title: "Soroban settlement contract",
  criteria: [
    { id: "c1", text: "The settlement contract is deployed to Stellar testnet and its contract id is public" },
    { id: "c2", text: "Unauthorized callers cannot approve a milestone or release funds" },
    { id: "c3", text: "A milestone cannot be released twice" },
    { id: "c4", text: "A sponsor can reclaim an undelivered milestone after its deadline, but not before" },
    { id: "c5", text: "An automated test shows that an advisory score of 100 cannot release funds" },
  ],
};

function bundle(links: EvidenceBundle["links"]): EvidenceBundle {
  return {
    schema_version: "1.0.0",
    engagement_id: "0",
    milestone_idx: 0,
    submitted_at: "2026-08-24T10:00:00.000Z",
    links,
  };
}

function fetched(url: string, type: FetchedEvidence["type"], content: string): FetchedEvidence {
  return { url, type, fetched: true, public: true, content };
}

function unreachable(url: string, type: FetchedEvidence["type"], error: string): FetchedEvidence {
  return { url, type, fetched: false, public: false, content: "", error };
}

interface Sample {
  name: string;
  reportId: string;
  draft: Draft;
  evidence: EvidenceBundle;
  fetched: FetchedEvidence[];
}

const samples: Sample[] = [
  // ─────────────────────────────────────────────── complete delivery
  {
    name: "01-complete-delivery",
    reportId: "11111111-1111-4111-8111-111111111111",
    evidence: bundle([
      { url: REPO, type: "repo" },
      { url: PR, type: "pull_request" },
      { url: TESTS, type: "test_result" },
      { url: DOCS, type: "docs" },
      { url: EXPLORER, type: "demo" },
    ]),
    fetched: [
      fetched(REPO, "repo", "Repository: egekoca/SprintOS · contracts/settlement present · 39 tests"),
      fetched(PR, "pull_request", "Pull request #1: Settlement contract · merged · +1420 / -0 across 11 files"),
      fetched(TESTS, "test_result", "test result: ok. 39 passed; 0 failed"),
      fetched(DOCS, "docs", "Architecture: roles, milestone state machine, authorization rules"),
      fetched(EXPLORER, "demo", "Contract CA7N7EPN… on Stellar testnet · 2 engagements settled"),
    ],
    draft: {
      advisory_score: 94,
      recommendation: "ReadyForReview",
      criteria: [
        { id: "c1", text: criteria.criteria[0]!.text, verdict: "met", confidence: "high", supporting_links: [EXPLORER, REPO], rationale: "The contract id resolves on the testnet explorer and matches the id recorded in the repository's deployment file." },
        { id: "c2", text: criteria.criteria[1]!.text, verdict: "met", confidence: "high", supporting_links: [TESTS, REPO], rationale: "Seven tests in negative_auth.rs present a valid signature from the wrong role and each is refused." },
        { id: "c3", text: criteria.criteria[2]!.text, verdict: "met", confidence: "high", supporting_links: [TESTS], rationale: "test_double_release_rejected asserts both the error and that the balance did not move a second time." },
        { id: "c4", text: criteria.criteria[3]!.text, verdict: "met", confidence: "high", supporting_links: [TESTS], rationale: "Refunds are covered before, at, and after the deadline, including the exact-deadline boundary." },
        { id: "c5", text: criteria.criteria[4]!.text, verdict: "met", confidence: "high", supporting_links: [TESTS, REPO], rationale: "test_ai_score_100_cannot_release constructs a 100/100 report and shows approve and release both refused without the reviewer's signature." },
      ],
      evidence: [],
      missing_information: [],
    },
  },

  // ──────────────────────────────────────────────── partial delivery
  {
    name: "02-partial-delivery",
    reportId: "22222222-2222-4222-8222-222222222222",
    evidence: bundle([
      { url: REPO, type: "repo" },
      { url: PR, type: "pull_request" },
      { url: EXPLORER, type: "demo" },
    ]),
    fetched: [
      fetched(REPO, "repo", "Repository: egekoca/SprintOS · contracts/settlement present"),
      fetched(PR, "pull_request", "Pull request #1: Settlement contract · open · +860 / -0 across 6 files"),
      fetched(EXPLORER, "demo", "Contract CA7N7EPN… on Stellar testnet"),
    ],
    draft: {
      advisory_score: 58,
      recommendation: "RevisionSuggested",
      criteria: [
        { id: "c1", text: criteria.criteria[0]!.text, verdict: "met", confidence: "high", supporting_links: [EXPLORER], rationale: "The contract id resolves on the testnet explorer." },
        { id: "c2", text: criteria.criteria[1]!.text, verdict: "partially_met", confidence: "medium", supporting_links: [PR], rationale: "The diff adds require_auth on approve and release, but no test output was submitted showing a wrong-role call being refused." },
        { id: "c3", text: criteria.criteria[2]!.text, verdict: "cannot_verify", confidence: "low", supporting_links: [], rationale: "No test result or transaction was submitted that attempts a second release." },
        { id: "c4", text: criteria.criteria[3]!.text, verdict: "partially_met", confidence: "medium", supporting_links: [PR], rationale: "A refund function with a deadline check is present in the diff; the before-deadline refusal is not demonstrated." },
        { id: "c5", text: criteria.criteria[4]!.text, verdict: "cannot_verify", confidence: "low", supporting_links: [], rationale: "No test file or run output covering the advisory-score case appears in the submitted evidence." },
      ],
      evidence: [],
      missing_information: [
        "A test run showing an unauthorized caller being refused on approve and release.",
        "A test asserting that a second release attempt fails and no balance moves.",
        "A test covering refund before the deadline.",
        "The test named in criterion 5, or its run output.",
      ],
    },
  },

  // ─────────────────────────────────────────── insufficient evidence
  {
    name: "03-insufficient-evidence",
    reportId: "33333333-3333-4333-8333-333333333333",
    evidence: bundle([
      { url: "https://github.com/egekoca/sprintos-private-notes", type: "repo" },
      { url: "https://example.com/wip", type: "docs" },
    ]),
    fetched: [
      unreachable("https://github.com/egekoca/sprintos-private-notes", "repo", "Not found, or private. Private sources are never opened."),
      fetched("https://example.com/wip", "docs", "Example Domain. This domain is for use in illustrative examples in documents."),
    ],
    draft: {
      advisory_score: 8,
      recommendation: "RevisionSuggested",
      criteria: [
        // Every verdict here is cannot_verify, not not_met. The module could not
        // see the work; that is a different claim from the work being absent,
        // and the difference is the builder's to benefit from.
        { id: "c1", text: criteria.criteria[0]!.text, verdict: "cannot_verify", confidence: "low", supporting_links: [], rationale: "No contract id or explorer link was submitted, and the linked repository is not publicly readable." },
        { id: "c2", text: criteria.criteria[1]!.text, verdict: "cannot_verify", confidence: "low", supporting_links: [], rationale: "No source or test output could be read." },
        { id: "c3", text: criteria.criteria[2]!.text, verdict: "cannot_verify", confidence: "low", supporting_links: [], rationale: "No source or test output could be read." },
        { id: "c4", text: criteria.criteria[3]!.text, verdict: "cannot_verify", confidence: "low", supporting_links: [], rationale: "No source or test output could be read." },
        { id: "c5", text: criteria.criteria[4]!.text, verdict: "cannot_verify", confidence: "low", supporting_links: [], rationale: "No source or test output could be read." },
      ],
      evidence: [],
      missing_information: [
        "The first link is private or does not exist. This module only reads public sources — a public repository, commit, or pull request is needed.",
        "The second link resolves to a placeholder page with no project content.",
        "A deployed contract id or explorer link.",
        "Test run output covering the authorization, duplicate-release and refund cases.",
      ],
    },
  },
];

mkdirSync(outDir, { recursive: true });
const index: Array<{ name: string; score: number; recommendation: string; report_hash: string }> = [];

for (const sample of samples) {
  validateDraft(sample.draft, criteria, sample.evidence.links);

  const report = assembleReport({
    draft: sample.draft,
    criteria,
    evidence: sample.evidence,
    fetched: sample.fetched,
    model: "claude-opus-5",
    reportId: sample.reportId,
    generatedAt: "2026-08-24T12:00:00.000Z",
  });

  writeFileSync(join(outDir, `${sample.name}.report.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(outDir, `${sample.name}.evidence.json`),
    `${JSON.stringify(sample.evidence, null, 2)}\n`,
  );
  index.push({
    name: sample.name,
    score: report.advisory_score,
    recommendation: report.recommendation,
    report_hash: report.report_hash,
  });
  console.log(`${sample.name.padEnd(28)} score ${String(report.advisory_score).padStart(3)}  ${report.report_hash}`);
}

writeFileSync(join(outDir, "criteria.json"), `${JSON.stringify(criteria, null, 2)}\n`);
writeFileSync(join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`\n${samples.length} sample reports written to packages/advisory/fixtures/`);
