#!/usr/bin/env bash
#
# Scenario B — hold and refund.
#
# The reviewer holds a milestone rather than approving it, the deadline passes
# with no acceptable delivery, and the sponsor reclaims the funds.
#
# This is the "one Hold or refund scenario" the SOW requires. The milestone
# deadline is set two minutes out so the scenario completes in one sitting.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

WINDOW=${REFUND_WINDOW:-120}
NOW=$(date +%s)
D1=$((NOW + WINDOW))

step "Scenario B · hold and refund"
note "milestone deadline is ${WINDOW}s out so the refund path is reachable live"

step "1/6 · Sponsor defines a single-milestone engagement"
ID=$(stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  create_engagement \
  --sponsor "$SPONSOR" --builder "$BUILDER" --reviewer "$REVIEWER" \
  --milestones "[
    {\"title\":\"Deliverable that misses its deadline\",\"criteria_hash\":\"$(doc_hash 'criteria-refund-demo')\",\"amount\":\"$(usdc 250)\",\"deadline\":$D1}
  ]" 2>/dev/null | tr -d '"')
ok "engagement #$ID created"

step "2/6 · Sponsor funds 250 USDC"
stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  fund --engagement_id "$ID" >/dev/null 2>&1
ok "escrow funded"

step "3/6 · Builder submits thin evidence"
stellar contract invoke --id "$CONTRACT" --source-account "$BUILDER_KEY" --network "$NETWORK" -- \
  submit_evidence --engagement_id "$ID" --milestone_idx 0 \
  --evidence_hash "$(doc_hash 'evidence-insufficient')" \
  --evidence_uri "https://example.com/wip" >/dev/null 2>&1
ok "status → EvidenceSubmitted"

step "4/6 · The advisory module flags gaps"
note "advisory_score: 34/100 · recommendation: RevisionSuggested · binding: false"
note "The reviewer read the evidence themselves before deciding."

step "5/6 · Reviewer holds the milestone"
stellar contract invoke --id "$CONTRACT" --source-account "$REVIEWER_KEY" --network "$NETWORK" -- \
  hold --engagement_id "$ID" --milestone_idx 0 >/dev/null 2>&1
ok "status → Held"

step "Early refund attempt — expected to be refused"
if stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  refund --engagement_id "$ID" --milestone_idx 0 >/dev/null 2>&1; then
  echo "  ✗ UNEXPECTED: the refund succeeded before the deadline"
  exit 1
else
  ok "rejected with DeadlineNotReached, as it should be"
fi

step "Waiting ${WINDOW}s for the deadline to pass"
sleep $((WINDOW + 10))

step "6/6 · Sponsor reclaims the milestone"
BEFORE=$(balance "$SPONSOR")
stellar contract invoke --id "$CONTRACT" --source-account "$SPONSOR_KEY" --network "$NETWORK" -- \
  refund --engagement_id "$ID" --milestone_idx 0 >/dev/null 2>&1
AFTER=$(balance "$SPONSOR")
ok "status → Refunded"
ok "sponsor recovered $(python3 -c "print(($AFTER-$BEFORE)/$UNIT)") USDC"

echo
echo "Engagement id: $ID"
echo "Contract:      https://stellar.expert/explorer/testnet/contract/$CONTRACT"
