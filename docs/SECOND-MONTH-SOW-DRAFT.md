# SprintOS AI Reviewer — Second-Month Instaward SOW Draft

This is a working draft for the second-month application. It is aligned with
the blank second-month SOW template dated August 31, 2026 and should be
reviewed by the Builder and Ambassador Chapter Lead before submission.

## 1. Project & Team Information

- **Project Name:** SprintOS AI Reviewer
- **Builder / Team Name:** Ege Yenikale
- **Primary Contact:** Ege Yenikale, egeyenikale@gmail.com
- **Ambassador Chapter:** Stellar Turkiye
- **Ambassador Chapter Lead:** İrem Koçi (Stellar Türkiye)
- **Date Submitted:** August 31, 2026
- **Suggested Sprint Start Date:** September 1, 2026, subject to approval

## 3. Problem Statement & Objective

### Problem Being Addressed

The first Instaward delivered and deployed the core SprintOS testnet MVP:
milestone escrow, human approval or Hold, deadline refund, structured public
evidence, and a non-binding OpenAI advisory report. The remaining gap is
operational rather than conceptual. The current MVP is a single-deployment
pilot: reviewer access and paid advisory usage need stronger guardrails,
production failures need clearer health and recovery paths, and the workflow
needs repeated public testnet use instead of two demonstration engagements.

Without this hardening, a reviewer can still be slowed by a storage or RPC
failure, advisory usage can be abused on a public deployment, and an external
reviewer has limited evidence that the workflow is repeatable beyond the
initial demo.

### Objective of This Instaward

Within 30 days, SprintOS will ship a hardened v0.2 testnet pilot that can be
used repeatedly by independent sponsor, builder, and reviewer wallets. It will
add operational health and recovery checks, stronger reviewer and advisory
guardrails, a repeatable pilot workflow, and a complete public release package
with measurable testnet results.

Human wallet authorization will remain the only authority for approval, release,
claim, and refund. The advisory module will remain non-binding and will not gain
any contract permission or access to private repositories.

## 4. Scope of Work

### Deliverable 1 — Production reliability and reviewer safety

**Description**

Harden the deployed web MVP for repeated serverless use. Add a non-secret health
surface for the RPC, contract configuration, Blob storage, and advisory
configuration; improve failure messages and recovery paths; add reviewer
authorization and advisory-usage guardrails; and expand tests for storage
failure, RPC timeout, duplicate activity, malformed documents, and unavailable
OpenAI service conditions.

The implementation will preserve the existing non-custodial boundary: no
private key will be stored by SprintOS, and no advisory response can approve or
move funds.

**Why this matters**

The first month proves the protocol flow. This deliverable makes the flow
operationally dependable enough for outside reviewers and repeated pilots.

**Acceptance criteria**

1. A deployment health check reports the configured RPC, contract, Blob backend,
   and advisory availability without exposing secrets.
2. Reviewer-only advisory generation has explicit request limits and clear
   failure behavior; missing OpenAI or Blob configuration never appears as an
   unexplained server error.
3. Storage, RPC, malformed-input, duplicate-transaction, and unavailable-AI
   cases have automated regression coverage.
4. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint:boundaries`,
   `cargo test --package sprintos-settlement`, and the security audit pass in
   CI.

### Deliverable 2 — Repeatable multi-role pilot workflow

**Description**

Improve the sponsor, builder, and reviewer workflow for repeatable pilot use.
Add clearer engagement discovery and role hand-off links, expose evidence
revision history and transaction reconciliation where needed, and run at least
three new independent Stellar testnet engagements using public proof of work.

The pilot set will include:

- one complete evidence path ending in human approval and release;
- one insufficient or disputed evidence path ending in Hold and eligible
  refund after the deadline; and
- one revision path where the builder resubmits evidence after feedback and the
  reviewer decides on the new evidence hash.

**Why this matters**

The grant reviewer should be able to verify a repeatable product workflow, not
only inspect a single happy-path demo. Revision history and reconciliation also
make it clear which evidence was reviewed and which transaction changed state.

**Acceptance criteria**

1. Each pilot engagement has distinct sponsor, builder, and reviewer wallets,
   public criteria and evidence hashes, and a public engagement page.
2. The three pilot outcomes are visible through Stellar testnet transaction
   hashes and explorer links.
3. The reviewer screen shows the criteria and evidence hash that match the
   ledger before decision controls become available.
4. A resubmitted evidence bundle cannot reuse the earlier advisory report or
   earlier evidence hash.
5. A short pilot report records completion rate, review outcome, advisory
   availability, and any failed or retried operations.

### Deliverable 3 — Public proof and release readiness

**Description**

Prepare the second-month release package: a narrated end-to-end demo, role
screenshots, a reproducible deployment and verification runbook, integration
documentation for the evidence and advisory APIs, a security and limitations
note, and an updated public evidence pack.

**Why this matters**

Clear public proof reduces reviewer effort, makes the project reproducible by
another Stellar builder, and gives SprintOS a credible base for a follow-on
pilot or SCF application.

**Acceptance criteria**

1. A public demo recording shows sponsor setup and funding, builder evidence
   submission, reviewer inspection, human approval or Hold, and final release
   or refund.
2. Screenshots cover the sponsor, builder, reviewer, advisory report, and
   public engagement views.
3. A new setup/runbook allows another developer to configure Blob, OpenAI,
   testnet deployment variables, and verification commands without private
   project knowledge.
4. The public evidence page links to the release candidate, pilot engagements,
   transaction hashes, tests, security notes, and the demo.

### Out of Scope

1. Stellar mainnet deployment or settlement with real funds.
2. Automatic approval, release, refund, or dispute resolution based on an AI
   score.
3. Custodial wallets, backend private keys, autonomous financial agents, or
   private repository access.
4. Execution of submitted code or a general-purpose code audit service.
5. Legal enforcement, payroll, tax, KYC, accounting, or production arbitration.
6. Mobile applications, advanced organization management, reputation systems,
   notifications, or paid marketing.
7. Paid hosting, RPC subscriptions, AI usage fees, domain costs, or other
   operating expenses.

## 4.2 Deliverable-Aligned Budget Request

**Requested Budget:** $5,000 USD

| Allocation | Amount | Use |
| --- | ---: | --- |
| Deliverable 1 | $2,000 | Reliability, health checks, reviewer/advisory guardrails, failure testing, and CI hardening |
| Deliverable 2 | $1,700 | Multi-role workflow improvements, reconciliation/revision handling, and three public testnet pilots |
| Deliverable 3 | $1,300 | Demo, screenshots, runbook, integration documentation, measurement report, and final evidence pack |
| **Total** | **$5,000** |  |

The budget is tied to software and verifiable delivery. It excludes operating
costs and does not change the project's testnet-only, non-custodial scope.

## 5. 30-Day Execution Plan & Timeline

| Week | Planned Work | Expected Output |
| --- | --- | --- |
| Week 1 | Confirm the threat model and pilot acceptance criteria; design health, recovery, reviewer guardrails, and measurement; capture a baseline from the first-month deployment. | Technical design, baseline metrics, test matrix, and updated second-month backlog |
| Week 2 | Implement health checks, failure handling, usage controls, and regression tests; verify Blob, OpenAI, RPC, and contract behavior in a deployment candidate. | Hardened deployment candidate, passing automated checks, and failure-path evidence |
| Week 3 | Improve role hand-off and revision workflow; execute three independent testnet pilots covering release, Hold/refund, and resubmission. | Public engagement pages, transaction hashes, reconciliation records, and pilot metrics |
| Week 4 | Fix pilot defects; produce screenshots, demo, runbook, integration docs, security notes, and final evidence pack; deploy the release candidate. | Public v0.2 testnet pilot, reproducible release package, and Ambassador-ready evidence |

## 6. Planned Evidence of Completion

| Deliverable | Evidence Type | Description |
| --- | --- | --- |
| Deliverable 1 | Repository links, CI output, tests, health endpoint, deployment record, security note | Shows the implemented safeguards, failure behavior, contract boundary, and passing verification commands |
| Deliverable 2 | Three public engagement URLs, Stellar explorer transaction hashes, screenshots, pilot metrics | Shows independent sponsor/builder/reviewer workflows, release, Hold/refund, resubmission, and evidence-hash reconciliation |
| Deliverable 3 | Demo video, role screenshots, public evidence page, setup/runbook, API documentation | Lets the Ambassador review the complete workflow and reproduce the release candidate |

## 7. Anticipated Next Step

The most likely next step after this Instaward is to continue toward an SCF
Build Award or an independently funded pilot, using the public testnet
evidence and release-readiness package as the baseline.
