#!/usr/bin/env bash
#
# Build and deploy the settlement contract to Stellar testnet, then record the
# result in deployments/testnet.json.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NETWORK="testnet"
ISSUER=$(stellar keys address sprintos-issuer)
USDC=$(stellar contract id asset --asset "USDC:$ISSUER" --network "$NETWORK")

echo "▸ Building"
stellar contract build

WASM="target/wasm32v1-none/release/sprintos_settlement.wasm"
echo "  ✓ $WASM ($(wc -c < "$WASM" | tr -d ' ') bytes)"

echo "▸ Running the test suite before deploying"
cargo test --package sprintos-settlement --quiet

echo "▸ Deploying with token=$USDC"
CONTRACT=$(stellar contract deploy --wasm "$WASM" \
  --source-account sprintos-deployer --network "$NETWORK" \
  --alias sprintos-settlement \
  -- --token "$USDC" 2>/dev/null | tail -1)

mkdir -p deployments
cat > deployments/testnet.json <<JSON
{
  "network": "testnet",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "horizonUrl": "https://horizon-testnet.stellar.org",
  "settlementContractId": "$CONTRACT",
  "usdcSacId": "$USDC",
  "usdcAsset": "USDC:$ISSUER",
  "usdcIssuer": "$ISSUER",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "features": {
    "builderClaim": true
  },
  "explorer": {
    "contract": "https://stellar.expert/explorer/testnet/contract/$CONTRACT",
    "usdc": "https://stellar.expert/explorer/testnet/contract/$USDC"
  },
  "demoAccounts": {
    "sponsor": "$(stellar keys address sprintos-sponsor)",
    "builder": "$(stellar keys address sprintos-builder)",
    "reviewer": "$(stellar keys address sprintos-reviewer)"
  }
}
JSON

# Keep the browser's checked-in testnet defaults in lockstep with the canonical
# deployment record. Environment variables can still override these at runtime.
cp deployments/testnet.json apps/web/lib/stellar/deployment.json

echo "  ✓ $CONTRACT"
echo "  ✓ https://stellar.expert/explorer/testnet/contract/$CONTRACT"
