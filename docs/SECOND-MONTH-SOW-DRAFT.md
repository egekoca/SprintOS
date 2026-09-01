# SprintOS AI Reviewer — Second-Month Instaward SOW Draft

This is a proposed second-month SOW for the August 31, 2026 template. It is
written for review by the Builder and the Stellar Turkiye Ambassador Chapter
Lead before submission. The first-month release remains testnet-only; this
scope adds a separately reviewed and tightly capped mainnet pilot.

## 1. Project & Team Information

- **Project Name:** SprintOS AI Reviewer
- **Builder / Team Name:** Ege Yenikale
- **Primary Contact:** Ege Yenikale, egeyenikale@gmail.com
- **Ambassador Chapter:** Stellar Turkiye
- **Ambassador Chapter Lead:** Irem Koci (Stellar Turkiye)
- **Proposed Date Submitted:** September 1, 2026
- **Suggested Sprint Start Date:** September 1, 2026, subject to approval

## 2. Problem Statement & Objective

### Problem Being Addressed

The first Instaward delivered the core testnet protocol: milestone escrow,
human approval or Hold, deadline refund, public evidence, and a non-binding AI
advisory module. The remaining product gap is operational and network-facing.
The application is deliberately testnet-only today, so it has not yet proven
that the same human-controlled workflow can be deployed and used safely on
Stellar mainnet. It also needs stronger storage and advisory failure handling,
immutable evidence revision history, and public documentation that lets an
external reviewer reproduce the result.

A mainnet pilot must not turn SprintOS into an autonomous payment agent. The
mainnet work therefore needs explicit limits: a separate contract deployment,
the canonical Stellar USDC asset, a small aggregate fund cap, allowlisted pilot
wallets, no server-side keys, and a human signature for every state-changing
transaction. The AI remains outside the contract and payment path.

### Objective of This Instaward

Within 30 days, SprintOS will ship a hardened v0.2 release with an explicitly
configured mainnet mode and complete two small, public mainnet pilot
engagements: one human-approved release and one Hold/revision path that is
ultimately settled by a human wallet. Each mainnet state change will have an
explorer-verifiable transaction hash. The release will also include health and
recovery checks, advisory guardrails, revision-aware evidence, and a public
documentation and demo package.

The mainnet pilot will expose no more than **100 USDC in aggregate** across all
pilot engagements. This is a maximum exposure, not a required spend. The
Builder will stop the pilot if any transaction, asset, signer or contract
configuration is unexpected.

## 3. Scope of Work (30-Day Deliverables)

### Deliverable 1 — Controlled Stellar mainnet settlement pilot

#### Description

Add an explicit network configuration and deploy a dedicated mainnet instance
of the settlement contract from a reviewed commit. The mainnet deployment will
use the canonical Stellar USDC SAC verified from the official Stellar asset
registry at execution time. Testnet and mainnet contract IDs, RPC endpoints,
explorer links and environment variables will be separate and impossible to
confuse through a single implicit default.

Before any mainnet funding, the team will run the full contract test suite,
simulate each planned transaction, verify the contract ID and asset ID, check
the three distinct pilot wallets, and record the aggregate exposure cap. No
private key will be stored in SprintOS; connected wallets will sign every
create, fund, evidence, approve, Hold, release, claim or refund transaction.

The pilot will include:

1. **Mainnet Pilot A:** create, fund, submit evidence, human Approve and
   separate human Release for one small milestone.
2. **Mainnet Pilot B:** create, fund, submit evidence, human Hold, revised
   evidence submission, and final human Approve plus separate human Release.

The second path demonstrates that a new evidence hash produces a new review
context. A deadline refund may be added only when its deadline can be reached
without weakening the pilot controls; it is not necessary to risk funds merely
to manufacture a waiting-period screenshot.

#### Why this matters

It converts the testnet proof into a bounded mainnet proof while preserving the
property that matters most: code can prepare a payment, but only the wallet
authorized in the engagement can decide and sign it.

#### Acceptance criteria

1. A dedicated mainnet settlement contract is deployed from a reviewed commit;
   its contract ID, WASM hash or release commit, canonical USDC SAC ID and
   explorer link are published.
2. Mainnet Pilot A reaches a released state with public hashes for creation,
   funding, evidence submission, human approval and separate human release.
3. Mainnet Pilot B records a Hold and a different evidence hash before the
   revised evidence is approved and released by the configured reviewer.
4. The combined mainnet amount funded during the pilot is at most 100 USDC;
   every amount and signer is visible in the public evidence packet.
5. The app refuses an asset, network, contract or signer mismatch before a
   pilot transaction is submitted, and no backend private key or autonomous
   transaction worker exists.
6. Testnet regression tests remain green, including the proof that a 100/100
   advisory score cannot approve or release a payment.

### Deliverable 2 — Reliability, advisory guardrails and evidence revisions

#### Description

Harden the application around the mainnet pilot. Add a public non-secret health
endpoint for RPC, deployment IDs, Blob storage and advisory configuration;
clear recovery messages for unavailable RPC, Blob or OpenAI; shared or
deployment-appropriate request limits; reviewer authorization checks for
advisory generation; and immutable report and evidence revision records.

The reviewer screen will show the exact criteria hash, evidence hash and report
hash used for a decision. A revised evidence bundle will never reuse a report
from an earlier hash. Activity indexing will reconcile each transaction from
the network before it appears in the public log.

The advisory package will remain non-binding. It will not import signing code,
hold a wallet, monitor repositories in the background, run submitted code or
access private repositories. A perfect score still cannot call a contract
entrypoint.

#### Why this matters

Mainnet makes storage, stale reports, RPC failures and signer confusion costly.
These controls ensure that an outage fails closed for uncertain decisions while
leaving a reviewer a clear path to retry or decide after verifying the ledger.

#### Acceptance criteria

1. `/api/health` reports non-secret readiness for RPC, contract, asset, Blob and
   advisory configuration, with no token, key or RPC URL in its response.
2. Automated tests cover Blob/storage failure, RPC timeout, malformed criteria
   and evidence, duplicate activity, stale report hashes, unavailable OpenAI,
   wrong signer and wrong asset or network configuration.
3. Evidence and report revisions are addressable by content hash and visible in
   the reviewer workflow; an earlier report cannot appear for a new evidence
   hash.
4. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint:boundaries`,
   `cargo fmt --all -- --check`, `cargo test --package sprintos-settlement`,
   `cargo clippy --workspace --all-targets -- -D warnings` and the security
   audit pass in CI.
5. The public proof page and test output state clearly that a 100/100 score is
   a deterministic test vector, not an AI-signed or AI-submitted mainnet
   transaction.

### Deliverable 3 — Public documentation, measurement and release package

#### Description

Publish the SprintOS documentation site inside the application with setup,
workflow, architecture, trust boundaries, API reference, evidence integrity,
mainnet safety controls and verification commands. Produce the final first-
month evidence packet and a second-month pilot report with screenshots, a
narrated demo, explorer links and transaction reconciliation.

The release package will contain enough information for an external reviewer
to distinguish local contract tests, live testnet transactions and live
mainnet transactions without relying on a private message or an unverifiable
claim.

#### Why this matters

The project is a trust and settlement product. Public, low-effort verification
is part of the product, not post-release marketing. A reviewer must be able to
see who signed each state change and why the AI did not trigger payment.

#### Acceptance criteria

1. `/docs`, `/evidence` and `/evidence/ai-boundary` are public and link to the
   repository, contract deployments, pilot pages, verification commands and
   security limitations.
2. Screenshots cover sponsor setup, builder evidence, reviewer report and
   attestation, public mainnet Pilot A, public mainnet Pilot B, and the AI
   boundary proof.
3. A 3 to 5 minute demo shows the role hand-off, evidence revision, human
   wallet confirmations and final explorer verification without exposing
   secrets.
4. A pilot report records the number of engagements, amounts, transaction
   hashes, reviewer outcomes, retries, uptime or health observations, advisory
   availability and any incident or rollback decision.
5. The evidence packet labels every transaction as testnet or mainnet and
   includes the exact contract and asset IDs used for that network.

## 4. Out of Scope and Safety Limits

1. Autonomous approval, release, refund, dispute resolution or treasury
   management based on an AI score or recommendation.
2. Custodial wallets, backend private keys, unattended signing, automated
   mainnet top-ups or a transaction worker that can move funds without a
   connected human wallet.
3. Mainnet exposure above the 100 USDC aggregate pilot cap, production payroll,
   large-value escrow or an open public mainnet launch without a new review.
4. A custom token, custom wallet, custom signature scheme or replacement for
   Stellar account authorization and the standard USDC SAC interface.
5. Private repository access, execution of submitted code or a general-purpose
   code audit service.
6. Legal enforcement, KYC, tax, accounting, production arbitration, mobile
   applications, advanced organization management, reputation systems or paid
   marketing.
7. Operating expenses such as hosting, RPC subscriptions, AI usage, domains,
   wallet fees or mainnet pilot funds. These are not part of the grant budget.

## 5. Deliverable-Aligned Budget Request

**Requested Budget: $5,000 USD**

| Allocation | Amount | Use |
| --- | ---: | --- |
| Deliverable 1 | $2,300 | Mainnet network configuration, dedicated deployment, safety gates, contract verification and two capped pilot engagements |
| Deliverable 2 | $1,500 | Health/recovery paths, advisory and reviewer guardrails, revision history, reconciliation and regression tests |
| Deliverable 3 | $1,200 | Public docs, screenshots, demo, pilot metrics, explorer evidence and final release packet |
| **Total** | **$5,000** | |

The grant pays for engineering and verifiable delivery. The 100 USDC pilot
cap is a safety limit, not a budget line or a request for the grant to fund
mainnet liquidity.

## 6. 30-Day Execution Plan & Timeline

| Week | Planned work | Expected output |
| --- | --- | --- |
| Week 1 | Freeze the threat model, mainnet fund cap, wallet allowlist, canonical asset verification procedure and pilot scripts. Capture the first-month baseline and review the mainnet deployment commit. | Mainnet safety design, test matrix, deployment checklist, pilot wallet plan and baseline evidence |
| Week 2 | Implement explicit network configuration, safety gates, health checks, failure handling, reviewer/advisory guardrails and revision-aware document storage. Run testnet simulations and all regression/security checks. | Release candidate, passing CI, health output, failure-path evidence and testnet rehearsal |
| Week 3 | Deploy the dedicated mainnet contract, verify the asset and IDs, then execute Pilot A and Pilot B in small steps. Reconcile every transaction from RPC and the public explorer after each signature. | Mainnet contract record, two public pilot pages, transaction hashes and signed reconciliation log |
| Week 4 | Resolve pilot defects, verify the aggregate cap, produce docs, screenshots, demo, pilot report and final evidence packet. Keep the mainnet deployment in restricted pilot mode. | Public v0.2 release package and Ambassador-ready second-month evidence |

## 7. Planned Evidence of Completion

| Deliverable | Evidence type | Description |
| --- | --- | --- |
| Deliverable 1 | Mainnet contract ID, canonical USDC SAC ID, release commit, explorer links, two public engagement pages and transaction hashes | Proves deployment identity, capped funding, distinct roles, Hold/revision, human approval and separate human release on mainnet. |
| Deliverable 2 | Repository diff, CI output, health response, regression tests, failure-path captures and revision hashes | Proves the application remains reliable and that neither stale evidence nor AI output can authorize payment. |
| Deliverable 3 | `/docs`, `/evidence`, `/evidence/ai-boundary`, screenshots, demo video and pilot report | Gives the Chapter Lead a reproducible, public explanation of what is local, testnet and mainnet evidence. |

### 7.1 Mainnet transaction evidence checklist

For each mainnet pilot, the final packet will list the exact network, contract,
asset, engagement and milestone next to every hash:

| Pilot | Required transaction evidence |
| --- | --- |
| A — direct release | `create_engagement`, `fund`, `submit_evidence`, reviewer `approve`, separate reviewer `release` |
| B — revision release | `create_engagement`, `fund`, first `submit_evidence`, reviewer `hold`, revised `submit_evidence`, reviewer `approve`, separate reviewer `release` |

The packet will link every hash to Stellar Expert and identify the signer from
the transaction envelope. A score, recommendation or report hash will never be
described as a payment transaction.

## 8. Evidence Verification Checklist (For Ambassador Use)

| Deliverable | Evidence present | Evidence partial | Evidence missing | Comments |
| --- | --- | --- | --- | --- |
| Deliverable 1 | [ ] | [ ] | [ ] | Mainnet contract, capped Pilot A and Pilot B transaction links |
| Deliverable 2 | [ ] | [ ] | [ ] | Health, failure tests, revisions and AI boundary |
| Deliverable 3 | [ ] | [ ] | [ ] | Public docs, screenshots, demo and pilot report |

## 9. Mainnet Pilot Operating Rules

These rules are part of the acceptance evidence, not informal advice:

1. Mainnet is disabled until the contract ID, canonical USDC SAC ID, network
   passphrase, RPC and explorer all match the reviewed deployment record.
2. The operator records the planned amount and signer before opening each
   wallet confirmation. A mismatch stops the pilot.
3. Every state-changing operation is signed interactively by the wallet
   recorded in the engagement. The web server never receives a secret key.
4. The pilot uses separate sponsor, builder and reviewer wallets. Addresses,
   roles and amounts are published after redacting no relevant ledger data.
5. The team keeps an append-only reconciliation table with action, network,
   engagement, milestone, signer, amount, transaction hash and explorer URL.
6. If the advisory service is unavailable or scores incorrectly, the reviewer
   can still make an independent decision after checking the criteria and
   evidence. No AI result blocks or triggers settlement.

## 10. Instawards Constraints Acknowledgement

By submitting this SOW, the Builder acknowledges:

- [ ] This scope will be completed within 30 days or less.
- [ ] Instawards support execution, not open-ended exploration.
- [ ] A project may receive no more than two follow-on Instawards.
- [ ] Each Instaward is capped at $5,000.
- [ ] Total Instawards funding may not exceed $15,000.

## 11. Submission Confirmation

Once finalized, this Statement of Work will be submitted by the Ambassador
Chapter Lead through the Instawards Airtable submission form for review and
approval. Mainnet execution begins only after the scope and its safety limits
are approved.

## 12. Anticipated Next Step

After this Instaward, the most likely next step is an SCF Build Award or an
independently funded pilot. Any expansion beyond the capped mainnet pilot will
be proposed as a separately reviewed scope with production threat modeling,
operational monitoring and a new fund limit.
