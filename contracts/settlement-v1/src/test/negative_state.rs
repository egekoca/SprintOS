//! Invalid states, duplicate releases and incorrect amounts.

use super::*;
use crate::Error;
use soroban_sdk::{String, Vec};

/// 06 — release requires an approval first.
#[test]
fn test_release_requires_approved() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));

    assert_eq!(f.client.try_release(&id, &0), Err(Ok(Error::InvalidState)));
    assert_eq!(f.balance(&f.builder), 0);
}

/// Releasing an untouched milestone is also refused.
#[test]
fn test_release_on_pending_rejected() {
    let f = setup();
    let id = funded_engagement(&f);
    assert_eq!(f.client.try_release(&id, &0), Err(Ok(Error::InvalidState)));
}

#[test]
fn test_claim_requires_approved() {
    let f = setup();
    let id = funded_engagement(&f);
    assert_eq!(f.client.try_claim(&id, &0), Err(Ok(Error::InvalidState)));
}

/// 07 — approval requires evidence to approve.
#[test]
fn test_approve_requires_evidence() {
    let f = setup();
    let id = funded_engagement(&f);
    assert_eq!(f.client.try_approve(&id, &0), Err(Ok(Error::InvalidState)));
}

/// Holding an unsubmitted milestone is meaningless and refused.
#[test]
fn test_hold_requires_evidence() {
    let f = setup();
    let id = funded_engagement(&f);
    assert_eq!(f.client.try_hold(&id, &0), Err(Ok(Error::InvalidState)));
}

/// 08 — paying the same milestone twice.
#[test]
fn test_double_release_rejected() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&id, &0);
    f.client.release(&id, &0);

    assert_eq!(
        f.client.try_release(&id, &0),
        Err(Ok(Error::AlreadyReleased))
    );
    // Crucially: the balance did not move a second time.
    assert_eq!(f.balance(&f.builder), 500 * UNIT);
    assert_eq!(f.balance(&f.contract_id), 500 * UNIT);
}

/// A released milestone cannot be re-approved back into a payable state.
#[test]
fn test_cannot_reapprove_released() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&id, &0);
    f.client.release(&id, &0);

    assert_eq!(f.client.try_approve(&id, &0), Err(Ok(Error::InvalidState)));
    assert_eq!(
        f.client
            .try_submit_evidence(&id, &0, &f.hash(12), &f.uri("https://example.com")),
        Err(Ok(Error::AlreadyReleased))
    );
}

/// 09 — funding twice would double-charge the sponsor.
#[test]
fn test_double_fund_rejected() {
    let f = setup();
    let id = funded_engagement(&f);
    assert_eq!(f.client.try_fund(&id), Err(Ok(Error::AlreadyFunded)));
    assert_eq!(f.balance(&f.contract_id), TOTAL);
}

/// Work cannot start before the escrow is actually funded.
#[test]
fn test_cannot_submit_before_funding() {
    let f = setup();
    f.env.mock_all_auths();
    let id = f
        .client
        .create_engagement(&f.sponsor, &f.builder, &f.reviewer, &three_milestones(&f));

    assert_eq!(
        f.client
            .try_submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com")),
        Err(Ok(Error::NotFunded))
    );
}

/// 11 — the SOW caps an engagement at three milestones.
#[test]
fn test_max_three_milestones() {
    let f = setup();
    f.env.mock_all_auths();

    let mut v = three_milestones(&f);
    v.push_back(crate::MilestoneInput {
        title: f.uri("Fourth milestone"),
        criteria_hash: f.hash(4),
        amount: 100 * UNIT,
        deadline: f.start + 28 * DAY,
    });

    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.reviewer, &v),
        Err(Ok(Error::TooManyMilestones))
    );
}

/// An engagement with no milestones has nothing to settle.
#[test]
fn test_zero_milestones_rejected() {
    let f = setup();
    f.env.mock_all_auths();
    let empty: Vec<crate::MilestoneInput> = Vec::new(&f.env);

    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.reviewer, &empty),
        Err(Ok(Error::NoMilestones))
    );
}

/// A zero or negative milestone amount is not a milestone.
#[test]
fn test_zero_amount_rejected() {
    let f = setup();
    f.env.mock_all_auths();

    let mut v: Vec<crate::MilestoneInput> = Vec::new(&f.env);
    v.push_back(crate::MilestoneInput {
        title: String::from_str(&f.env, "Free work"),
        criteria_hash: f.hash(1),
        amount: 0,
        deadline: f.start + 7 * DAY,
    });

    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.reviewer, &v),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn test_total_amount_overflow_is_typed() {
    let f = setup();
    f.env.mock_all_auths();
    let mut milestones = Vec::new(&f.env);
    for seed in 1..=2 {
        milestones.push_back(crate::MilestoneInput {
            title: f.uri("Large milestone"),
            criteria_hash: f.hash(seed),
            amount: i128::MAX,
            deadline: f.start + 7 * DAY,
        });
    }
    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.reviewer, &milestones),
        Err(Ok(Error::ArithmeticOverflow))
    );
}

#[test]
fn test_title_and_evidence_uri_lengths_are_bounded() {
    let f = setup();
    f.env.mock_all_auths();

    let mut milestones = Vec::new(&f.env);
    milestones.push_back(crate::MilestoneInput {
        title: String::from_bytes(&f.env, &[b'x'; 201]),
        criteria_hash: f.hash(1),
        amount: UNIT,
        deadline: f.start + 7 * DAY,
    });
    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.reviewer, &milestones),
        Err(Ok(Error::InvalidTitle))
    );

    let id = funded_engagement(&f);
    assert_eq!(
        f.client.try_submit_evidence(
            &id,
            &0,
            &f.hash(11),
            &String::from_bytes(&f.env, &[b'x'; 2_049]),
        ),
        Err(Ok(Error::InvalidEvidenceUri))
    );
}

/// A deadline in the past would make the milestone refundable on creation.
#[test]
fn test_past_deadline_rejected() {
    let f = setup();
    f.env.mock_all_auths();

    let mut v: Vec<crate::MilestoneInput> = Vec::new(&f.env);
    v.push_back(crate::MilestoneInput {
        title: String::from_str(&f.env, "Already overdue"),
        criteria_hash: f.hash(1),
        amount: 100 * UNIT,
        deadline: f.start - 1,
    });

    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.reviewer, &v),
        Err(Ok(Error::InvalidDeadline))
    );
}

/// The three roles must be three different people. A sponsor who is also the
/// reviewer could approve and pay themselves with no oversight at all.
#[test]
fn test_roles_must_be_distinct() {
    let f = setup();
    f.env.mock_all_auths();

    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.sponsor, &three_milestones(&f)),
        Err(Ok(Error::DuplicateRole))
    );
    assert_eq!(
        f.client
            .try_create_engagement(&f.sponsor, &f.builder, &f.builder, &three_milestones(&f)),
        Err(Ok(Error::DuplicateRole))
    );
}

/// Indexing past the end of the milestone list.
#[test]
fn test_unknown_milestone_index() {
    let f = setup();
    let id = funded_engagement(&f);
    assert_eq!(
        f.client.try_approve(&id, &9),
        Err(Ok(Error::MilestoneNotFound))
    );
}

/// Acting on an engagement that was never created.
#[test]
fn test_unknown_engagement() {
    let f = setup();
    f.env.mock_all_auths();
    assert_eq!(
        f.client.try_approve(&404, &0),
        Err(Ok(Error::EngagementNotFound))
    );
}
