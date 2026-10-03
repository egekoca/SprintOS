# Month-2 Completion Plan (toward the Month-3 Instaward application)

Generated 2026-10-02 from the signed SOW (`2026.08.31_Instawards SOW - Ege
Yenikale 2nd Month (1).docx`) and the Customer Development Plan
(`2026.09.01_Instawards Customer Development Plan - SprintOS AI Reviewer
(1).docx`). This supersedes `docs/SECOND-MONTH-SOW-DRAFT.md`, which was a
smaller, earlier proposal — the signed SOW is materially larger in scope.

## 0. Where we actually stand

- Suggested sprint start: **2026-09-15**. 30-day window ends **2026-10-15**.
- Today: **2026-10-02** → **13 calendar days left**.
- Last commit touching product code: **2026-09-16** (`c766c60`). 16 days with
  no engineering activity against this SOW's actual scope.
- Current branch `feat/workspace-and-ledger-fixes` has 5 uncommitted files —
  minor milestone-evidence/score display work, not new-SOW scope.
- The repo is still **testnet-only**. None of Deliverable 1 (mainnet, wallet
  accounts, Free/Plus, Plus payment), Deliverable 2 (multi-reviewer threshold,
  revision versioning, Public Proof page) or Deliverable 3 (rate limit UI
  wiring, concurrency lock, 5-user pilot, X account) exists yet in the form
  the signed SOW describes.
- What *does* already exist and is reusable:
  - `packages/advisory` + `packages/schemas`: solid, hash-anchored AI
    advisory pipeline. No changes needed for this scope.
  - `contracts/settlement`: has `add_reviewer` / `remove_reviewer` /
    `can_decide`, but **any one authorized reviewer can approve/release
    alone** — there is deliberately no on-chain M-of-N threshold (see the
    doc comment in `lib.rs`: "a team that wants 'two of us must agree' gets
    it by making an authorised address a Stellar multisig account, which
    this contract needs to know nothing about"). The signed SOW's "two of
    three human reviewers" requirement does **not** match this design as-is.
  - `apps/web/lib/rate-limit.ts` and `request-security.ts` already exist —
    Deliverable 3's rate-limit/dedup groundwork is partially there, just not
    applied to review/evidence routes with the per-wallet, per-plan logic
    the new SOW wants.
  - `deployments/testnet.json` — only testnet contract/asset IDs recorded.
    No mainnet config at all.

**Bottom line: the signed SOW's full scope (mainnet deploy + wallet Free/Plus
accounts + real 5 USDC payments + multi-reviewer thresholds + revision
versioning + Public Proof page + reliability controls + a real 5-person
mainnet pilot with a recorded session + a growing X account) is not
realistically shippable to pilot-ready quality by a solo builder in 13 days.**
Something has to be triaged. Section 3 proposes an order; Section 5 asks you
to confirm it before mainnet money moves.

## 1. Gap analysis by deliverable

### Deliverable 1 — Mainnet beta + wallet accounts + Free/Plus

| Requirement | Status | Note |
| --- | --- | --- |
| Mainnet contract deployment, canonical USDC SAC | **Missing** | Only testnet deployed. Need a reviewed-commit mainnet deploy, separate `deployments/mainnet.json`, explorer links. |
| Network-aware tx building, confirmation checks | **Partial** | Testnet confirmation/activity-index exists (`apps/web/lib/stellar`, `activity.ts`); needs a network switch, not new logic. |
| Wallet-based account (no email/password) | **Missing** | Today, a wallet is only a role inside one engagement (sponsor/builder/reviewer). There is no persistent "my account" concept across engagements. |
| Free plan: 3 Standard Reviews / 30 days | **Missing** | `rate-limit.ts` is generic; needs a per-wallet, rolling-30-day, review-type-aware counter. |
| Plus plan: 5 USDC / 30 days, 10 Standard + 5 Deep | **Missing** | Needs (a) a treasury wallet to receive payment, (b) a payment-verification poller (Horizon/RPC query for a matching payment op, no custodial key), (c) entitlement activation only after on-chain confirmation, (d) a "Deep Review" mode (higher `reasoning.effort`/token budget in `packages/advisory`, which already exposes that knob). |
| Standard vs Deep Review stays advisory-only | **Low risk** | Already structurally true (see `[[sprintos-ai-cannot-release-thesis]]`); Deep is just a bigger advisory call, not a new capability class. |

### Deliverable 2 — Multi-reviewer, revisions, Public Proof page

| Requirement | Status | Note |
| --- | --- | --- |
| Up to 3 human reviewers | **Partial** | Contract already supports multiple authorized reviewer addresses via `add_reviewer`. |
| Configurable approval **threshold** (e.g. 2 of 3) | **Missing, and contract-shaped** | Current contract design explicitly rejects on-chain threshold counting (single reviewer decides alone). Two real options, see Section 2. |
| Request Revision + criterion-level feedback | **Partial** | `hold()` exists on-chain; UI has a review flow (`apps/web/app/review`) but no structured per-criterion comment field yet. |
| Versioned evidence (V1 preserved, V2 new report) | **Missing** | `evidence.ts` / `store.ts` currently model one evidence bundle per milestone, not a version history with a separate advisory report per version. |
| Public Proof page | **Missing** | `/evidence` and `/evidence/ai-boundary` exist but are project-wide explainer pages, not a per-engagement page tying criteria + evidence versions + reports + reviewer decisions + the settlement tx into one read-only view. |

### Deliverable 3 — Reliability + pilot + public launch

| Requirement | Status | Note |
| --- | --- | --- |
| Rate limits on review/evidence actions | **Partial** | Library exists, not wired to the new plan-aware limits. |
| One active AI review job per milestone **version** | **Missing** | No job-lock concept yet; needs a version-aware lock (ties into the versioning work above). |
| Duplicate request protection | **Partial** | `request-security.ts` exists; needs a pass to confirm it covers the review/evidence endpoints with idempotency keys. |
| Pagination for growing lists | **Missing** | Current list views (`/app`, `/board`, `/projects`) appear unpaginated. |
| Bounded timeout/retry for external deps | **Partial** | `packages/advisory/openai.ts` already times out and classifies errors; GitHub fetch path (`fetch.ts`) should be checked the same way. |
| CI security regression (AI score 100 cannot release) | **Done** | `test_milestone_state_has_no_ai_writable_field`, `test_ai_score_zero_does_not_block_human_approval` exist and pass; keep green through every change here. |
| 5 pilot users + feedback form + 1 recorded session | **Missing — and time-critical** | Needs recruitment to start *immediately*, in parallel with engineering, not after it. |
| Improvement changelog from pilot findings | **Missing** | Depends on the pilot happening first. |
| Official SprintOS AI Reviewer X account | **Missing** | `marketing/twitter-bio.txt`, a banner and a profile picture already exist locally (untracked) — the account itself has not been opened/published yet. |

## 2. Architecture decision needed: multi-reviewer threshold

The signed SOW wants a configurable "2 of 3 reviewers" UX. Redesigning the
settlement contract's authorization model this late, days before a mainnet
deploy, is the riskiest possible place to introduce a bug. Two realistic
paths:

- **A. App-layer threshold, unchanged contract (recommended).** Each
  authorized reviewer signs an off-chain approval attestation (same
  hash-and-store pattern already used for evidence/reports). The UI only
  enables the final on-chain `approve`/`release` call once N-of-M
  attestations exist. The contract still requires exactly one
  `require_auth` signature to move money — nothing about the "AI cannot
  release funds" guarantee changes, and no contract redeploy risk is added
  right before mainnet. This is buildable in days, not weeks.
- **B. On-chain threshold counting.** Change milestone status transitions to
  accumulate distinct-reviewer approvals before `Approved`. Correct, but
  means writing new contract logic, a new test suite, and a fresh audit pass
  on the exact code that is about to hold real USDC. Given the timeline,
  this is the higher-risk option.

This plan assumes **Option A** unless you say otherwise — flag this in the
question at the end.

## 3. Proposed triage and sequencing (13 days)

Ordered by the Customer Development Plan's own risk ranking: **H4 (will a
sponsor actually fund a mainnet milestone) first**, then **H2 (AI-cannot-
release positioning)**, then **H3 (5 USDC willingness-to-pay)**. Pilot
recruitment starts on day 1, in parallel, because it is the one item that
cannot be compressed by working harder — it depends on other people's time.

| Days | Focus | Output |
| --- | --- | --- |
| 1–2 (Oct 2–3) | **Start pilot recruitment NOW** (sponsor/builder/reviewer candidates from Stellar Türkiye + Instaward/SCF-adjacent contacts). Freeze mainnet safety limits (aggregate cap, allowlisted pilot wallets, treasury wallet for Plus payments). Open the X account using the assets already sitting in `marketing/`. Enable Vercel Web Analytics for a pre-launch baseline. | Named pilot list started, mainnet safety design frozen, X account live, analytics baseline capturing. |
| 3–5 | Deploy mainnet contract from a reviewed commit (separate `deployments/mainnet.json`, canonical USDC SAC, explorer links). Build wallet-based account record + Free usage counters. | Mainnet contract ID + explorer link published; wallet account/Free-limit logic working on mainnet. |
| 6–7 | Plus payment flow: treasury wallet, on-chain payment verification poller, entitlement activation, Deep Review mode wired to a higher advisory effort/token budget. | One verified 5 USDC Plus activation in a controlled mainnet test. |
| 8–9 | Multi-reviewer threshold (Option A), Request Revision with criterion-level comments, evidence versioning (V1 preserved, new report per version, diff/comparison view). | Working revision cycle with two preserved versions and two separate advisory reports. |
| 10 | Public Proof page (per-engagement, read-only: criteria, evidence versions, reports, reviewer decisions, settlement tx). Rate limit + concurrency-lock wiring (one job per milestone version) + pagination pass. | Public Proof page live for at least one engagement; reliability controls demonstrable with tests. |
| 11–12 | Run the actual mainnet pilot with the recruited users: real funded engagement(s), real decisions, real settlement. Record the live feedback session. Collect the structured feedback form from all 5. | 5 completed pilot records, 1 recorded session, real mainnet transaction hashes. |
| 13 (Oct 15) | Triage pilot findings into a changelog, ship the highest-priority fixes, assemble the final evidence packet (contract IDs, tx hashes, screenshots, CI output, pilot report, X posts), submit. | Final evidence package ready for Ambassador review. |

If recruitment (days 1–2) slips, everything downstream slips with it — this
is the schedule's actual bottleneck, not the engineering.

## 3.1 Engineering status as of 2026-10-02 (same day this plan was written)

Everything below is on branch `feat/workspace-and-ledger-fixes` (not yet
committed — ask before committing), typechecked, tested (140 passing tests
across the workspace), builds cleanly with `next build`, and keeps `pnpm
lint:boundaries` green (the advisory package still carries no Stellar SDK).
None of it touches the settlement contract.

**Done:**
- Evidence versioning: `submit_evidence`'s evidence hash is now decoded from
  its own transaction and indexed per version (`lib/evidence-versions.ts`),
  so "Version 1 preserved, Version 2 new report" falls out of data already
  being recorded rather than needing a new store.
- Multi-reviewer threshold (Option A, app-layer): `ReviewerAttestation` /
  `ApprovalPolicy` schemas, `/api/attestation`, `/api/policy`, and
  `lib/attestation.ts`'s tally logic. The contract's own one-signature
  `approve`/`release` is untouched — this only gates when the UI offers it.
- Public Proof page: `/proof/[id]` — criteria, every evidence version, its
  advisory score, its reviewer-attestation tally, and the settlement tx, in
  one read-only page per engagement.
- Wallet-based Free/Plus entitlement: `lib/entitlement.ts` (pure, tested),
  `/api/account`, `/api/account/activate` (verifies the real USDC payment
  against Horizon before activating — never trusts a client claim).
- Deep Review: `generateReport` now accepts a reasoning-effort/token override;
  the advisory route meters it against entitlement and records usage only on
  a successful report.
- Reliability: one in-flight advisory job per milestone *version*
  (`acquireJobLock`/`releaseJobLock` in `lib/rate-limit.ts`), wired into
  `/api/advisory`.
- **The mainnet network switch itself** — the single biggest blocker this
  plan flagged in Section 1. `NEXT_PUBLIC_NETWORK_MODE` now actually
  branches `config.ts` and `wallet.ts` between testnet and mainnet
  (`Networks.PUBLIC`/`Networks.TESTNET`, separate deployment JSON, separate
  explorer base) and refuses to start in mainnet mode while
  `deployment.mainnet.json` still holds any placeholder. The canonical
  mainnet USDC issuer and SDF's mainnet Horizon URL in that template were
  verified against Circle's own docs and the `js-stellar-sdk` README, not
  guessed.
- Mainnet pilot safety cap: `exceedsMainnetCap` enforces the
  10–20 USDC-per-milestone limit you set, active only when `IS_MAINNET`.
- Reviewer-desk UI wiring: `app/review/[id]/[idx]/page.tsx` now has a
  "Reviewer sign-off" panel (attestations, per-criterion feedback, the
  live tally) that gates the real on-chain Approve button on the threshold,
  and a Deep Review toggle wired to the connected wallet's entitlement.
  Verified with a production `next build` (all new routes compiled) and a
  running dev server (every new API route returns the expected JSON, no
  server errors); this sandbox's browser tool could not reach the local
  dev server to click through it live, so a real click-through in an
  actual browser with a connected testnet wallet is still worth doing
  before this ships.

- Pagination: `listEngagementsPage` walks a bounded window of ids backward
  instead of simulating every engagement this deployment has ever issued.
  Wired into `/review`'s "All engagements" table, `/projects`, and
  `/builder`'s engagement switcher, each with a "Load earlier…" control.
  `/board`'s leaderboard intentionally still reads everything — its totals
  are only correct over the full set, and it already paginates its own
  *display* of the result (`PAGE_SIZE`/`pageOf`), which is the part that
  was actually unbounded there.
- Bounded timeouts: the two new server-side network calls this session
  added (`engagement-roles.server.ts`'s RPC read, `payment-verify.server.ts`'s
  Horizon reads) now time out the same way `contract.ts`'s reads already
  did, via a small shared `lib/with-timeout.ts` — otherwise `/api/attestation`,
  `/api/policy` and `/api/account/activate` could hang indefinitely against
  an unresponsive node.

- Vercel Web Analytics: `@vercel/analytics` is installed and `<Analytics />`
  is mounted in `app/layout.tsx`, per the Customer Development Plan's own
  Week 1 commitment. It reports nothing until Web Analytics is switched on
  for this project in the Vercel dashboard — that one toggle needs the
  account owner.
- Pilot instruments: `docs/PILOT-INSTRUMENTS.md` — a recruitment message, a
  15–20 minute interview script that opens on the reviewer's own process
  (ordered to test H1, H2, H4 before the product is described, as the
  Customer Development Plan specifies), and the structured post-pilot
  feedback form. Text only; running it still needs real participants.

- Mainnet RPC and treasury address: `deployment.mainnet.json`'s `rpcUrl`
  defaults to `https://mainnet.sorobanrpc.com` (a public provider from
  Stellar's own list). `NEXT_PUBLIC_TREASURY_ADDRESS` is set in local
  `.env.local` to the address Ege provided on 2026-10-03 and verified as a
  well-formed Stellar public key; `/api/account/activate` confirmed it picks
  this up (it now reaches the Horizon lookup instead of refusing with "not
  configured to sell Plus yet"). **Not yet set on the actual Vercel
  deployment** — that env var still needs adding there before Plus can
  activate in production.

**Still open, and why it wasn't done in this pass:**
- The actual mainnet contract deployment (`scripts/deploy-mainnet.sh` is
  ready; it needs a real funded mainnet deployer key and a typed "YES" at
  the prompt — deliberately not something this session runs unattended),
  the real 5 USDC Plus activation, opening the X account, recruiting and
  running the five-person pilot, and recording the live feedback session —
  these need your own wallet signature, your own identity, and real other
  people, respectively. No tool available in this session can do any of
  them for you.

## 4. What to explicitly de-scope if 13 days is too tight

Rather than ship all of Deliverable 2/3 thinly, cut depth, not breadth of
deliverables — the evidence checklist in Section 6.1/6.2 of the SOW grades
per deliverable, so a half-missing deliverable scores worse than a
fully-done one with a narrower version of a feature:

- Multi-reviewer threshold: ship **2-of-2** or **2-of-3** fixed, not a
  fully configurable N-of-M picker.
- Pagination: cursor-based on the one or two lists that will actually grow
  during the pilot (the activity/engagement list), not every list in the app.
- Pilot cohort: 5 is the contractual minimum — do not try to recruit more
  "to be safe"; it only adds coordination risk this late.

## 5. Month-3 application prep (runs alongside, not after)

- Every mainnet tx, pilot record and X post produced above is also Month-3
  evidence — write them straight into an evidence packet as they happen
  (same pattern as `docs/FIRST-MONTH-EVIDENCE-RUNBOOK.md`), don't reconstruct
  it on day 13.
- The Customer Development Plan's hypothesis verdict table (H1–H7) should be
  filled in from real pilot observations, not guessed — this is itself part
  of what the Ambassador Lead is grading for follow-on funding.
- Before submitting, re-run the SOW's own evidence checklist (its Section
  6.2) against what was actually shipped, the same way this plan's Section 1
  did against what existed before starting.
