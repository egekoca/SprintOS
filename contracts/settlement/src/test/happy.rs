//! Successful transactions — the flows the demo walks through.

use super::*;
use crate::{EngagementStatus, MilestoneStatus};

/// 01 — create → fund → submit → approve → release.
#[test]
fn test_happy_path_release() {
    let f = setup();
    let id = funded_engagement(&f);

    // Escrow holds the full total; the sponsor is down by exactly that.
    assert_eq!(f.balance(&f.contract_id), TOTAL);
    assert_eq!(f.client.get_balance(&id), TOTAL);

    f.client.submit_evidence(
        &id,
        &0,
        &f.hash(11),
        &f.uri("https://github.com/egekoca/SprintOS/pull/1"),
    );
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::EvidenceSubmitted
    );

    f.client.approve(&f.reviewer, &id, &0);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Approved
    );
    // Approving is a judgement, not a payment. Nothing has moved yet.
    assert_eq!(f.balance(&f.builder), 0);

    f.client.release(&f.reviewer, &id, &0);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Released
    );
    assert_eq!(f.balance(&f.builder), 500 * UNIT);
    assert_eq!(f.client.get_balance(&id), 500 * UNIT);
}

/// Once the reviewer has approved, the builder can recover payment even if the
/// reviewer cannot return for the separate release signature.
#[test]
fn test_builder_can_claim_approved_payment() {
    let f = setup();
    let id = funded_engagement(&f);

    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&f.reviewer, &id, &0);
    f.client.claim(&id, &0);

    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Released
    );
    assert_eq!(f.balance(&f.builder), 500 * UNIT);
}

/// 02 — hold → resubmit → approve → release.
#[test]
fn test_hold_then_resubmit() {
    let f = setup();
    let id = funded_engagement(&f);

    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com/v1"));
    f.client.hold(&f.reviewer, &id, &0);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Held
    );
    assert_eq!(f.balance(&f.builder), 0);

    // The builder gets another attempt.
    f.client
        .submit_evidence(&id, &0, &f.hash(12), &f.uri("https://example.com/v2"));
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::EvidenceSubmitted
    );

    f.client.approve(&f.reviewer, &id, &0);
    f.client.release(&f.reviewer, &id, &0);
    assert_eq!(f.balance(&f.builder), 500 * UNIT);
}

/// All three milestones settle, and the engagement closes on its own.
#[test]
fn test_all_milestones_release_closes_engagement() {
    let f = setup();
    let id = funded_engagement(&f);

    for idx in 0..3u32 {
        f.client.submit_evidence(
            &id,
            &idx,
            &f.hash(20 + idx as u8),
            &f.uri("https://example.com"),
        );
        f.client.approve(&f.reviewer, &id, &idx);
        f.client.release(&f.reviewer, &id, &idx);
    }

    assert_eq!(f.balance(&f.builder), TOTAL);
    assert_eq!(f.balance(&f.contract_id), 0);
    assert_eq!(f.client.get_balance(&id), 0);
    assert_eq!(
        f.client.get_engagement(&id).status,
        EngagementStatus::Closed
    );
}

/// Milestones are independent: holding one does not stall the others.
#[test]
fn test_milestones_are_independent() {
    let f = setup();
    let id = funded_engagement(&f);

    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com/a"));
    f.client.hold(&f.reviewer, &id, &0);

    f.client
        .submit_evidence(&id, &1, &f.hash(12), &f.uri("https://example.com/b"));
    f.client.approve(&f.reviewer, &id, &1);
    f.client.release(&f.reviewer, &id, &1);

    assert_eq!(f.balance(&f.builder), 300 * UNIT);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Held
    );
}
