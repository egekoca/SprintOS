# SprintOS

Milestone escrow on Stellar testnet. A sponsor locks USDC against up to three
milestones, a builder anchors public proof that they were met, and an assigned
human reviewer approves or holds the work.

There's an AI in here. It reads the evidence and writes an opinion about it. It
has no Stellar SDK, no signing key, and there is no contract method it could
call even if it had both. That isn't a policy — it's the shape of the code, and
CI fails the build if anyone changes it.

## What you need

- Node.js 22+
- pnpm 10.15
- Rust stable with `wasm32v1-none`
- Stellar CLI 27

## Run it

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

It points at the checked-in testnet deployment, so it's live from the first
page load. `OPENAI_API_KEY` is only needed if you want advisory reports
generated; every human review and every settlement works without it.

The sponsor workspace is a four-step flow and each step stays locked until the
one before it is done: pick a repository, confirm an editable milestone plan,
assign the roles, then sign and fund.

GitHub OAuth needs `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and a long
`GITHUB_SESSION_SECRET`, with `http://localhost:3000/api/github/callback`
registered as the callback. Without it you can still select any public
repository by URL.

`OPENAI_API_KEY` also turns on milestone planning from a pasted brief or an
uploaded TXT/Markdown/CSV/JSON document. If it's missing you get a transparent,
editable structured draft instead of a pretence that a model ran.

## Verify

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm build
cargo fmt --all -- --check
cargo test --package sprintos-settlement
stellar contract build
```

The deployed contract is byte-identical to what this source builds. If you want
to check that rather than take it on faith, [ARCHITECTURE.md](docs/ARCHITECTURE.md)
has the two commands.

## Where to read next

[Setup and usage](docs/SETUP.md) covers the environment variables, a walkthrough
of all three roles and the reviewer checklist. [Evidence](docs/EVIDENCE.md) is
the deliverable-by-deliverable pack, also served at `/evidence` on any
deployment. [Architecture](docs/ARCHITECTURE.md) and
[security](docs/SECURITY.md) cover trust boundaries, document hashing,
reproducible builds and the known limits.

`pnpm evidence:doc` regenerates `docs/EVIDENCE.md` from the same data the
`/evidence` page renders, which is how the two are kept from drifting apart.

## Deploying

Two settings are not optional on a hosted deployment.

`NEXT_PUBLIC_APP_URL` gets written into contract storage as the evidence
bundle's URI, permanently, with no way to correct it afterwards.

`BLOB_READ_WRITE_TOKEN` — from a Vercel Blob store, or any host with a
persistent volume via `SPRINTOS_DATA_DIR` — is what makes criteria and evidence
durable. Without one of them a reviewer can't re-hash either document, and the
decision buttons never light up. [docs/SETUP.md](docs/SETUP.md) has both.

`scripts/setup-testnet.sh` creates the demo identities and the asset.
`scripts/deploy.sh` tests, deploys, and syncs both testnet deployment manifests.
The checked-in deployment exposes the builder claim recovery entrypoint and
enables its UI through the manifest feature flag. Testnet state is disposable
and may reset without warning.

Live scenarios: `scripts/demo-release.sh`, `scripts/demo-claim.sh`,
`scripts/demo-refund.sh`.

Licensed under Apache-2.0.
