# SprintOS

SprintOS is a testnet milestone escrow on Stellar. A sponsor funds up to three
milestones, a builder anchors public evidence, and an assigned human reviewer
approves or holds the work. The advisory AI can summarize evidence but has no
Stellar SDK, signing key, or contract method that can approve or move funds.

## Requirements

- Node.js 22+
- pnpm 10.15
- Rust stable with `wasm32v1-none`
- Stellar CLI 27

## Run locally

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The web app defaults to the checked-in testnet deployment. Add
`ANTHROPIC_API_KEY` only if advisory report generation is needed; every human
review and settlement flow works without it.

The sponsor workspace is a gated four-step flow: select a GitHub repository,
confirm an editable milestone plan, assign roles, then sign and fund. GitHub
OAuth requires `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a long
`GITHUB_SESSION_SECRET`; register
`http://localhost:3000/api/github/callback` as the local callback URL. Without
OAuth configuration, public repositories can still be selected by URL.

`ANTHROPIC_API_KEY` also enables milestone planning from a pasted brief or a
TXT/Markdown/CSV/JSON document. If it is absent, the workspace produces a
transparent, editable structured draft instead of pretending an AI ran.

## Verify

```bash
pnpm test
pnpm typecheck
pnpm lint:boundaries
pnpm build
cargo fmt --all -- --check
cargo test --package sprintos-settlement
stellar contract build
```

See [setup and usage](docs/SETUP.md) for environment variables, a walkthrough of
all three roles and the reviewer checklist; [evidence](docs/EVIDENCE.md) for the
deliverable-by-deliverable pack, also served at `/evidence` on any deployment;
and [architecture](docs/ARCHITECTURE.md) with [security](docs/SECURITY.md) for
trust boundaries, document hashing, deployment assumptions, and known limits.

`pnpm evidence:doc` regenerates `docs/EVIDENCE.md` from the same data the
`/evidence` page renders, so the two cannot drift apart.

## Deployment

Two settings are not optional on a hosted deployment. `NEXT_PUBLIC_APP_URL` is
written into contract storage as the evidence bundle's URI and cannot be
corrected afterwards. `BLOB_READ_WRITE_TOKEN` — from a Vercel Blob store, or any
other host with a persistent volume via `SPRINTOS_DATA_DIR` — makes criteria and
evidence durable; without one of them a reviewer cannot re-hash either document
and the decision buttons never enable. [docs/SETUP.md](docs/SETUP.md) covers
both.

`scripts/setup-testnet.sh` creates the demo identities and asset.
`scripts/deploy.sh` tests and deploys the contract, then synchronizes both
testnet deployment manifests. The checked-in deployment exposes the builder
claim recovery entrypoint and enables its UI through the manifest feature flag.
Testnet state is disposable and may reset.

Live testnet scenarios are available in `scripts/demo-release.sh`,
`scripts/demo-claim.sh`, and `scripts/demo-refund.sh`.

Licensed under Apache-2.0.
