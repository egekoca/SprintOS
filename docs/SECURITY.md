# Security model

## Trust boundaries

- The contract is authoritative for money and roles.
- UI role checks are convenience only; every value-moving path requires Soroban
  authorization from the role recorded in contract storage.
- Advisory output is untrusted and non-binding. It cannot import the Stellar SDK
  or signing code, and the contract accepts no score or recommendation.
- Criteria, evidence and reports are untrusted off-chain data until their schema
  and hashes verify.

## Value-moving paths

- `fund`: sponsor authorization; moves the full commitment into escrow.
- `release`: reviewer authorization; pays an approved milestone.
- `claim`: builder authorization; recovers an already-approved payment if the
  reviewer cannot return for the second signature. It cannot approve work.
- `refund`: sponsor authorization; reclaims an unapproved milestone after its
  deadline.

The contract is intentionally immutable: there is no admin, upgrade or pause
entrypoint. This reduces governance authority but also means a deployed defect
cannot be patched. Deploy a new contract and migrate users rather than treating
the testnet address as permanent.

## Public evidence retrieval

Evidence fetches require credential-free HTTPS. Local, private, link-local,
reserved and documentation IP ranges are refused after DNS resolution;
redirects are refused; response time and size are bounded; binary content is
not accepted. Retrieved text remains prompt-injection-capable data and is fenced
as untrusted in the model prompt.

## API controls

Advisory generation accepts same-origin requests and applies a small in-process
rate limit. This is defense-in-depth for the single-instance MVP. A distributed
deployment must use a shared rate limiter and wallet-backed reviewer
authentication before exposing paid model generation publicly.

## Operational checklist

- Keep `pnpm audit --prod --audit-level=high` and all CI jobs green.
- Deploy only optimized WASM built from the reviewed commit.
- Verify the configured SAC and contract id after every deployment.
- Use a persistent shared document store outside local development.
- Monitor contract events and storage TTLs.
- Test reviewer loss, frozen asset/trustline failures and testnet resets.
