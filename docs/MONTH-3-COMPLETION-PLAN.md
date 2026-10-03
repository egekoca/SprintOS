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

- **Mainnet deploy: done, 2026-10-03.** Ege ran it directly (blocked for
  Claude Code by its own harness-level classifier). Contract
  `CAD6T756NFMN2EVOBK2GLAE3CEM33I7RUBTQ6QRFWRXWES53Z5QG4OTE`, both deploy
  transactions verified on Horizon — see `MONTH-2-COMPLETION-PLAN.md` for
  the full trail. `NEXT_PUBLIC_NETWORK_MODE=mainnet` is not yet set on the
  live Vercel deployment; flipping it is a deliberate next decision, not
  done as part of this.
- X account, pilot recruitment, recorded session: not started.

## 2. Month 3 draft's new commitments (Section 7.2) — engineering status

| Commitment | Status |
| --- | --- |
| Multi-asset Plus/Pro payment (≥4 Stellar assets), three-tier ladder | **Shipped.** Free/Plus/Pro in `packages/schemas/src/account.ts`; `/plus` purchase page; `/api/account/activate` verifies any accepted asset against `lib/stellar/payment-assets.ts`. Only 3 assets carry a verified real issuer (USDC, EURC, native XLM) — a 4th needs a real address, not a guess; see that file's own comment. |
| StelHacks integration scope agreed | **Confirmed by Ege, 2026-10-04.** StelHacks is a hackathon platform being built on Stellar; the deal is that StelHacks enters the judge-set criteria for a hackathon, SprintOS checks each submitted repo against those criteria and returns a score, saving the jury's time. No milestones or engagements involved — this is exactly the ad hoc shape `/api/v1/review` already implements (criteria in, repo evidence in, advisory report out). Architecture confirmed correct; what is still open is the real integration details (expected call volume per hackathon, response format StelHacks's own UI wants, whether they need a webhook instead of synchronous REST). |
| Public Review API | **Shipped**, and per-key rate limits are now configurable at mint time (a hackathon judging many submissions in one sitting needs a higher ceiling than the 20/hour default). `docs/REVIEW-API.md` updated. Still open: mint StelHacks's real key (not the test one), and confirm their actual expected request volume so the limit is sized correctly rather than guessed. |
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
