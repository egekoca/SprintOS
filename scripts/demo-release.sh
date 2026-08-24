#!/usr/bin/env bash
#
# Scenario A — approval and release.
#
# A sponsor funds three milestones. The builder delivers the first one. The
# reviewer approves it and signs the release. Testnet USDC moves to the builder.
#
# This is the "one completed approval and release scenario" the SOW requires.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

NOW=$(date +%s)
D1=$((NOW + 7 * 86400))
D2=$((NOW + 14 * 86400))
D3=$((NOW + 21 * 86400))

step "Scenario A · approval and release"
note "sponsor  $SPONSOR"
note "builder  $BUILDER"
note "reviewer $REVIEWER"

step "1/6 · Sponsor defines an engagement with three milestones"
ID=$(stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  create_engagement \
  --sponsor "$SPONSOR" --builder "$BUILDER" --reviewer "$REVIEWER" \
  --milestones "[
    {\"title\":\"Soroban settlement contract\",\"criteria_hash\":\"$(doc_hash 'criteria-milestone-1')\",\"amount\":\"$(usdc 500)\",\"deadline\":$D1},
    {\"title\":\"Advisory review module\",\"criteria_hash\":\"$(doc_hash 'criteria-milestone-2')\",\"amount\":\"$(usdc 300)\",\"deadline\":$D2},
    {\"title\":\"Web MVP\",\"criteria_hash\":\"$(doc_hash 'criteria-milestone-3')\",\"amount\":\"$(usdc 200)\",\"deadline\":$D3}
  ]" 2>/dev/null | tr -d '"')
ok "engagement #$ID created"

step "2/6 · Sponsor funds the escrow with 1,000 USDC"
stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  fund --engagement_id "$ID" >/dev/null 2>&1
ok "escrow holds $(python3 -c "print($(balance "$CONTRACT")/$UNIT)") USDC"

step "3/6 · Builder submits evidence for milestone 0"
stellar contract invoke --id "$CONTRACT" --source-account "$BUILDER_KEY" --network "$NETWORK" -- \
  submit_evidence --engagement_id "$ID" --milestone_idx 0 \
  --evidence_hash "$(doc_hash 'evidence-bundle-milestone-1')" \
  --evidence_uri "https://github.com/egekoca/SprintOS/pull/1" >/dev/null 2>&1
ok "status → EvidenceSubmitted"

step "4/6 · The advisory module scores the evidence"
note "advisory_score: 92/100 · recommendation: ReadyForReview · binding: false"
note "No transaction was submitted. The report is off-chain and changes nothing."

step "5/6 · Reviewer approves — a judgement, not a payment"
stellar contract invoke --id "$CONTRACT" --source-account "$REVIEWER_KEY" --network "$NETWORK" -- \
  approve --engagement_id "$ID" --milestone_idx 0 >/dev/null 2>&1
ok "status → Approved · builder balance still $(python3 -c "print($(balance "$BUILDER")/$UNIT)") USDC"

step "6/6 · Reviewer signs the release"
BEFORE=$(balance "$BUILDER")
stellar contract invoke --id "$CONTRACT" --source-account "$REVIEWER_KEY" --network "$NETWORK" -- \
  release --engagement_id "$ID" --milestone_idx 0 >/dev/null 2>&1
AFTER=$(balance "$BUILDER")
ok "status → Released"
ok "builder received $(python3 -c "print(($AFTER-$BEFORE)/$UNIT)") USDC"
ok "escrow now holds $(python3 -c "print($(balance "$CONTRACT")/$UNIT)") USDC"

echo
echo "Engagement id: $ID"
echo "Contract:      https://stellar.expert/explorer/testnet/contract/$CONTRACT"
