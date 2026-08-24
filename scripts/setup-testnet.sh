#!/usr/bin/env bash
#
# One-time testnet setup: five identities, a USDC asset the demo controls, and
# trustlines so the sponsor and builder can hold it.
#
# Run this before deploy.sh if you are reproducing the deployment from scratch.
set -euo pipefail

NETWORK="testnet"

echo "▸ Creating and funding identities"
for k in sprintos-deployer sprintos-issuer sprintos-sponsor sprintos-builder sprintos-reviewer; do
  if stellar keys address "$k" >/dev/null 2>&1; then
    echo "  · $k already exists"
  else
    stellar keys generate --network "$NETWORK" --fund "$k" >/dev/null
    echo "  ✓ $k $(stellar keys address "$k")"
  fi
done

ISSUER=$(stellar keys address sprintos-issuer)

echo "▸ Deploying the USDC Stellar Asset Contract"
stellar contract asset deploy --asset "USDC:$ISSUER" \
  --source-account sprintos-issuer --network "$NETWORK" >/dev/null 2>&1 || true
USDC=$(stellar contract id asset --asset "USDC:$ISSUER" --network "$NETWORK")
echo "  ✓ $USDC"

echo "▸ Opening trustlines"
for who in sprintos-sponsor sprintos-builder sprintos-reviewer; do
  stellar tx new change-trust --source-account "$who" --network "$NETWORK" \
    --line "USDC:$ISSUER" --limit 1000000000000 >/dev/null 2>&1 || true
  echo "  ✓ $who"
done

echo "▸ Minting 50,000 USDC to the sponsor"
stellar contract invoke --id "$USDC" --source-account sprintos-issuer \
  --network "$NETWORK" -- mint \
  --to "$(stellar keys address sprintos-sponsor)" --amount 500000000000 >/dev/null
echo "  ✓ done"

echo
echo "USDC SAC: $USDC"
echo "Next: scripts/deploy.sh"
