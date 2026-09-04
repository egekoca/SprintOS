#![cfg(test)]
//! Who may decide a payout, and who may never.
//!
//! The previous contract answered this with one fixed address. This one lets
//! the sponsor decide their own payouts and authorise others to as well, which
//! is a larger surface — so the tests here are mostly about what the wider door
//! still refuses to let through.
//!
//! The rule that matters: **the builder can never decide.** Everything else is
//! an inconvenience if it goes wrong. That one is money.

use super::*;
use crate::{Error, MAX_REVIEWERS};
use soroban_sdk::{testutils::Address as _, Address, Vec};

/// An engagement where only the sponsor decides, funded and ready to judge.
fn sponsor_only(f: &Fixture) -> u64 {
    f.env.mock_all_auths();
    let none = Vec::new(&f.env);
    let id = f
        .client
        .create_engagement(&f.sponsor, &f.builder, &none, &three_milestones(f));
    f.client.fund(&id);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    id
}

// ------------------------------------------------------- the sponsor decides

#[test]
fn test_the_sponsor_can_always_decide() {
    let f = setup();
    let id = sponsor_only(&f);
    assert!(f.client.can_decide(&id, &f.sponsor));
}

/// Even with other wallets authorised, the sponsor keeps their own authority —
/// it comes from having funded the work, not from a list entry.
#[test]
fn test_authorising_others_does_not_displace_the_sponsor() {
    let f = setup();
    let id = funded_engagement(&f);
    assert!(f.client.can_decide(&id, &f.sponsor));
    assert!(f.client.can_decide(&id, &f.reviewer));
}

// ------------------------------------------------------- the builder never

/// The whole reason this contract still refuses one collision.
#[test]
fn test_the_builder_can_never_decide() {
    let f = setup();
    let id = sponsor_only(&f);
    assert!(!f.client.can_decide(&id, &f.builder));
    assert_eq!(
        f.client.try_approve(&f.builder, &id, &0),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn test_the_builder_cannot_be_added_later() {
    let f = setup();
    let id = sponsor_only(&f);
    assert_eq!(
        f.client.try_add_reviewer(&id, &f.builder),
        Err(Ok(Error::BuilderCannotReview))
    );
    assert!(!f.client.can_decide(&id, &f.builder));
}

/// The obvious way to try to get paid without asking anyone: approve your own
/// milestone, then release it to yourself. Both halves are refused.
#[test]
fn test_a_builder_cannot_approve_and_pay_themselves() {
    let f = setup();
    let id = sponsor_only(&f);

    assert_eq!(
        f.client.try_approve(&f.builder, &id, &0),
        Err(Ok(Error::Unauthorized))
    );

    f.client.approve(&f.sponsor, &id, &0);
    assert_eq!(
        f.client.try_release(&f.builder, &id, &0),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(f.balance(&f.builder), 0);
}

// ------------------------------------------------------------- strangers

#[test]
fn test_a_stranger_decides_nothing() {
    let f = setup();
    let id = sponsor_only(&f);
    assert!(!f.client.can_decide(&id, &f.stranger));
    assert_eq!(
        f.client.try_approve(&f.stranger, &id, &0),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        f.client.try_hold(&f.stranger, &id, &0),
        Err(Ok(Error::Unauthorized))
    );
}

/// Authorised on one engagement is not authorised on another. The list is per
/// engagement, and a wallet trusted with one budget has no claim on the next.
#[test]
fn test_authority_does_not_leak_between_engagements() {
    let f = setup();
    f.env.mock_all_auths();

    let first = funded_engagement(&f);
    let none = Vec::new(&f.env);
    let second = f
        .client
        .create_engagement(&f.sponsor, &f.builder, &none, &three_milestones(&f));

    assert!(f.client.can_decide(&first, &f.reviewer));
    assert!(!f.client.can_decide(&second, &f.reviewer));
}

// --------------------------------------------------------- adding, removing

#[test]
fn test_an_added_wallet_can_decide_and_a_removed_one_cannot() {
    let f = setup();
    let id = sponsor_only(&f);
    let colleague = Address::generate(&f.env);

    assert!(!f.client.can_decide(&id, &colleague));
    f.client.add_reviewer(&id, &colleague);
    assert!(f.client.can_decide(&id, &colleague));

    f.client.remove_reviewer(&id, &colleague);
    assert!(!f.client.can_decide(&id, &colleague));
    assert_eq!(
        f.client.try_approve(&colleague, &id, &0),
        Err(Ok(Error::Unauthorized))
    );
}

/// Removing someone must not disturb anyone else's authority.
#[test]
fn test_removing_one_wallet_leaves_the_others_alone() {
    let f = setup();
    let id = sponsor_only(&f);
    let a = Address::generate(&f.env);
    let b = Address::generate(&f.env);

    f.client.add_reviewer(&id, &a);
    f.client.add_reviewer(&id, &b);
    f.client.remove_reviewer(&id, &a);

    assert!(!f.client.can_decide(&id, &a));
    assert!(f.client.can_decide(&id, &b));
    assert!(f.client.can_decide(&id, &f.sponsor));
}

#[test]
fn test_adding_the_same_wallet_twice_is_refused() {
    let f = setup();
    let id = sponsor_only(&f);
    let colleague = Address::generate(&f.env);

    f.client.add_reviewer(&id, &colleague);
    assert_eq!(
        f.client.try_add_reviewer(&id, &colleague),
        Err(Ok(Error::AlreadyReviewer))
    );
}

#[test]
fn test_removing_a_wallet_that_was_never_added_is_refused() {
    let f = setup();
    let id = sponsor_only(&f);
    assert_eq!(
        f.client.try_remove_reviewer(&id, &f.stranger),
        Err(Ok(Error::NotAReviewer))
    );
}

/// The sponsor's authority is not a list entry, so there is nothing to remove —
/// and an engagement nobody can decide would leave the builder waiting for a
/// deadline instead of an answer.
#[test]
fn test_the_sponsor_cannot_remove_their_own_authority() {
    let f = setup();
    let id = sponsor_only(&f);
    assert_eq!(
        f.client.try_remove_reviewer(&id, &f.sponsor),
        Err(Ok(Error::NotAReviewer))
    );
    assert!(f.client.can_decide(&id, &f.sponsor));
}

/// The list is walked on every decision and lives in one storage entry, so it
/// is bounded. Without a ceiling an engagement could be made progressively more
/// expensive to act on, and eventually impossible.
#[test]
fn test_the_authorised_list_is_bounded() {
    let f = setup();
    let id = sponsor_only(&f);

    for _ in 0..MAX_REVIEWERS {
        f.client.add_reviewer(&id, &Address::generate(&f.env));
    }
    assert_eq!(
        f.client.try_add_reviewer(&id, &Address::generate(&f.env)),
        Err(Ok(Error::TooManyReviewers))
    );
}

// ------------------------------------------------ only the sponsor may add

/// An authorised wallet can decide payouts. It cannot hand that authority to
/// anyone else — otherwise one added wallet could quietly widen the circle
/// beyond what the sponsor agreed to.
#[test]
fn test_an_authorised_wallet_cannot_authorise_others() {
    let f = setup();
    f.env.mock_all_auths();
    let id = funded_engagement(&f);

    /* `add_reviewer` requires the sponsor's own signature. With auths no longer
    mocked, a call the sponsor did not sign cannot go through. */
    f.env.set_auths(&[]);
    assert!(f.client.try_add_reviewer(&id, &f.stranger).is_err());
    assert!(!f.client.can_decide(&id, &f.stranger));
}

#[test]
fn test_a_stranger_cannot_authorise_themselves() {
    let f = setup();
    f.env.mock_all_auths();
    let id = funded_engagement(&f);

    f.env.set_auths(&[]);
    assert!(f.client.try_add_reviewer(&id, &f.stranger).is_err());
    assert!(f.client.try_remove_reviewer(&id, &f.reviewer).is_err());
}

// ------------------------------------------------------------ the money

/// The point of all of it: an authorised colleague can actually pay the
/// builder, and the amount that moves is the milestone's own.
#[test]
fn test_an_authorised_colleague_can_release_payment() {
    let f = setup();
    let id = sponsor_only(&f);
    let colleague = Address::generate(&f.env);
    f.client.add_reviewer(&id, &colleague);

    f.client.approve(&colleague, &id, &0);
    f.client.release(&colleague, &id, &0);
    assert_eq!(f.balance(&f.builder), 500 * UNIT);
}

/// Authority removed between approval and release stops the release. The
/// decision already recorded stands; acting on it still needs authority now.
#[test]
fn test_authority_is_checked_at_release_not_only_at_approval() {
    let f = setup();
    let id = sponsor_only(&f);
    let colleague = Address::generate(&f.env);

    f.client.add_reviewer(&id, &colleague);
    f.client.approve(&colleague, &id, &0);
    f.client.remove_reviewer(&id, &colleague);

    assert_eq!(
        f.client.try_release(&colleague, &id, &0),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(f.balance(&f.builder), 0);

    /* The sponsor can still finish what the colleague started. */
    f.client.release(&f.sponsor, &id, &0);
    assert_eq!(f.balance(&f.builder), 500 * UNIT);
}
