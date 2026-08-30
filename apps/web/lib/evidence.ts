import deployment from "./stellar/deployment.json" with { type: "json" };

/**
 * The evidence packet, as data.
 *
 * Section 6 of the Statement of Work asks for evidence that is "clear,
 * verifiable, and easy to review by the Ambassador Chapter Lead with minimal
 * technical expertise", and section 6.2 has them tick present / partial /
 * missing per deliverable. This file is that packet: every requirement the SOW
 * names, what satisfies it, and where to look.
 *
 * It is written once and read twice — the `/evidence` page renders it for
 * someone with a browser, and `pnpm evidence:doc` renders the same content into
 * `docs/EVIDENCE.md` for someone reading the repository. Keeping one source
 * means the live page and the committed document cannot drift apart, which for
 * an evidence pack is the whole point.
 *
 * `todo` is deliberately visible rather than quietly omitted. An evidence pack
 * that hides its own gaps is worth less than one that names them.
 */

export type EvidenceStatus = "done" | "partial" | "todo";

export interface EvidenceRef {
  label: string;
  href: string;
}

export interface EvidenceItem {
  /** What the SOW asks for, in its own terms. */
  requirement: string;
  status: EvidenceStatus;
  /** What exists, and where. */
  detail: string;
  refs?: EvidenceRef[];
}

export interface EvidenceSection {
  id: string;
  title: string;
  budget: string;
  /** The SOW's own description of the evidence for this deliverable. */
  asked: string;
  items: EvidenceItem[];
}

const REPO = "https://github.com/egekoca/SprintOS";
const file = (path: string) => `${REPO}/blob/main/${path}`;

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export const DEPLOYMENT = {
  network: "Stellar testnet",
  contractId: deployment.settlementContractId,
  contractExplorer: `https://stellar.expert/explorer/testnet/contract/${deployment.settlementContractId}`,
  usdcSacId: deployment.usdcSacId,
  usdcExplorer: `https://stellar.expert/explorer/testnet/contract/${deployment.usdcSacId}`,
  repository: REPO,
  deployedAt: deployment.deployedAt,
} as const;

export const SECTIONS: EvidenceSection[] = [
  {
    id: "d1",
    title: "Deliverable 1 — Milestone settlement on Stellar testnet",
    budget: "1,700 USD",
    asked:
      "GitHub repository, deployed contract ID, deployment scripts, testnet transaction hashes, explorer links, and automated test results.",
    items: [
      {
        requirement:
          "One sponsor, one builder, one assigned human reviewer, testnet USDC, up to three milestones per engagement.",
        status: "done",
        detail:
          "The three roles are stored on the engagement and are required to be distinct. MAX_MILESTONES is 3 and create_engagement rejects a fourth.",
        refs: [
          { label: "types.rs", href: file("contracts/settlement/src/types.rs") },
          { label: "test_max_three_milestones", href: file("contracts/settlement/src/test/happy.rs") },
        ],
      },
      {
        requirement:
          "Each milestone carries a title, acceptance criteria, an allocated amount, a delivery deadline, and a current status.",
        status: "done",
        detail:
          "All five live in the Milestone struct. The criteria text stays off chain; its SHA-256 is stored, so the wording is fixed at funding time and cannot be edited afterwards.",
        refs: [{ label: "Milestone struct", href: file("contracts/settlement/src/types.rs") }],
      },
      {
        requirement:
          "Engagement creation, funding, evidence-submitted status, manual Approve or Hold, payment release, and deadline-based refund.",
        status: "done",
        detail:
          "create_engagement, fund, submit_evidence, approve, hold, release, refund. Approve and release are two separate signatures on purpose: judging the work and moving the money are different acts.",
        refs: [{ label: "lib.rs", href: file("contracts/settlement/src/lib.rs") }],
      },
      {
        requirement:
          "Protected actions use Soroban account authorization and the standard Stellar Asset Contract interface. No custom token, wallet, or signature system.",
        status: "done",
        detail:
          "Every value-moving entrypoint calls require_auth on the role recorded in contract storage. Settlement uses the testnet USDC SAC directly; nothing custom is minted or signed.",
        refs: [{ label: "Security model", href: file("docs/SECURITY.md") }],
      },
      {
        requirement:
          "Tests cover successful transactions, unauthorized calls, invalid states, duplicate release attempts, incorrect amounts, and early refunds.",
        status: "done",
        detail:
          "44 tests, all six categories: test_happy_path_release · test_stranger_cannot_release and test_unsigned_release_rejected · test_release_on_pending_rejected · test_double_release_rejected · test_zero_amount_rejected and test_total_amount_overflow_is_typed · test_early_refund_rejected. Run with `cargo test --package sprintos-settlement`.",
        refs: [{ label: "test suite", href: `${REPO}/tree/main/contracts/settlement/src/test` }],
      },
      {
        requirement:
          "Evidence showing engagement creation, funding, evidence submission, human approval, Hold, release, and refund on testnet, with transaction hashes and explorer links.",
        status: "todo",
        detail:
          "The contract is deployed and the demo scripts run the whole lifecycle, but no transaction hashes have been recorded yet. Run scripts/demo-release.sh and scripts/demo-refund.sh against testnet and list the resulting hashes here.",
        refs: [{ label: "demo scripts", href: `${REPO}/tree/main/scripts` }],
      },
    ],
  },
  {
    id: "d2",
    title: "Deliverable 2 — Advisory review module",
    budget: "1,200 USD",
    asked:
      "Advisory report schema, three sample reports, evidence fixtures, screenshots, module tests, report versions, and report hashes.",
    items: [
      {
        requirement:
          "Up to five acceptance criteria and up to five builder-selected evidence links per milestone: repository, commit, pull request, test result, documentation page, or demo.",
        status: "done",
        detail:
          "MAX_CRITERIA and MAX_EVIDENCE are both 5 and enforced by the schema on every write. The six evidence types are exactly the six the SOW names.",
        refs: [{ label: "milestone schema", href: file("packages/schemas/src/milestone.ts") }],
      },
      {
        requirement:
          "A structured report with an advisory score, criterion checklist, supporting links, missing information, and a Ready for Review / Revision Suggested recommendation.",
        status: "done",
        detail:
          "All five fields are required by the report schema, plus a report_hash: the SHA-256 of the canonical report with the hash field removed, so a report cannot be altered after the fact without detection.",
        refs: [{ label: "report schema", href: file("packages/schemas/src/report.ts") }],
      },
      {
        requirement:
          "The module runs only when requested, does not monitor repositories in the background, execute submitted code, or access private repositories.",
        status: "done",
        detail:
          "Generation happens on an explicit request from the reviewer's screen. Evidence retrieval is credential-free HTTPS with private, local and reserved addresses refused; repositories are read through the GitHub API as metadata and never cloned or run.",
        refs: [{ label: "fetch.ts", href: file("packages/advisory/src/fetch.ts") }],
      },
      {
        requirement:
          "No wallet, signing key, contract permission, or payment endpoint. Output never changes milestone state and is never used by the contract as an approval condition.",
        status: "done",
        detail:
          "The contract's ABI accepts no score and has no entrypoint an automated party can call. The boundary is also compile-enforced: a CI job fails the build if the advisory package acquires a Stellar SDK or any signing code.",
        refs: [
          { label: "check-boundaries.mjs", href: file("scripts/check-boundaries.mjs") },
          { label: "CI workflow", href: file(".github/workflows/ci.yml") },
        ],
      },
      {
        requirement:
          "A required test showing that even a score of 100 cannot release testnet USDC without the authorized human wallet.",
        status: "done",
        detail:
          "test_ai_score_100_cannot_release. Two companions make the point from the other side: test_ai_score_zero_does_not_block_human_approval and test_settlement_works_with_no_advisory_report_at_all — the advisory module is never on the critical path.",
        refs: [{ label: "ai_cannot_release.rs", href: file("contracts/settlement/src/test/ai_cannot_release.rs") }],
      },
      {
        requirement:
          "Three sample reports covering a complete delivery, a partial delivery, and insufficient evidence, with evidence fixtures and report hashes.",
        status: "done",
        detail:
          "01-complete-delivery scores 94, 02-partial-delivery scores 58, 03-insufficient-evidence scores 8. They are assembled from fixed drafts rather than a live model call, so `pnpm --filter @sprintos/advisory fixtures` regenerates them byte for byte and the hashes below can be checked independently.",
        refs: [{ label: "fixtures", href: `${REPO}/tree/main/packages/advisory/fixtures` }],
      },
      {
        requirement: "Screenshots of the module in use.",
        status: "todo",
        detail:
          "Capture the reviewer screen with a generated report: the criteria, the evidence, the score, and the two decision buttons in one frame.",
      },
    ],
  },
  {
    id: "d3",
    title: "Deliverable 3 — Public web MVP",
    budget: "1,200 USD",
    asked:
      "Public testnet website, sample engagement pages, role screenshots, wallet signing recording, transaction links, documentation, and demo video.",
    items: [
      {
        requirement:
          "Sponsor view: wallet connection, engagement creation, milestone definition, testnet USDC funding, and balance tracking.",
        status: "done",
        detail:
          "A four-step setup that locks each step until the previous one is complete: repository, milestone plan, roles, then review and fund. Nothing is signed until a final screen that states the milestones can never be edited afterwards.",
        refs: [{ label: "/sponsor", href: "/sponsor" }],
      },
      {
        requirement:
          "Builder view: assigned milestones and structured evidence submission.",
        status: "done",
        detail:
          "Each milestone shows its acceptance criteria in full, alongside a typed evidence form. The bundle is hashed and its hash is what the builder signs on chain.",
        refs: [{ label: "/builder", href: "/builder" }],
      },
      {
        requirement:
          "Reviewer view: original criteria, submitted evidence, and the advisory report side by side, then manual Approve and Hold.",
        status: "done",
        detail:
          "Both documents are re-hashed on the server and the decision buttons stay disabled unless both match the ledger. The reviewer must also tick an attestation that they read the evidence themselves. No score ever enables a button.",
        refs: [{ label: "/review", href: "/review" }],
      },
      {
        requirement:
          "For release or refund, the application prepares the transaction and the authorized user reviews and signs it through the connected wallet.",
        status: "done",
        detail:
          "Every write is simulated, prepared, and handed to the wallet. The application holds no key and there is no server-side signing path.",
      },
      {
        requirement:
          "The interface displays milestone status, amounts, deadlines, transaction hashes, and Stellar explorer links.",
        status: "done",
        detail:
          "The public engagement page shows all of them, including a settlement log listing every transaction in order with its signer and its explorer link. The contract records what a milestone's state is but not which transaction produced it, so the application keeps that index — and never trusts it: the server re-reads each transaction from the network and decodes the action, the signer and the milestone from the envelope before storing anything.",
        refs: [{ label: "public engagement page", href: "/e/0" }],
      },
      {
        requirement:
          "A public demo including one completed approval and release scenario and one Hold or refund scenario.",
        status: "todo",
        detail:
          "Create two engagements on testnet from the deployed site — take one through approve and release, and one through hold and refund-after-deadline — then link both public pages here.",
      },
      {
        requirement:
          "Documentation: setup guide, usage guide, security notes, reviewer checklist.",
        status: "partial",
        detail:
          "Architecture, security model and this evidence pack are written. The setup and usage guide covers running and operating the app; a demo video is still outstanding.",
        refs: [
          { label: "Setup and usage", href: file("docs/SETUP.md") },
          { label: "Architecture", href: file("docs/ARCHITECTURE.md") },
          { label: "Security model", href: file("docs/SECURITY.md") },
        ],
      },
      {
        requirement: "Role screenshots, wallet signing recording, and demo video.",
        status: "todo",
        detail:
          "One recording covering the full path — sponsor funds, builder submits, reviewer reads the advisory report and signs the release — satisfies the demo video and the signing recording together.",
      },
    ],
  },
];

/** The three sample reports, with the hashes anyone can regenerate. */
export const SAMPLE_REPORTS = [
  { name: "01-complete-delivery", score: 94, hash: "sha256:cce8f793ffb6cfde7bcbb7fef876cac080bb5c7ef71c434a7da0e2b0cb91e0ce" },
  { name: "02-partial-delivery", score: 58, hash: "sha256:583cbd4b641d4d1150c01e73fd7e1203c47a4f248e65efd6f93a48abd3d7b319" },
  { name: "03-insufficient-evidence", score: 8, hash: "sha256:bbc30f374725d2cd29267587c320e8ba441bae4870522725689bde60f7b08d5f" },
] as const;

/** What an Ambassador can run to check the claims above without trusting them. */
export const VERIFY_COMMANDS = [
  { what: "Every contract test, including the AI-cannot-release test", cmd: "cargo test --package sprintos-settlement" },
  { what: "The advisory module cannot reach the chain", cmd: "pnpm lint:boundaries" },
  { what: "Application and schema tests", cmd: "pnpm test" },
  { what: "Regenerate the three sample reports and compare hashes", cmd: "pnpm --filter @sprintos/advisory fixtures" },
] as const;

export function countByStatus(status: EvidenceStatus): number {
  return SECTIONS.reduce(
    (total, section) => total + section.items.filter((item) => item.status === status).length,
    0,
  );
}
