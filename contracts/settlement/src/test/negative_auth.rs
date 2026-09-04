//! Unauthorized calls.
//!
//! Each test presents a *real, valid* signature from the wrong role. That is
//! the interesting case: not "nobody signed", but "somebody signed, and it was
//! not the person this action belongs to".

use super::*;
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

/// 04 — the builder signs `approve`. Only the reviewer may.
#[test]
#[should_panic]
fn test_builder_cannot_approve() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));

    f.client
        .mock_auths(&[MockAuth {
            address: &f.builder,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "approve",
                args: (id, 0u32).into_val(&f.env),
                sub_invokes: &[],
            },
        }])
        .approve(&f.reviewer, &id, &0);
}

/// The sponsor cannot approve their own engagement's milestone either. Funding
/// the escrow does not make you the decision maker.
#[test]
#[should_panic]
fn test_sponsor_cannot_approve() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));

    f.client
        .mock_auths(&[MockAuth {
            address: &f.sponsor,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "approve",
                args: (id, 0u32).into_val(&f.env),
                sub_invokes: &[],
            },
        }])
        .approve(&f.reviewer, &id, &0);
}

/// 05 — an unrelated address signs `release`.
#[test]
#[should_panic]
fn test_stranger_cannot_release() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&f.reviewer, &id, &0);

    f.client
        .mock_auths(&[MockAuth {
            address: &f.stranger,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "release",
                args: (id, 0u32).into_val(&f.env),
                sub_invokes: &[],
            },
        }])
        .release(&f.reviewer, &id, &0);
}

/// The builder cannot pay themselves, even on an approved milestone.
#[test]
#[should_panic]
fn test_builder_cannot_release_to_self() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&f.reviewer, &id, &0);

    f.client
        .mock_auths(&[MockAuth {
            address: &f.builder,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "release",
                args: (id, 0u32).into_val(&f.env),
                sub_invokes: &[],
            },
        }])
        .release(&f.reviewer, &id, &0);
}

/// A stranger cannot submit evidence on the builder's behalf.
#[test]
#[should_panic]
fn test_stranger_cannot_submit_evidence() {
    let f = setup();
    let id = funded_engagement(&f);

    f.client
        .mock_auths(&[MockAuth {
            address: &f.stranger,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "submit_evidence",
                args: (id, 0u32, f.hash(11), f.uri("https://evil.example")).into_val(&f.env),
                sub_invokes: &[],
            },
        }])
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://evil.example"));
}

/// The reviewer decides, but the reviewer does not own the money. Reclaiming an
/// undelivered milestone belongs to the sponsor.
#[test]
#[should_panic]
fn test_reviewer_cannot_refund() {
    let f = setup();
    let id = funded_engagement(&f);
    f.warp(8 * DAY);

    f.client
        .mock_auths(&[MockAuth {
            address: &f.reviewer,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "refund",
                args: (id, 0u32).into_val(&f.env),
                sub_invokes: &[],
            },
        }])
        .refund(&id, &0);
}

/// With no signature at all, nothing moves.
#[test]
#[should_panic]
fn test_unsigned_release_rejected() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&f.reviewer, &id, &0);

    f.client.mock_auths(&[]).release(&f.reviewer, &id, &0);
}

/// Claim is a recovery path for the assigned builder, not a permissionless
/// payout trigger.
#[test]
#[should_panic]
fn test_stranger_cannot_claim() {
    let f = setup();
    let id = funded_engagement(&f);
    f.client
        .submit_evidence(&id, &0, &f.hash(11), &f.uri("https://example.com"));
    f.client.approve(&f.reviewer, &id, &0);

    f.client
        .mock_auths(&[MockAuth {
            address: &f.stranger,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "claim",
                args: (id, 0u32).into_val(&f.env),
                sub_invokes: &[],
            },
        }])
        .claim(&id, &0);
}
