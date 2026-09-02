# First-month evidence runbook

Everything the first month owes the SOW, sorted into two piles: what a reviewer
can already check on their own, and what still needs a person sitting in front
of three testnet wallets with a screen recorder running.

The second pile is short. It is also the only thing standing between this
project and a complete evidence packet, so it is worth doing in one sitting.

## 1. Evidence that already exists

The public evidence pack is the index:

- Application: https://sprintos-ai.vercel.app
- Evidence pack: https://sprintos-ai.vercel.app/evidence
- AI boundary proof: https://sprintos-ai.vercel.app/evidence/ai-boundary
- Approval and release example: https://sprintos-ai.vercel.app/e/2
- Hold and refund example: https://sprintos-ai.vercel.app/e/3
- Repository: https://github.com/egekoca/SprintOS

The two public engagements are real Stellar testnet records. Engagement #2
contains creation, funding, evidence submission, reviewer approval and
reviewer release. Engagement #3 contains creation, funding, evidence
submission, reviewer Hold and deadline refund. The explorer links are listed
on `/evidence` and on each public engagement page.

## 2. Preflight before recording

1. In Vercel, confirm the project is connected to Blob Storage. The deployment
   must have `BLOB_READ_WRITE_TOKEN`; the token value must stay inside Vercel
   Environment Variables and must never be pasted into GitHub, a screenshot,
   or this document.
2. Set `NEXT_PUBLIC_APP_URL` to the exact public HTTPS origin, without a
   trailing slash. Redeploy after changing it.
3. Keep `OPENAI_API_KEY` in Vercel for the advisory screenshot. It is optional
   for settlement, but without it the reviewer screen correctly says that the
   advisory service is unavailable.
4. Open `/api/health`. It may report `advisory.configured: false` if the key is
   intentionally absent, but storage, contract, asset and RPC must be ready.
5. Use Stellar testnet wallets only. Sponsor, builder and reviewer must be
   different addresses. Do not record seed phrases or private keys.

## 3. Screenshots to capture

Clean browser window, URL bar visible. Keep the status, the last few characters
of the wallet address, the hash and the explorer link inside the frame. Nothing
secret, and close the password manager first.

Name the files exactly this:

| File | Page | What must be visible |
| --- | --- | --- |
| `01-sponsor-setup.png` | `/sponsor` | Connected sponsor wallet, repository, milestones, assigned builder and reviewer, and the final review/fund step. |
| `02-builder-evidence.png` | `/builder` | Assigned milestone, acceptance criteria, typed evidence links and the signed submission result. |
| `03-reviewer-desk-report.png` | `/review/2/0` | Original criteria, submitted evidence, generated advisory report, score, hash match indicators, attestation and manual Approve/Hold controls. |
| `04-public-release.png` | `/e/2` | Released status, amount, reviewer/builder roles and the settlement log with explorer links. |
| `05-public-refund.png` | `/e/3` | Held/refunded status, deadline, refund amount and the settlement log with explorer links. |
| `06-ai-boundary-proof.png` | `/evidence/ai-boundary` | `100 / 100`, `binding: false`, “AI transaction: none”, rejected attempts and the two live human-signed transaction links. |
| `07-health.png` | `/api/health` | Non-secret readiness response showing storage, contract, asset and RPC status. |

The required SOW screenshot for Deliverable 2 is `03-reviewer-desk-report.png`.
The role screenshots and the public state screenshots satisfy Deliverable 3.
The boundary screenshot must be accompanied by the contract test output below.

## 4. Short demo recording

One narrated pass, three to five minutes. This single recording satisfies both
the "demo video" and the "wallet signing recording" the SOW asks for, so there
is no reason to shoot it twice:

1. Start at `/sponsor` and show the sponsor wallet and fixed milestone terms.
2. Show the builder's evidence form and the evidence hash after signing.
3. Open `/review/2/0`; show that the criteria and evidence say `matches chain`.
4. Generate the advisory report. Say explicitly that the score is advisory,
   not an approval and not a payment instruction.
5. Tick the human attestation and sign Approve with the reviewer wallet.
6. Show the approval hash, then sign Release as a separate reviewer action.
7. Open `/e/2` and open both explorer links.
8. Open `/e/3` to show the Hold and deadline refund branch.
9. Finish at `/evidence/ai-boundary` and explain why there is intentionally no
   “AI payment transaction”.

The wallet confirmation window may be shown, but never show a seed phrase,
private key, token, or unrelated account information.

## 5. The 100/100 AI boundary proof

From the repository root:

```bash
cargo test --package sprintos-settlement test_ai_score_100_cannot_release
```

It proves all of the following in one scenario:

- an advisory report can contain `advisory_score: 100` and
  `recommendation: ReadyForReview`;
- the report has `binding: false`;
- no reviewer authorization means `approve` and `release` fail;
- an unrelated AI address also fails authorization;
- the escrow and builder balance do not change;
- after the reviewer signs Approve and Release, the same milestone settles.

It is worth being clear about why the proof takes this shape. The score is never
submitted as a contract argument, so there is no live transaction anywhere that
could contain “AI score 100” — and if the proof page showed one, that would mean
the guarantee had been broken. The live transactions demonstrate the human path.
The local test demonstrates that the AI path does not exist. Together, that is
the whole claim.

Also run the complete verification set:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm build
cargo fmt --all -- --check
cargo test --package sprintos-settlement
cargo clippy --workspace --all-targets -- -D warnings
```

Save terminal output as `08-verification-output.txt` after removing any local
paths or environment values that should not be shared.

## 6. Final packet structure

Put the captured artifacts in a private working folder, then upload only the
approved public artifacts to the grant submission:

```text
first-month-evidence/
  01-sponsor-setup.png
  02-builder-evidence.png
  03-reviewer-desk-report.png
  04-public-release.png
  05-public-refund.png
  06-ai-boundary-proof.png
  07-health.png
  08-verification-output.txt
  sprintos-first-month-demo.mp4
  README.md
```

`README.md` should link to `/evidence`, `/evidence/ai-boundary`, `/e/2`, `/e/3`
and the repository. It should state which actions are local tests and which
are live testnet transactions. Do not put environment files, API keys, Blob
tokens, seed phrases or wallet backups in this folder.

## 7. What to say plainly in the submission

The first month delivers a working testnet settlement MVP where approval and
release stay under human control.

The advisory module makes review faster. It is not a signer, not an approver,
not a contract caller and not a payment trigger — and the packet above proves
each of those separately rather than asserting them together.

Mainnet and real funds are not claimed here. That is deliberate. They belong to
a second month with its own controls, not to a quiet flip of an environment
variable.
