# Security model

## What trusts what

The contract is the authority on money and roles. Nothing else is.

The role checks in the UI are there so people don't click buttons that will
fail. They protect nothing. Every path that moves value asks Soroban to verify a
signature against the address recorded in contract storage, and that check runs
whether or not the interface agreed with it.

Advisory output is untrusted and non-binding. The package cannot import a
Stellar SDK or any signing code — CI fails the build if it tries — and the
contract accepts no score and no recommendation, so there is no argument through
which an opinion could reach a payment.

Criteria, evidence and reports are untrusted off-chain data until their schema
parses and their hash matches what the ledger recorded.

## The paths that move money

| Function | Who must sign | What it does |
| --- | --- | --- |
| `fund` | sponsor | Moves the full commitment into escrow |
| `release` | reviewer | Pays out an approved milestone |
| `claim` | builder | Recovers an already-approved payment when the reviewer never comes back for the second signature. It cannot approve work. |
| `refund` | sponsor | Reclaims an unapproved milestone after its deadline |

The contract is immutable on purpose. No admin, no upgrade path, no pause. That
buys a guarantee nobody can talk their way around, and it costs the ability to
patch a defect in place. If one is found, the answer is a new contract and a
migration, not a fix — so do not treat the testnet address as permanent.

## Fetching public evidence

Evidence fetches use credential-free HTTPS only. After DNS resolves, local,
private, link-local, reserved and documentation IP ranges are refused; redirects
are refused outright; response time and size are both bounded; binary content is
rejected.

What comes back is still text an attacker may have written. It is fenced as
untrusted data in the model prompt, and the report is refused entirely if it
cites a URL the builder never submitted — dropping such citations quietly would
leave a reviewer reading a link nobody offered as evidence.

## Deep review reads source, never runs it

A Deep Review additionally reads a submitted repository's actual file tree and
file contents through GitHub's API — more of a hackathon or milestone's real
code, not only its README. Everything that comes back is still exactly the
same kind of untrusted text as any other fetched evidence: no `git clone`, no
package install, no build step, and no code execution of any kind. The
advisory package cannot import `node:child_process`, call `eval`, construct a
`Function` from a string, or run anything through `node:vm` — CI fails the
build if it tries, the same enforcement that already covers the Stellar SDK
boundary (`scripts/check-boundaries.mjs`). A hostile submission can at most
make its own source say something unpleasant to the model; it still cannot
make anything run.

## API controls

Advisory generation accepts same-origin requests and applies a small in-process
rate limit. For a single-instance MVP that is defense in depth, not the whole
defense. Before anyone exposes paid model generation publicly, a distributed
deployment needs a shared rate limiter and wallet-backed reviewer
authentication.

## Operational checklist

- Keep `pnpm audit --prod --audit-level=high` and every CI job green.
- Deploy only optimized WASM built from the reviewed commit, and check the hash
  against the deployed contract (see [ARCHITECTURE.md](ARCHITECTURE.md)).
- Verify the configured SAC and contract id after every deployment.
- Use a persistent shared document store anywhere but local development.
- Watch contract events and storage TTLs.
- Test what happens when the reviewer disappears, when a trustline is frozen,
  and when testnet resets.
