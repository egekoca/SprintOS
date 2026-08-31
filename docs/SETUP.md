# Setup and usage

Two audiences: someone deploying SprintOS, and someone reviewing a milestone on
a deployment that already exists. The second half needs no command line.

## Run it locally

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The app defaults to the checked-in testnet deployment, so it talks to a live
contract straight away. Every read works without a wallet; every write asks the
wallet to sign.

## Environment

Nothing here is required to read the chain. Each variable buys one capability.

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

The application itself deploys with no configuration. Two settings are not
optional, and skipping either produces a site that looks fine and fails at the
moment it matters:

1. **Create a Blob store** from the project's Storage tab (`Create Database`
   → `Blob`), continue, and connect it to the project. That sets
   `BLOB_READ_WRITE_TOKEN`, and the document store switches backends on its
   own — same content-addressed keys, same hashes.

   Without it, acceptance criteria and evidence bundles are written to a
   filesystem that does not survive the request. The reviewer screen then cannot
   re-hash either document, so **Approve and Hold stay disabled** and the
   milestone cannot be decided at all.

2. **Set `NEXT_PUBLIC_APP_URL`** to the deployment's own address, with no
   trailing slash. The evidence URI is stored on chain permanently; there is no
   second chance to correct it.

`OPENAI_API_KEY` is worth adding too — without it the advisory panel reports
that the service is not configured, which is honest but makes for a thin demo.

## Walking the whole flow

Three roles, three wallets. They must be three different Stellar accounts; the
contract refuses an engagement where any two are the same.

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
and the submitted evidence side by side. Both are re-hashed on the server and
compared with the ledger; if either does not match, the decision buttons stay
disabled. Optionally generate the advisory report — a score, a verdict per
criterion with its supporting links, and what it could not verify. It changes
nothing: you tick an attestation that you read the evidence yourself, then
Approve or Hold. Releasing the money is a **separate** signature from approving
the work.

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
pnpm test && pnpm typecheck                # application and schema tests
```

See [EVIDENCE.md](EVIDENCE.md) for the full deliverable-by-deliverable pack,
[ARCHITECTURE.md](ARCHITECTURE.md) for the trust boundaries, and
[SECURITY.md](SECURITY.md) for the threat model.
