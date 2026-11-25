# SprintOS

Milestone escrow on Stellar, deployed on mainnet and testnet. A sponsor locks
USDC against up to three milestones, a builder anchors public proof that they
were met, and an assigned human reviewer approves or holds the work.

There's an AI in here. It reads the evidence and writes an opinion about it. It
has no Stellar SDK, no signing key, and there is no contract method it could
call even if it had both. That isn't a policy — it's the shape of the code, and
CI fails the build if anyone changes it.

## Mainnet deployment

The settlement contract was deployed to Stellar mainnet on **October 3, 2026**.

| Item | Mainnet value |
| --- | --- |
| Settlement contract | [`CAD6T756NFMN2EVOBK2GLAE3CEM33I7RUBTQ6QRFWRXWES53Z5QG4OTE`](https://stellar.expert/explorer/public/contract/CAD6T756NFMN2EVOBK2GLAE3CEM33I7RUBTQ6QRFWRXWES53Z5QG4OTE) |
| USDC token contract (SAC) | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| USDC issuer | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| Deployed WASM SHA-256 | `0ab09039e8e9d16e162d7f27d8cf4008c262199e33c451851fed22545a804e23` |

Both the [WASM upload](https://horizon.stellar.org/transactions/8e37137e8639c3c831efea3862261c0b645b29e6e1d351b783d29636577c0b69)
and [contract creation](https://horizon.stellar.org/transactions/cf40c296f0597a11e60bbcc0d627fad30538611f7747e36d5370888cea58ba74)
transactions succeeded. The deployment enables builder claims and sponsor-managed
reviewer lists. [deployments/mainnet.json](deployments/mainnet.json) records the
deployment; [the web manifest](apps/web/lib/stellar/deployment.mainnet.json)
supplies the app's mainnet defaults.

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

Local development defaults to the checked-in testnet deployment. To use the
existing mainnet contract, set both values in `.env.local` before starting
the app, or in your hosting environment before building and deploying:

```dotenv
NEXT_PUBLIC_NETWORK_MODE=mainnet
NEXT_PUBLIC_STELLAR_RPC_URL=https://mainnet.sorobanrpc.com
```

The RPC setting replaces the testnet URL copied from `.env.example`. Mainnet
mode selects the checked-in mainnet contract and USDC token automatically;
connect a wallet on Stellar mainnet. The app's default mainnet pilot limit is
20 USDC per milestone, configurable with `NEXT_PUBLIC_MAINNET_MILESTONE_CAP_USDC`.

`OPENAI_API_KEY` is only needed if you want advisory reports
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

The deployment manifests record the WASM SHA-256 for each network. Compare
against the manifest for the contract you are verifying; the mainnet hash is
listed above. [ARCHITECTURE.md](docs/ARCHITECTURE.md) also documents the original
testnet deployment's build verification.

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
`scripts/deploy-mainnet.sh` builds, tests, deploys a new mainnet contract, and
updates both mainnet deployment manifests. Using the existing mainnet contract
only requires the environment settings above. Both networks' checked-in
deployments expose the builder claim recovery entrypoint and enable its UI
through the manifest feature flag. Testnet state is disposable and may reset
without warning.

Live scenarios: `scripts/demo-release.sh`, `scripts/demo-claim.sh`,
`scripts/demo-refund.sh`.

Licensed under Apache-2.0.
