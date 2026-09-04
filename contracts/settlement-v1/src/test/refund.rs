//! Deadline-based refunds.

use super::*;
use crate::{EngagementStatus, Error, MilestoneStatus};

/// 03 — the deadline passes with no delivery, and the sponsor reclaims.
#[test]
fn test_refund_after_deadline() {
    let f = setup();
    let id = funded_engagement(&f);
    let before = f.balance(&f.sponsor);

    f.warp(8 * DAY); // milestone 0 was due at day 7
    f.client.refund(&id, &0);

    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Refunded
    );
    assert_eq!(f.balance(&f.sponsor), before + 500 * UNIT);
    assert_eq!(f.client.get_balance(&id), 500 * UNIT);
}

/// 10 — refunding before the deadline would let a sponsor walk away mid-sprint.
#[test]
fn test_early_refund_rejected() {
    let f = setup();
    let id = funded_engagement(&f);

    f.warp(DAY); // still six days of runway left
    assert_eq!(
        f.client.try_refund(&id, &0),
        Err(Ok(Error::DeadlineNotReached))
    );
    assert_eq!(f.balance(&f.contract_id), TOTAL);
}

/// Exactly at the deadline is not yet past it.
#[test]
fn test_refund_at_exact_deadline_rejected() {
    let f = setup();
    let id = funded_engagement(&f);

    f.warp(7 * DAY);
    assert_eq!(
        f.client.try_refund(&id, &0),
        Err(Ok(Error::DeadlineNotReached))
    );
}

/// Evidence sitting unreviewed past the deadline is still refundable — otherwise
/// a builder could freeze a sponsor's funds by submitting anything at all.
#[test]
fn test_refund_works_on_submitted_milestone() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));

    f.warp(8 * DAY);
    f.client.refund(&id, &0);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Refunded
    );
}

/// A held milestone is refundable once its deadline passes.
#[test]
fn test_refund_works_on_held_milestone() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.hold(&id, &0);

    f.warp(8 * DAY);
    f.client.refund(&id, &0);
    assert_eq!(
        f.client.get_milestone(&id, &0).status,
        MilestoneStatus::Refunded
    );
}

/// An approved milestone is owed to the builder. The clock does not undo the
/// reviewer's decision, and the sponsor cannot claw it back.
#[test]
fn test_cannot_refund_approved_milestone() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&id, &0);

    f.warp(30 * DAY);
    assert_eq!(f.client.try_refund(&id, &0), Err(Ok(Error::InvalidState)));

    // And it still pays out normally afterwards.
    f.client.release(&id, &0);
    assert_eq!(f.balance(&f.builder), 500 * UNIT);
}

/// A released milestone cannot then be refunded — that would pay twice.
#[test]
fn test_cannot_refund_released_milestone() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&id, &0);
    f.client.release(&id, &0);

    f.warp(30 * DAY);
    assert_eq!(
        f.client.try_refund(&id, &0),
        Err(Ok(Error::AlreadyReleased))
    );
}

/// Refunding the same milestone twice would drain the other milestones' escrow.
#[test]
fn test_double_refund_rejected() {
    let f = setup();
    let id = funded_engagement(&f);
    f.warp(8 * DAY);
    f.client.refund(&id, &0);

    assert_eq!(f.client.try_refund(&id, &0), Err(Ok(Error::InvalidState)));
    assert_eq!(f.balance(&f.contract_id), 500 * UNIT);
}

/// The mixed outcome the demo shows: one milestone paid, the rest reclaimed.
#[test]
fn test_mixed_release_and_refund_closes_engagement() {
    let f = setup();
    let id = funded_engagement(&f);
    let sponsor_before = f.balance(&f.sponsor);

    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&id, &0);
    f.client.release(&id, &0);

    f.warp(22 * DAY);
    f.client.refund(&id, &1);
    f.client.refund(&id, &2);

    assert_eq!(f.balance(&f.builder), 500 * UNIT);
    assert_eq!(f.balance(&f.sponsor), sponsor_before + 500 * UNIT);
    assert_eq!(f.balance(&f.contract_id), 0);
    assert_eq!(
        f.client.get_engagement(&id).status,
        EngagementStatus::Closed
    );
}
