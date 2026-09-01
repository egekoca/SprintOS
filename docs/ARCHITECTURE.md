# Architecture

SprintOS has three deliberately separated layers.

1. `contracts/settlement` is the authority for roles, milestone state and token
   movement. It stores amounts, deadlines and 32-byte document hashes.
2. `apps/web` builds, simulates and submits transactions from the user's wallet.
   The server stores off-chain documents but never stores a Stellar secret.
3. `packages/advisory` fetches bounded public evidence and creates a non-binding
   report. A repository boundary check prevents it from importing signing or
   Stellar transaction code.

The sponsor setup UI enforces the same order as the domain workflow. A
repository must be selected before scope can be confirmed; valid milestones
must exist before roles can be assigned; roles and the sponsor wallet must be
ready before the create/fund screen is enabled. AI milestone planning only
creates editable form data. It does not write criteria documents, sign a
transaction, or skip any of those gates.

GitHub OAuth access tokens are held in authenticated, encrypted HttpOnly
cookies and are only used server-side to list and read repositories. OAuth
state is verified on callback. Public URL scans remain available for local
development and deployments that do not configure OAuth.

## Document integrity

Acceptance criteria and evidence bundles are canonicalized and hashed with
SHA-256. The contract stores those hashes. The server stores criteria and
evidence by hash, not by a mutable engagement filename. The reviewer UI
recomputes both hashes server-side and enables decisions only when both match
the ledger.

Criteria are authored before the contract assigns a numeric engagement id. The
criteria document therefore carries a collision-resistant draft reference; its
authoritative binding to an engagement is the content hash supplied to
`create_engagement`. Evidence is authored after creation and carries the numeric
engagement id.

Reports are keyed by engagement, milestone and evidence hash, so a report from
an earlier submission cannot be shown for a later revision.

## Storage

The default `DocumentStore` writes JSON under `SPRINTOS_DATA_DIR`. It is suitable
for local development or a single instance backed by a persistent volume.
Setting `BLOB_READ_WRITE_TOKEN` selects Vercel Blob for serverless deployments.
Criteria, evidence and reports keep content-addressed keys; settlement activity
is stored as one object per transaction hash so concurrent requests cannot
overwrite one another. Reads validate every object against its schema and merge
legacy aggregate activity files for migration.

## Chain reads and writes

Reads use RPC simulation and need no wallet. Writes load the source account,
simulate/prepare the transaction, ask the selected wallet to sign, submit via
RPC and wait for ledger confirmation. Network and deployment identifiers are
pinned to testnet.

## Public verification surfaces

The application exposes `/docs` as the public product reference, `/evidence`
as the first-month SOW index, and `/evidence/ai-boundary` as the explicit proof
that a perfect advisory score cannot authorize a payment. `/api/health` reports
non-secret deployment readiness for RPC, deployment IDs, Blob and the public
URL. It returns degraded status rather than pretending a serverless deployment
is usable when its durable store or evidence URL is missing.

The current release is testnet-only by design. A future mainnet pilot must use a
separate deployment record, canonical mainnet USDC SAC, an explicit fund cap and
the same interactive wallet authorization boundary; it must not be enabled by
silently changing the testnet environment variables.
