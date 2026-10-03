#!/usr/bin/env bash
#
# Build and deploy the settlement contract to Stellar mainnet, then record
# the result in deployments/mainnet.json and apps/web/lib/stellar/deployment.mainnet.json.
#
# This moves real money (the deploy fee, a few XLM) from a real account and
# publishes a contract that is meant to hold real USDC. Nothing about it is
# reversible. Read every step before running it.
#
# Before running this:
#   1. Create or import a funded mainnet identity for the deployer:
#        stellar keys generate --network mainnet sprintos-mainnet-deployer
#      then send it a small amount of real XLM (a few is enough for fees) —
#      this script does not fund anything.
#   2. Defaults to https://mainnet.sorobanrpc.com (a public provider from
#      Stellar's own RPC provider list — no free SDF-hosted mainnet RPC
#      exists the way it does for testnet). Override with:
#        export STELLAR_MAINNET_RPC_URL="https://..."
#      if it is rate-limited or unavailable when you run this.
#   3. Re-verify the canonical USDC issuer and SAC id this script uses against
#      your own source (developers.circle.com, stellar.expert) rather than
#      trusting this file. See deployment.mainnet.json's own _readme.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NETWORK="mainnet"
DEPLOYER="${SPRINTOS_MAINNET_DEPLOYER:-sprintos-mainnet-deployer}"
RPC_URL="${STELLAR_MAINNET_RPC_URL:-https://mainnet.sorobanrpc.com}"
# Circle's canonical Stellar mainnet USDC issuer — verify this yourself before
# trusting it; see deployment.mainnet.json's _readme for how it was sourced.
USDC_ISSUER="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
USDC="$(stellar contract id asset --asset "USDC:$USDC_ISSUER" --network "$NETWORK")"

echo "▸ Deployer: $(stellar keys address "$DEPLOYER")"
echo "▸ RPC: $RPC_URL"
echo "▸ USDC SAC: $USDC"
read -r -p "Deploy the settlement contract to MAINNET with these values? [type YES to continue] " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  echo "Aborted — nothing was deployed."
  exit 1
fi

echo "▸ Building"
stellar contract build

WASM="target/wasm32v1-none/release/sprintos_settlement.wasm"
echo "  ✓ $WASM ($(wc -c < "$WASM" | tr -d ' ') bytes)"

echo "▸ Running the full contract test suite before deploying, including the AI-cannot-release proof"
cargo test --package sprintos-settlement --quiet

echo "▸ Deploying with token=$USDC"
CONTRACT=$(stellar contract deploy --wasm "$WASM" \
  --source-account "$DEPLOYER" --network "$NETWORK" --rpc-url "$RPC_URL" \
  --alias sprintos-settlement-mainnet \
  -- --token "$USDC" 2>/dev/null | tail -1)

WASM_SHA256=$(shasum -a 256 "$WASM" | cut -d' ' -f1)

mkdir -p deployments
cat > deployments/mainnet.json <<JSON
{
  "network": "mainnet",
  "networkPassphrase": "Public Global Stellar Network ; September 2015",
  "rpcUrl": "$RPC_URL",
  "horizonUrl": "https://horizon.stellar.org",
  "settlementContractId": "$CONTRACT",
  "usdcSacId": "$USDC",
  "usdcAsset": "USDC:$USDC_ISSUER",
  "usdcIssuer": "$USDC_ISSUER",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "features": {
    "builderClaim": true,
    "reviewerList": true
  },
  "explorer": {
    "contract": "https://stellar.expert/explorer/public/contract/$CONTRACT",
    "usdc": "https://stellar.expert/explorer/public/asset/USDC-$USDC_ISSUER"
  },
  "firstEngagementId": 0,
  "wasmSha256": "$WASM_SHA256",
  "previousDeployment": null
}
JSON

cp deployments/mainnet.json apps/web/lib/stellar/deployment.mainnet.json

echo
echo "  ✓ $CONTRACT"
echo "  ✓ https://stellar.expert/explorer/public/contract/$CONTRACT"
echo
echo "deployment.mainnet.json is filled in but NEXT_PUBLIC_NETWORK_MODE is still"
echo "unset in your running deployment — flip it only when you are ready to go live."
