//! # A perfect AI score cannot move money
//!
//! This file exists to satisfy one line of the Statement of Work:
//!
//! > A required test will show that even a score of 100 cannot release testnet
//! > USDC without the authorized human wallet.
//!
//! If you are reviewing this project and read only one test, read
//! `test_ai_score_100_cannot_release`.
//!
//! ## Why the tests below look almost empty
//!
//! There is no "submit the AI report to the contract" step to test, because no
//! such step exists. The advisory module produces JSON that lives entirely
//! off-chain; the contract has never heard of it. What these tests demonstrate
//! is that the *absence* is load-bearing:
//!
//! 1. An advisory report scoring 100/100 exists and recommends approval.
//! 2. The module holds no key, so it can present no signature.
//! 3. Every call it could possibly make is refused.
//! 4. The moment — and only the moment — the human reviewer signs, funds move.

use super::*;
use crate::MilestoneStatus;
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, IntoVal,
};

/// Stand-in for the advisory module's output. Note what is *not* here: an
/// address, a key, or anything the contract would accept as an argument.
struct AdvisoryReport {
    advisory_score: u32,
    recommendation: &'static str,
    binding: bool,
}

fn perfect_report() -> AdvisoryReport {
    AdvisoryReport {
        advisory_score: 100,
        recommendation: "ReadyForReview",
        binding: false,
    }
}

/// **The test the Statement of Work asks for.**
///
/// A milestone has evidence, the advisory module scored it 100/100 and
/// recommends it. No human has signed. The USDC does not move.
#[test]
fn test_ai_score_100_cannot_release() {
    let f = setup();
    let id = funded_engagement(&f);

    f.client.submit_evidence(
        &id,
        &0,
        &f.hash(11),
        &f.uri("https://github.com/egekoca/SprintOS/pull/1"),
    );

    // The AI is as confident as it is possible to be.
    let report = perfect_report();
    assert_eq!(report.advisory_score, 100);
    assert_eq!(report.recommendation, "ReadyForReview");
    assert!(!report.binding);

    let escrow_before = f.balance(&f.contract_id);
    let builder_before = f.balance(&f.builder);

    // The advisory module has no wallet. The closest it can get to acting is an
    // address that never appears in the engagement — exactly like any other
    // stranger on the network.
    let ai_service: Address = Address::generate(&f.env);

    // Strip every authorization from the environment. This is the module's real
    // position: it can form a call, but it cannot sign one.
    f.env.set_auths(&[]);

    // Attempt 1: approve on the strength of the score.
    assert!(
        f.client.try_approve(&f.reviewer, &id, &0).is_err(),
        "a 100/100 score must not be able to approve a milestone"
    );

    // Attempt 2: skip the reviewer entirely and go straight for the money.
    assert!(
        f.client.try_release(&f.reviewer, &id, &0).is_err(),
        "a 100/100 score must not be able to release funds"
    );

    // Attempt 3: present a signature of its own. It is a valid signature — just
    // not the reviewer's, which is the only one this milestone answers to.
    assert!(
        f.client
            .mock_auths(&[MockAuth {
                address: &ai_service,
                invoke: &MockAuthInvoke {
                    contract: &f.contract_id,
                    fn_name: "release",
                    args: (id, 0u32).into_val(&f.env),
                    sub_invokes: &[],
                },
            }])
            .try_release(&f.reviewer, &id, &0)
            .is_err(),
        "a signature from anyone other than the reviewer must be refused"
    );

    // Nothing moved.
    assert_eq!(f.balance(&f.contract_id), escrow_before);
    assert_eq!(f.balance(&f.builder), builder_before);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::EvidenceSubmitted,
        "the milestone status is unchanged by the advisory report"
    );

    // And now the human. Same milestone, same evidence, same report — the only
    // thing that changed is that the configured reviewer wallet signed.
    f.env.mock_all_auths();
    f.client.approve(&f.reviewer, &id, &0);
    f.env.set_auths(&[]);
    assert!(
        f.client.try_claim(&id, &0).is_err(),
        "the advisory service cannot claim an approved payment without the builder"
    );
    f.env.mock_all_auths();
    f.client.release(&f.reviewer, &id, &0);

    assert_eq!(f.balance(&f.builder), builder_before + 500 * UNIT);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Released
    );
}

/// The mirror image: a score of 0 does not block a reviewer who disagrees.
///
/// The advisory module is not a gate in either direction. If it were, a
/// low-scoring report could hold a builder's payment hostage — which would make
/// the AI a decision maker by omission.
#[test]
fn test_ai_score_zero_does_not_block_human_approval() {
    let f = setup();
    let id = funded_engagement(&f);

    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));

    let dismal = AdvisoryReport {
        advisory_score: 0,
        recommendation: "RevisionSuggested",
        binding: false,
    };
    assert_eq!(dismal.advisory_score, 0);

    // The reviewer looked at the evidence themselves and disagreed with the
    // module. Their judgement is the one that counts.
    f.client.approve(&f.reviewer, &id, &0);
    f.client.release(&f.reviewer, &id, &0);

    assert_eq!(f.balance(&f.builder), 500 * UNIT);
}

/// The whole flow completes with no advisory report in existence at all.
///
/// This is the "AI service unavailable" case the SOW asks for, stated as a
/// property rather than an error path: the module is not on the critical path,
/// so it cannot take the critical path down — or over.
#[test]
fn test_settlement_works_with_no_advisory_report_at_all() {
    let f = setup();
    let id = funded_engagement(&f);

    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&f.reviewer, &id, &0);
    f.client.release(&f.reviewer, &id, &0);

    assert_eq!(f.balance(&f.builder), 500 * UNIT);
}

/// The contract stores nothing that an advisory report could have written to.
///
/// A reviewer reading `Milestone` on-chain sees only facts the humans put
/// there: the criteria hash, the evidence hash, the status, and the timestamps.
#[test]
fn test_milestone_state_has_no_ai_writable_field() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));

    let m = f.client.get_milestone(&id, &0);

    // Everything on this struct traces back to a signed human action.
    assert_eq!(m.status, MilestoneStatus::EvidenceSubmitted);
    assert_eq!(m.evidence_hash, Some(f.hash(11)));
    assert_eq!(m.criteria_hash, f.hash(1));
    assert_eq!(m.amount, 500 * UNIT);
    assert_eq!(m.decided_at, 0, "no decision has been recorded yet");
}
