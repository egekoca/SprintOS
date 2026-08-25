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

See [architecture](docs/ARCHITECTURE.md) and [security](docs/SECURITY.md) for
trust boundaries, document hashing, deployment assumptions, and known limits.

## Deployment

`scripts/setup-testnet.sh` creates the demo identities and asset.
`scripts/deploy.sh` tests and deploys the contract, then synchronizes both
testnet deployment manifests. The checked-in deployment exposes the builder
claim recovery entrypoint and enables its UI through the manifest feature flag.
Testnet state is disposable and may reset.

Live testnet scenarios are available in `scripts/demo-release.sh`,
`scripts/demo-claim.sh`, and `scripts/demo-refund.sh`.

Licensed under Apache-2.0.
