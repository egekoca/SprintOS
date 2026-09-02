# Architecture

Three layers, kept apart on purpose.

**`contracts/settlement`** is the authority. It decides who holds which role,
what state a milestone is in, and when tokens move. All it stores is amounts,
deadlines, statuses and 32-byte document hashes.

**`apps/web`** builds transactions, simulates them, and hands them to the user's
wallet to sign. It keeps off-chain documents on the server. It has never held a
Stellar secret and there is no code path where it could.

**`packages/advisory`** fetches public evidence within strict limits and writes
an opinion about it. A boundary check in CI stops that package from importing a
Stellar SDK or anything that signs, so the separation survives contact with
future contributors.

## The sponsor setup gates

The setup screens enforce the same order the domain does. You cannot confirm
scope before picking a repository. You cannot assign roles until the milestones
are actually valid. The create-and-fund screen stays locked until the roles and
the sponsor's wallet are both ready.

AI milestone planning produces editable form data and nothing else. It does not
write a criteria document, it does not sign anything, and it cannot skip a gate.

GitHub OAuth tokens live in encrypted, authenticated HttpOnly cookies and are
read only on the server, only to list and read repositories. OAuth state is
verified on the way back. If OAuth isn't configured — local development, or a
deployment that never set it up — public repositories can still be scanned by
URL.

## Document integrity

Acceptance criteria and evidence bundles are canonicalized, then hashed with
SHA-256. The contract stores the hash. The server stores the document under that
hash rather than under a filename someone could later overwrite. When the
reviewer opens a milestone, the server recomputes both hashes and only enables
the decision buttons if both still match the ledger.

There's a wrinkle worth knowing about. Criteria are written before the contract
has assigned a numeric engagement id, so the criteria document carries a
collision-resistant draft reference instead. What actually binds it to an
engagement is the content hash handed to `create_engagement`. Evidence is
written afterwards and carries the real numeric id.

Reports are keyed by engagement, milestone *and* evidence hash. A report written
against an earlier submission can never be shown next to a later revision of it.

## Storage

By default the document store writes JSON under `SPRINTOS_DATA_DIR`. That is
fine for local work, or for a single instance with a persistent volume behind
it. Set `BLOB_READ_WRITE_TOKEN` and it uses Vercel Blob instead, which is what a
serverless deployment needs.

Criteria, evidence and reports are content-addressed. Settlement activity is one
object per transaction hash, so two requests arriving at once cannot overwrite
each other's work. Every object is validated against its schema on the way back
in, and older aggregate activity files are merged rather than dropped.

## Chain reads and writes

Reads go through RPC simulation and need no wallet at all. Writes load the source
account, simulate and prepare the transaction, ask the selected wallet to sign
it, submit through RPC, then wait for the ledger to confirm. The network and the
deployment identifiers are pinned to testnet.

## Reproducible builds

The WASM this repository builds is byte-identical to the contract deployed at
`CAJUEUOEP6UUNLQ65XOINCUNVBXYPOGNWZC2XZQE7HRV66KTLERPHLND`:

```
sha256  3f8f93abe9f2ce9917f85472a41bc3175bc665363410f2373fa8ad9ac8fbb4ff
```

Anyone can check that:

```bash
stellar contract build
shasum -a 256 target/wasm32v1-none/release/sprintos_settlement.wasm
stellar contract fetch --id CAJUEUOEP6UUNLQ65XOINCUNVBXYPOGNWZC2XZQE7HRV66KTLERPHLND \
  --network testnet --out-file /tmp/deployed.wasm
shasum -a 256 /tmp/deployed.wasm
```

This has a practical consequence for anyone editing the contract. `contracttype`
and `contracterror` write doc comments into the WASM's contract spec, so even
changing a comment changes that hash and breaks the match. The contract source
is therefore frozen for the life of this deployment. Three error variants —
`AlreadyInitialized`, `Unauthorized` and `AmountMismatch` — are declared but
never returned; `Unauthorized` in particular can never fire, because
`require_auth` panics before any code of ours would return it. They stay in the
enum because removing them would change the hash above and orphan the two live
engagements the evidence pack depends on. A later deployment should drop them.

## Public verification surfaces

- `/docs` — the product reference.
- `/evidence` — the first-month SOW index, deliverable by deliverable.
- `/evidence/ai-boundary` — the proof that a perfect advisory score still cannot
  authorize a payment.
- `/api/health` — non-secret readiness for RPC, deployment ids, Blob and the
  public URL. It reports itself degraded rather than pretending a serverless
  deployment works when its durable store or evidence URL is missing.

## On mainnet

This release is testnet-only, and that is a design decision rather than an
unfinished one. A mainnet pilot would need its own deployment record, the
canonical mainnet USDC SAC, an explicit cap on funds, and the same interactive
wallet authorization boundary this build has. It must not happen by quietly
editing testnet environment variables.
