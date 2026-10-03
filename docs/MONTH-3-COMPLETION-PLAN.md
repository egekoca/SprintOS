# Month-3 Completion Plan

Started 2026-10-04, against the draft Customer Development Plan
(`2026.10.04_Instawards Customer Development Plan - SprintOS AI Reviewer
(3rd Month update, draft).docx`). Companion to
`docs/MONTH-2-COMPLETION-PLAN.md`, which this does not repeat.

## 0. The one thing to resolve before this draft is submitted anywhere

The draft document's Section 5.2 and Section 6.3 describe Month 2's pilot,
recorded session, demo video and X account as **already completed**. As of
this plan's own status (see `MONTH-2-COMPLETION-PLAN.md` Section 3.1), none
of those four have actually happened — they were never run. Ege confirmed on
2026-10-03 that the Ambassador Chapter expects the Month-3 application to
state these as done, and that the plan is to make them true now, not to
rewrite the document to say "planned." Every item in Section 1 below is
therefore load-bearing for the application's own honesty, not optional
polish.

## 1. Month 2's real-world items — still the actual blocker

Unchanged from `MONTH-2-COMPLETION-PLAN.md`: the mainnet contract deploy,
the X account, the five-person pilot, and the recorded session all need
Ege's own hands, identity, or other real people. Engineering cannot
substitute for any of them. Status as of 2026-10-04:

- Mainnet deploy: contract built and all 65 tests pass; deploy itself is
  blocked for Claude Code by its own auto-mode classifier (a harness-level
  restriction, not a permission a chat message can lift) — Ege runs
  `./scripts/deploy-mainnet.sh` directly. Deployer `GD5FP44K4Z5F6QKYVG3L2XTJDEQGXYFAR5OQ3VKDDGMOR6IXHXADVZI6`
  holds 2 XLM, confirmed on mainnet.
- X account, pilot recruitment, recorded session: not started.

## 2. Month 3 draft's new commitments (Section 7.2) — engineering status

| Commitment | Status |
| --- | --- |
| Multi-asset Plus/Pro payment (≥4 Stellar assets), three-tier ladder | **Shipped.** Free/Plus/Pro in `packages/schemas/src/account.ts`; `/plus` purchase page; `/api/account/activate` verifies any accepted asset against `lib/stellar/payment-assets.ts`. Only 3 assets carry a verified real issuer (USDC, EURC, native XLM) — a 4th needs a real address, not a guess; see that file's own comment. |
| StelHacks integration scope agreed | **Blocked on Ege.** This is a real, named external relationship — needs who the contact is, what they've discussed, and what "integration" concretely means to them before any API or docs can be shaped to fit. |
| Public Review API | **Shipped.** `/api/v1/review`, bearer-key auth via `/api/admin/api-keys` (keys stored only hashed), per-key rate limit and single-flight lock, `docs/REVIEW-API.md` for partners. Smoke-tested end to end with a real advisory call. `SPRINTOS_ADMIN_SECRET` is set locally and on Vercel (Production + Preview) as of 2026-10-04. Still generic — needs StelHacks's actual rubric/evidence shape once Section 2 clears, and has no usage metering/billing yet. |
| Reliability items extended to the API | Partially covered by the above (rate limit, job lock, bounded timeouts already shared with the rest of the app). Not yet audited specifically against the API's own failure modes. |
| Domain migration off the Vercel subdomain | Not started. Needs a domain Ege owns (or buys) — I can add it in Vercel and help with DNS records once there's a domain name to point. |
| Five-plus X posts | Depends on the X account existing. |
| Updated H1-H7 verdict table | Depends on the Month 2 pilot actually running. |
| SCF Build Award application | Explicitly "Beyond Month 3" — not this period's deliverable. |

## 3. Immediate next steps

1. Ege: share StelHacks contact/context so the Review API has a real shape
   to fit, not a generic guess.
2. Claude: build the generic public Review API now (useful regardless of
   StelHacks specifics), with API-key auth and per-key rate limiting.
3. Ege: run the mainnet deploy, start X account + pilot recruitment —
   nothing downstream of those can be faked into place.
