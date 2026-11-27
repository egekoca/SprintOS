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
- ✅ Committed 2026-11-26. Not yet deployed to production.
- 🟡 Real on-chain smoke-test payment in each asset, with transaction hashes
  for the evidence package (SOW §6.1). Test-buyer wallet
  `GDQRTX7NPSFJA7WLKG5KNMTS5SZLK4SYOT2WYRT66KMGLAVW2V45XUEM` funded
  2026-11-27 with 5 XLM + 0.5 USDC + 0.5 EURC + 0.5 USDT0, trustlines open.
  **Blocked on `NEXT_PUBLIC_TREASURY_ADDRESS`** — reading it from Vercel's
  env was refused by the harness's own classifier (it's a public address,
  not a secret, but the classifier can't tell the difference); need Ege to
  read it from the Vercel dashboard and hand it over. USDT0 purchase also
  needs this session's work deployed first (not yet deployed).
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

**Next:** get the treasury address from Ege, deploy, then run the
Plus/Pro purchase in each of the four assets.

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
- ⬜ **StelHacks real integration** — architecture confirmed correct
  (2026-10-04), but no real API key has been minted for them yet, and no real
  advisory evaluation has been generated for an actual submitted hackathon
  project. This is the one item in this deliverable that needs StelHacks
  coordination, not just engineering.

**Next:** deploy this session's work, then close the StelHacks loop (mint
their real key, confirm volume/response-format expectations, get one real
evaluation running in production).

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
- ⬜ Real owned domain — purchase + DNS/TLS migration off `*.vercel.app` for
  the web app, Public Proof pages, and the API. Needs Ege to pick/buy a
  domain; I can wire DNS and Vercel once there's a name.
- 🟡 ≥5 new X posts specifically announcing this period's launch — **6
  drafts ready** in `marketing/` (text + matching card image each):
  `tweet-multi-asset`, `tweet-pro-tier`, `tweet-boundary-enforced`,
  `tweet-public-proof`, `tweet-reviewer-said-no`, `tweet-review-api`. None
  posted yet. `tweet-stelhacks-draft.txt` exists but is explicitly held back
  pending StelHacks' own confirmation before naming them publicly. Still
  needed: one post once the new domain is live, and Ege actually posting
  these from the SprintOS AI Reviewer X account.

**Next:** close the StelHacks loop (Deliverable 2) and deploy everything
committed so far; get direction on the next-step-navigation item; domain
migration once Ege has a name.

## Summary: what needs Ege vs. what's engineering-only

| Needs Ege | Pure engineering (can proceed now) |
| --- | --- |
| Fund `sprintos-mainnet-test-buyer` and run the real asset smoke tests | Deploy everything committed so far |
| StelHacks coordination (real key, volume, format) | Pick a concrete next-step-navigation fix, once scoped |
| Buy a domain | |
| Post the 6 ready X launch drafts (+ StelHacks one, once confirmed) | |
