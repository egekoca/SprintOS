#!/usr/bin/env bash
#
# Scenario C — reviewer approval followed by builder recovery claim.
#
# This verifies the liveness path added for cases where the reviewer approves
# the work but cannot return to sign a separate release transaction.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

NOW=$(date +%s)
DEADLINE=$((NOW + 7 * 86400))
AMOUNT=$(usdc 1)

step "Scenario C · builder claims an approved payment"
note "amount: 1 testnet USDC"

step "1/5 · Sponsor creates a one-milestone engagement"
ID=$(stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  create_engagement \
  --sponsor "$SPONSOR" --builder "$BUILDER" --reviewer "$REVIEWER" \
  --milestones "[
    {\"title\":\"Builder claim recovery smoke test\",\"criteria_hash\":\"$(doc_hash 'criteria-claim-smoke')\",\"amount\":\"$AMOUNT\",\"deadline\":$DEADLINE}
  ]" 2>/dev/null | tr -d '"')
ok "engagement #$ID created"

step "2/5 · Sponsor funds the escrow"
stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  fund --engagement_id "$ID" >/dev/null 2>&1
ok "escrow funded"

step "3/5 · Builder submits evidence"
stellar contract invoke --id "$CONTRACT" --source-account "$BUILDER_KEY" --network "$NETWORK" -- \
  submit_evidence --engagement_id "$ID" --milestone_idx 0 \
  --evidence_hash "$(doc_hash 'evidence-claim-smoke')" \
  --evidence_uri "https://github.com/egekoca/SprintOS" >/dev/null 2>&1
ok "status → EvidenceSubmitted"

step "4/5 · Reviewer records the binding approval"
stellar contract invoke --id "$CONTRACT" --source-account "$REVIEWER_KEY" --network "$NETWORK" -- \
  approve --engagement_id "$ID" --milestone_idx 0 >/dev/null 2>&1
ok "status → Approved"

step "5/5 · Builder claims the already-approved payment"
BEFORE=$(balance "$BUILDER")
stellar contract invoke --id "$CONTRACT" --source-account "$BUILDER_KEY" --network "$NETWORK" -- \
  claim --engagement_id "$ID" --milestone_idx 0 >/dev/null 2>&1
AFTER=$(balance "$BUILDER")
DELTA=$((AFTER - BEFORE))

if [[ "$DELTA" -ne "$AMOUNT" ]]; then
  echo "  ✗ expected builder balance to increase by $AMOUNT stroops, got $DELTA"
  exit 1
fi

ok "status → Released"
ok "builder received 1 testnet USDC"

echo
echo "Engagement id: $ID"
echo "Contract:      https://stellar.expert/explorer/testnet/contract/$CONTRACT"
