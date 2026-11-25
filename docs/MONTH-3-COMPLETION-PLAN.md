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
- ⬜ **Not yet committed or deployed** — the USDT0 wiring exists only in the
  working tree as of this writing.
- ⬜ Real on-chain smoke-test payment in each asset, with transaction hashes
  for the evidence package (SOW §6.1). A test-buyer identity exists for this
  (`sprintos-mainnet-test-buyer`, secret in macOS Keychain, public
  `GDQRTX7NPSFJA7WLKG5KNMTS5SZLK4SYOT2WYRT66KMGLAVW2V45XUEM`) — needs Ege to
  fund it with XLM + each asset and run a real Plus/Pro purchase per asset.

**Next:** commit + deploy the USDT0 change, then Ege runs the real funded
smoke test across all four assets.

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
  `sha256:88f6e90eaacb0ab49b9af7cb22b39ae1f0d27c75271f51e9da5316ed20d2a610`.
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

- 🟡 Rate limiting, job locking and the boundary enforcement above now cover
  the API specifically (see Deliverable 2). Dedup/timeout-retry bounds on
  the review and evidence routes still need a dedicated audit against the
  API's own abuse paths (burst traffic from a third party, not just a logged
  in user) — not yet done.
- ⬜ Per-builder detail view on the public Board (see one builder's full
  engagement history, not just totals).
- ⬜ One-click "accept the AI's milestone draft" flow (currently every field
  is reviewed by hand).
- ⬜ Clearer next-step navigation across more pages.
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

**Next, after Deliverable 2's StelHacks item closes:** audit API-specific
abuse paths, then work the UX list (Board per-builder view first — it's the
most self-contained), then domain migration once Ege has a name.

## Summary: what needs Ege vs. what's engineering-only

| Needs Ege | Pure engineering (can proceed now) |
| --- | --- |
| Fund `sprintos-mainnet-test-buyer` and run the real asset smoke tests | Commit + deploy today's USDT0 + API boundary work |
| StelHacks coordination (real key, volume, format) | API-specific reliability/abuse-path tests |
| Buy a domain | Board per-builder view |
| Post the 6 ready X launch drafts (+ StelHacks one, once confirmed) | One-click AI-draft-accept UX |
