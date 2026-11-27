# Month-3 Completion Plan

Tracks the **signed** SOW (`2026.10.01_Instawards SOW - Ege Yenikale 3'rd
Month.pdf`, submitted 2026-11-04, sprint start 2026-11-16) and its companion
Customer Development Plan (`2026.09.01_Instawards Customer Development Plan -
SprintOS AI Reviewer.pdf`), both confirmed as the final versions on
2026-11-26. Supersedes the earlier draft-SOW version of this file. Companion
to `docs/MONTH-2-COMPLETION-PLAN.md`, which this does not repeat — Month 2's
own items (mainnet deploy, X account, five-user pilot, recorded session) are
**all done**, evidenced in the Customer Development Plan's Section 6.

Status key: ✅ done · 🟡 partial · ⬜ not started. Updated as work lands —
this file is the single place to check what is left.

## Deliverable 1 — Multi-asset Plus/Pro payment, three-tier ladder

> Accept ≥4 established Stellar-network assets via on-chain payment
> verification, exactly as USDC works today. Three tiers: Free / Plus / Pro.

- ✅ Three-tier ladder shipped: Free (3 standard/30d), Plus (10 standard + 5
  deep), Pro (25 standard + 15 deep) — `packages/schemas/src/account.ts`.
- ✅ Four assets wired in `apps/web/lib/stellar/payment-assets.ts`: USDC,
  EURC, native XLM, and USDT0 (LayerZero-bridged Tether, issuer
  `GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q`, verified against
  developers.stellar.org and live Horizon data 2026-10-29).
- ✅ Committed 2026-11-26, deployed to production 2026-11-27 (merged via
  [PR #1](https://github.com/egekoca/SprintOS/pull/1)).
- ✅ **Real on-chain smoke-test Plus activation in all four assets, 2026-11-27**
  — test-buyer wallet `GDQRTX7NPSFJA7WLKG5KNMTS5SZLK4SYOT2WYRT66KMGLAVW2V45XUEM`,
  real money, real production `/api/account/activate` calls, all four
  confirmed:
  - USDC: tx `035d15ddf0d5c97998d7a56778987b57770427a4d4ff899f7e21a1eacf33fb2d`
  - XLM: tx `8968ab1d4bf85463ec8ff5a600b4ef6ab60825482268e80ceae0f36da2335564`
  - EURC: tx `399f7e61e09879ac941325b9bd12710e7e9814ef137dbec42c05c541f3f95eae`
  - USDT0: tx `8498d1eb66e8b871f01330465b5da0e6333bac998a46310e7f4f489809113c40`

  The original production `NEXT_PUBLIC_TREASURY_ADDRESS` secret turned out to
  be permanently unreadable (Vercel's "Secret" env type is write-only by
  design, so neither the harness nor Ege's own dashboard could recover it) —
  rotated to a wallet Ege controls and verified,
  `GACTJJN3Y5YCSAFFITRUDSWQBNY5XJIZIKPUUI5646GFY5UXTSU6C2VO`, redeployed.
- ✅ **Real mainnet milestone/escrow regression run, 2026-11-27** —
  `sprintos-mainnet-test-sponsor` / `sprintos-mainnet-test-builder`
  identities created, funded (11 XLM / 2 XLM), full lifecycle run for real
  on the live contract: create_engagement → fund (0.3 USDC) →
  submit_evidence → approve → release → closed. Builder's balance
  confirmed +0.3 USDC; public proof page live at
  [/proof/7](https://sprintos-ai.vercel.app/proof/7). Transactions:
  [create](https://stellar.expert/explorer/public/tx/2e47d4cbe01c4c90aaa6989398f434977c938959ce28060eae45b722c51b1420) ·
  [fund](https://stellar.expert/explorer/public/tx/1617dff3c91452034046b273252ea2d5994e768067cdb068c33973b6aad968e0) ·
  [evidence](https://stellar.expert/explorer/public/tx/9a7a389fdb61181dfa3cc2e992e1b5a65c2ebaa79f356e792294b208daf94803) ·
  [approve](https://stellar.expert/explorer/public/tx/5e6d7e7c3ef5593ac4b3b9d0235197fffec175e327d81f288e097c0408fb02d2) ·
  [release](https://stellar.expert/explorer/public/tx/52cbfd2d0099d94a7c3c542a688b1e261846ba64624b9e0a2c0163f94dd29bd0).
  This wasn't a new SOW requirement by itself (the settlement contract
  didn't change this session) — Ege asked for it as an extra real-money
  regression check alongside the asset test. Notable finding along the
  way: `create_engagement`'s Soroban resource fee was **5.14 XLM** right
  now (a brand-new persistent ledger entry), while every later call on the
  same engagement (fund, evidence, approve, release) cost under 0.03 XLM
  each — mainnet write-rent is currently much higher than
  `MAINNET_MILESTONE_CAP_USDC`-era assumptions, worth knowing before
  budgeting XLM for any future real engagement.

**Deliverable 1 is done.**

## Deliverable 2 — Public Review API

> Documented, authenticated, rate-limited API exposing the advisory pipeline.
> A named regression test proving the API-level guarantee. CI boundary-lint
> extended to the new API surface. A fixed, hashed sample response. A
> keyless public demo. A real StelHacks integration in production.

- ✅ API live in production (`POST /api/v1/review`, confirmed via curl →
  401 on an unauthenticated call). Per-key rate limit + per-key job lock
  already in place.
- ✅ **`test_api_report_cannot_authorize_release`** — added 2026-11-26,
  `apps/web/app/api/v1/review/route.test.ts`. Enumerates the entire public
  API surface, builds a hand-constructed 100/100 non-binding report, and
  asserts (a) the report's `binding` field cannot be `true` by the schema
  itself, (b) the exact set of `route.ts` files under `api/v1` is what's
  expected — so an unreviewed new route would fail this test, not pass
  silently — and (c) none of them, nor their import graph, can reach a
  Stellar SDK or signing code.
- ✅ **CI boundary-lint extended to the new API package** — `scripts/check-
  boundaries.mjs` refactored to export `checkSealedPackages` /
  `checkSealedPaths`, now also sealing `apps/web/app/api/v1`,
  `lib/api-keys.ts`, `lib/store.ts`, `lib/rate-limit.ts`,
  `lib/request-security.ts`. Same CLI (`pnpm lint:boundaries`), same logic
  the new test imports directly — one definition of the boundary checked
  from both CI and the test suite.
- ✅ **Fixed, reproducible sample API response with hash** —
  `packages/advisory/src/demo-fixture.ts` (shared definition) +
  `packages/advisory/fixtures/04-api-demo.*.json` (the on-disk copy for the
  evidence package). Score 82, `ReadyForReview`, hash
  `sha256:4652f8319e9fc2fb21ad8ffb866309f141c95ee089cf7441b009bf581de2f87e`.
  Regenerate with `pnpm --filter @sprintos/advisory fixtures` — byte-identical
  output confirmed against the pre-existing three Month-1 samples too.
- ✅ **Keyless public demo endpoint** — `GET /api/v1/review/demo`, no auth,
  per-IP rate limited, returns the exact fixture above computed live.
  Documented in `docs/REVIEW-API.md` with the literal `curl` command.
- ✅ **Per-criterion numeric score (0-100)**, 2026-11-27 — added alongside
  the existing categorical verdict specifically so a caller with its own
  weighted rubric (StelHacks' on-chain `weight_bps` per criterion) can
  apply its own weighting rather than trusting a second implementation of
  that arithmetic here. [PR #2](https://github.com/egekoca/SprintOS/pull/2).
- ✅ **Deep review now reads real source, not just metadata**, 2026-11-27 —
  `packages/advisory/src/source.ts`: file tree + file contents via GitHub's
  API, entry points/contracts first then tests then the rest, up to a
  character budget. Never executes anything (`git clone`, install, build
  all absent by design) — enforced by two new CI boundary-lint patterns
  (`child_process`, `exec`/`spawn`, `eval`, `Function()`, `node:vm`), not
  only documented. [PR #2](https://github.com/egekoca/SprintOS/pull/2).
- ✅ **Real cost measurement against an actual StelHacks submission**,
  2026-11-27 — cloned `github.com/emirykl/StelHacks` (read-only, local
  inspection only) to study their existing in-house AI reviewer, then ran
  SprintOS's own pipeline for real against their one live submission,
  `github.com/emirykl/Beaver402` (Stellar Pro Hackathon İstanbul). Quick
  pass: 1,970 input / 975 output tokens, ~1.6¢. Deep pass (real source
  read): 19,794 input / 955 output tokens, ~5.1¢, and correctly upgraded
  `code_quality` from `cannot_verify` (28/100) to `met` (98/100) once it
  could see the actual Soroban contract and tests. A 300-submission
  quick pass + a 10-submission deep pass on the shortlist comes to
  roughly $5.50 total at these rates.
- ⬜ **StelHacks real integration** — architecture confirmed correct, and
  now proven end-to-end against their own real submission data above, but
  StelHacks already built and shipped their own in-house AI reviewer
  (`backend/reviewer/`, calling Claude directly) — Ege's direction is to
  replace it with SprintOS's API rather than pursue a narrower
  complementary angle. No real API key minted for them yet; this needs an
  actual conversation with StelHacks, not more engineering.

**Next:** merge [PR #2](https://github.com/egekoca/SprintOS/pull/2), then
open the StelHacks conversation (mint their real key once they're in,
confirm volume/response-format expectations, get one real evaluation
running in their own production).

## Deliverable 3 — Reliability, UX, domain, launch

> Close out Month 2's partially-wired reliability items and extend them to
> the API. Ship the named UX fixes from the Month 2 pilot's own feedback.
> Migrate off the default Vercel subdomain onto an owned domain. Publish the
> launch through ≥5 original X posts.

- ✅ **API-specific abuse-path tests** — `e2e/review-api.spec.ts` (new),
  exercised over real HTTP against a locally-started server (Next.js route
  handlers can't be imported directly outside `next build`/`start`, so this
  is the Playwright layer, like the rest of the e2e suite). Covers: the
  keyless demo endpoint, a missing API key (401), an unknown key (401), an
  oversized body rejected before auth even runs (413), and a key rate
  limited at exactly the ceiling it was minted with (429, with
  `retry-after`). `playwright.config.ts` now gives its local test server a
  throwaway admin secret and clears `OPENAI_API_KEY`, both scoped only to
  that locally-started process. A true concurrent-duplicate-request race
  was attempted and deliberately dropped as unreliably flaky; the
  underlying job-lock primitive stays covered by `lib/rate-limit.test.ts`.
- ✅ Per-builder detail view on the public Board —
  `/builders/[address]`, linked from every Board row and podium slot.
  Lists every engagement that address was ever assigned as builder, funded
  or not, paid or not, computed live from the contract.
- ✅ One-click "accept the AI's milestone draft" flow — "Accept plan &
  continue" in `/projects/new` step 2, next to the existing even-split
  button. Prices every milestone from the entered total and advances
  immediately, instead of requiring an amount typed into each milestone
  card by hand (the one field the AI draft never fills in, and the one
  actually blocking Continue).
- ⬜ Clearer next-step navigation across more pages. Unlike the other two
  UX items, the SOW names no specific mechanism here, and the Month 2
  pilot's actual feedback notes live in a recorded session / Drive folder
  this plan has not read verbatim — guessing at which pages risks fixing
  the wrong thing. Needs either the raw pilot feedback or Ege's own sense
  of where people get lost before picking a concrete change.
- ✅ **Real owned domain, fully migrated**, 2026-11-27 — `sprintos.xyz`
  bought through Vercel (Ege confirmed the purchase interactively; the CLI
  itself refuses to buy a domain non-interactively, by Vercel's own
  design), attached to the project, DNS verified, TLS live.
  `NEXT_PUBLIC_APP_URL` updated to `https://sprintos.xyz`, production
  redeployed. Both old addresses now 30x-redirect to it — `sprintos-
  ai.vercel.app` (308 permanent) and `sprintos-two.vercel.app` (307, after
  first repointing it off `sprintos-ai.vercel.app` since Vercel refuses a
  redirect chain) — confirmed live: `curl -I https://sprintos-ai.vercel.app`
  returns `308` to `https://sprintos.xyz/`. The web app, Public Proof
  pages and the API are all served from the owned domain.
- 🟡 ≥5 new X posts specifically announcing this period's launch — **6
  drafts ready** in `marketing/` (text + matching card image each):
  `tweet-multi-asset`, `tweet-pro-tier`, `tweet-boundary-enforced`,
  `tweet-public-proof`, `tweet-reviewer-said-no`, `tweet-review-api`. None
  posted yet. `tweet-stelhacks-draft.txt` exists but is explicitly held back
  pending StelHacks' own confirmation before naming them publicly. Still
  needed: one post once the new domain is live, and Ege actually posting
  these from the SprintOS AI Reviewer X account.

**Next:** open the StelHacks conversation (Deliverable 2); get direction on
the next-step-navigation item. Domain migration is fully done.

## Summary: what needs Ege vs. what's engineering-only

| Needs Ege | Pure engineering (can proceed now) |
| --- | --- |
| Open the actual StelHacks conversation — real key, volume, whether they'll swap their own reviewer for ours | Merge [PR #2](https://github.com/egekoca/SprintOS/pull/2) |
| Pilot feedback for the next-step-navigation item | — |
| Post the 6 ready X launch drafts (+ StelHacks one, once confirmed) | |
