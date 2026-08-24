#!/usr/bin/env bash
# Shared configuration for every SprintOS testnet script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT="$ROOT/deployments/testnet.json"

NETWORK="testnet"
CONTRACT=$(jq -r .settlementContractId "$DEPLOYMENT")
USDC=$(jq -r .usdcSacId "$DEPLOYMENT")
ISSUER=$(jq -r .usdcIssuer "$DEPLOYMENT")

SPONSOR_KEY="sprintos-sponsor"
BUILDER_KEY="sprintos-builder"
REVIEWER_KEY="sprintos-reviewer"
ISSUER_KEY="sprintos-issuer"

SPONSOR=$(stellar keys address "$SPONSOR_KEY")
BUILDER=$(stellar keys address "$BUILDER_KEY")
REVIEWER=$(stellar keys address "$REVIEWER_KEY")

# USDC carries 7 decimals.
UNIT=10000000

usdc() { python3 -c "print(int($1 * $UNIT))"; }

step()  { printf "\n\033[1;38;5;208m▸ %s\033[0m\n" "$*"; }
note()  { printf "  \033[2m%s\033[0m\n" "$*"; }
ok()    { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }

balance() {
  stellar contract invoke --id "$USDC" --source-account "$SPONSOR_KEY" \
    --network "$NETWORK" -- balance --id "$1" 2>/dev/null | tr -d '"'
}

# Deterministic 32-byte stand-in for the sha256 of an off-chain document.
doc_hash() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }
