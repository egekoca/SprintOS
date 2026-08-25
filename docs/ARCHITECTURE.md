# Architecture

SprintOS has three deliberately separated layers.

1. `contracts/settlement` is the authority for roles, milestone state and token
   movement. It stores amounts, deadlines and 32-byte document hashes.
2. `apps/web` builds, simulates and submits transactions from the user's wallet.
   The server stores off-chain documents but never stores a Stellar secret.
3. `packages/advisory` fetches bounded public evidence and creates a non-binding
   report. A repository boundary check prevents it from importing signing or
   Stellar transaction code.

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
for local development or a single instance backed by a persistent volume. A
multi-instance/serverless deployment must replace this implementation with a
shared object store or database while preserving content-addressed keys and
schema validation on read.

## Chain reads and writes

Reads use RPC simulation and need no wallet. Writes load the source account,
simulate/prepare the transaction, ask the selected wallet to sign, submit via
RPC and wait for ledger confirmation. Network and deployment identifiers are
pinned to testnet.
