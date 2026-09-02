# Setup and usage

This is written for two people. One is deploying SprintOS. The other has been
handed a link and has to decide whether a milestone was met. If you're the
second one, skip to [Walking the whole flow](#walking-the-whole-flow) — you'll
never need a terminal.

## Run it locally

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

That's it. The app points at the checked-in testnet deployment, so you're
talking to a live contract from the first page load. Reading needs no wallet.
Writing always asks one to sign.

Three pages are worth knowing about: `/docs` is the product reference,
`/evidence` is the first-month SOW index, and `/evidence/ai-boundary` is where
the AI-cannot-pay claim gets proved rather than asserted.

## Environment

None of this is needed to read the chain. Each variable buys exactly one
capability, and the app degrades honestly without it.

| Variable | What it unlocks | Needed when |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | The address written into contract storage as the evidence bundle's URI | **Every deployment.** Without it the URI points at whatever host the builder's browser was on, and nobody else can open it. |
| `BLOB_READ_WRITE_TOKEN` | Durable storage for criteria, evidence and reports | Any serverless host. See below. |
| `SPRINTOS_DATA_DIR` | Filesystem storage instead of Blob | Only for a single instance with a persistent volume. Use an absolute path. |
| `OPENAI_API_KEY` | Advisory report generation, and milestone planning from a brief | Optional. Human review and settlement work fully without it. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_SESSION_SECRET` | Signing in to GitHub to list private-to-you repositories | Optional. Public repositories can always be selected by URL. |
| `GITHUB_TOKEN` | A higher rate limit on public repository scans | Optional. |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | A different testnet RPC | Optional. |

## Deploying to Vercel

The app deploys with no configuration at all. But two settings are not really
optional. Skip either and you get a site that looks completely fine right up
until the moment someone tries to decide a milestone:

1. **Create a Blob store** from the project's Storage tab (`Create Database`
   → `Blob`), continue, and connect it to the project. That sets
   `BLOB_READ_WRITE_TOKEN`, and the document store switches backends on its
   own — same content-addressed keys, same hashes.

   You do not paste the Blob token into the repository or into the Blob public
   URL. Vercel injects the token into the connected project's Environment
   Variables. Confirm that it is enabled for the deployment environment and
   redeploy. The token is a server secret; never expose it in browser code,
   screenshots or GitHub.

   Without it, acceptance criteria and evidence bundles are written to a
   filesystem that does not survive the request. The reviewer screen then cannot
   re-hash either document, so **Approve and Hold stay disabled** and the
   milestone cannot be decided at all.

2. **Set `NEXT_PUBLIC_APP_URL`** to the deployment's own address, with no
   trailing slash. The evidence URI is stored on chain permanently; there is no
   second chance to correct it.

Add `OPENAI_API_KEY` as well if you can. Without it the advisory panel says the
service isn't configured, which is honest, but it makes for a thin demo.

Then open `/api/health`. On Vercel you want HTTP 200, `status: "ok"`, Blob as
the storage backend and a configured public URL. The response never contains the
Blob token, the OpenAI key or the RPC URL, so it's safe to screenshot.

## Walking the whole flow

Three roles, three wallets, and they have to be three genuinely different
Stellar accounts. The contract refuses an engagement where any two match.

**As the sponsor — `/sponsor`.** Pick a repository, then either paste a brief and
let SprintOS draft a milestone plan or write the milestones yourself. Every
milestone needs a title, at least one checkable requirement, an amount and a due
date. Assign the builder's account and decide who reviews — you, or an
independent account you nominate. The final screen shows everything you are
about to fix in place; signing hashes the requirements into the contract, and
there is no edit screen afterwards. Fund the escrow in a second signature.

**As the builder — `/builder`.** Your assigned milestones appear with their
acceptance criteria in full. Add up to five public links — repository, commit,
pull request, test result, documentation, demo — and a note for the reviewer.
Signing anchors the hash of that bundle on chain.

**As the reviewer — `/review`.** The milestone opens with the funded criteria
on one side and the submitted evidence on the other. Both get re-hashed on the
server and compared against the ledger. If either fails to match, the decision
buttons stay dead.

You can generate the advisory report if you want one: a score, a verdict on each
criterion with the links behind it, and an explicit list of what it couldn't
verify. It changes nothing about what you're allowed to do. You tick a box
saying you read the evidence yourself, then Approve or Hold.

Releasing the money is a **separate** signature from approving the work. That's
deliberate — judging and paying are two different acts and the ledger should
show both.

**Anyone — `/e/<id>`.** The public engagement page. No wallet, no account: every
milestone, amount, status and deadline, read straight from the ledger.

## Reviewer checklist

For the person signing a decision, in order:

- [ ] The criteria shown are marked as matching the ledger.
- [ ] The evidence bundle is marked as matching the ledger.
- [ ] Every link opens, and each one is public.
- [ ] Each requirement is met by something you can point at in the evidence.
- [ ] Anything the advisory report says is treated as an opinion you checked, not a verdict you accepted.
- [ ] The amount about to move is the amount the milestone was funded with.
- [ ] You are signing with the account the engagement records as reviewer.

If any box is unticked, Hold is the correct action. The builder can revise and
resubmit; a release cannot be undone.

## Verifying a deployment

```bash
cargo test --package sprintos-settlement   # every contract test, including test_ai_score_100_cannot_release
pnpm lint:boundaries                       # the advisory module carries no Stellar SDK and no signing code
pnpm test && pnpm typecheck && pnpm lint   # application and schema tests, types, and the linter
```

To check that the deployed contract really is this source, build it and compare
hashes — [ARCHITECTURE.md](ARCHITECTURE.md) has the two commands.

[EVIDENCE.md](EVIDENCE.md) has the full deliverable-by-deliverable pack.
[ARCHITECTURE.md](ARCHITECTURE.md) covers the trust boundaries and reproducible
builds. [SECURITY.md](SECURITY.md) is the threat model.

See [FIRST-MONTH-EVIDENCE-RUNBOOK.md](FIRST-MONTH-EVIDENCE-RUNBOOK.md) for the
exact screenshots, recording sequence, transaction evidence and the
100/100-AI proof.
