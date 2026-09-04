//! Every state change emits a typed event.
//!
//! The web app builds its engagement timeline from these, and they double as
//! the audit trail a reviewer or an Ambassador can replay straight from the
//! ledger without trusting the application's own database.

use soroban_sdk::{contractevent, Address, Env};

/// An engagement was defined. No funds have moved yet.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngagementCreated {
    #[topic]
    pub engagement_id: u64,
    pub sponsor: Address,
    pub builder: Address,
    pub reviewer: Address,
    pub total_amount: i128,
}

/// The sponsor moved the full milestone total into escrow.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Funded {
    #[topic]
    pub engagement_id: u64,
    pub sponsor: Address,
    pub amount: i128,
}

/// The builder attached an evidence bundle to a milestone.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceSubmitted {
    #[topic]
    pub engagement_id: u64,
    #[topic]
    pub milestone_idx: u32,
    pub builder: Address,
}

/// The reviewer judged the milestone met. Funds have not moved.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approved {
    #[topic]
    pub engagement_id: u64,
    #[topic]
    pub milestone_idx: u32,
    pub reviewer: Address,
}

/// The reviewer sent the milestone back for revision.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Held {
    #[topic]
    pub engagement_id: u64,
    #[topic]
    pub milestone_idx: u32,
    pub reviewer: Address,
}

/// Payment reached the builder. Emitted only after a reviewer signature.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Released {
    #[topic]
    pub engagement_id: u64,
    #[topic]
    pub milestone_idx: u32,
    pub builder: Address,
    pub amount: i128,
}

/// The sponsor reclaimed an undelivered milestone after its deadline.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub engagement_id: u64,
    #[topic]
    pub milestone_idx: u32,
    pub sponsor: Address,
    pub amount: i128,
}

/// Every milestone reached a terminal state.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Closed {
    #[topic]
    pub engagement_id: u64,
}

// ------------------------------------------------------------------ helpers

pub fn engagement_created(
    env: &Env,
    engagement_id: u64,
    sponsor: &Address,
    builder: &Address,
    reviewer: &Address,
    total_amount: i128,
) {
    EngagementCreated {
        engagement_id,
        sponsor: sponsor.clone(),
        builder: builder.clone(),
        reviewer: reviewer.clone(),
        total_amount,
    }
    .publish(env);
}

pub fn funded(env: &Env, engagement_id: u64, sponsor: &Address, amount: i128) {
    Funded {
        engagement_id,
        sponsor: sponsor.clone(),
        amount,
    }
    .publish(env);
}

pub fn evidence_submitted(env: &Env, engagement_id: u64, milestone_idx: u32, builder: &Address) {
    EvidenceSubmitted {
        engagement_id,
        milestone_idx,
        builder: builder.clone(),
    }
    .publish(env);
}

pub fn approved(env: &Env, engagement_id: u64, milestone_idx: u32, reviewer: &Address) {
    Approved {
        engagement_id,
        milestone_idx,
        reviewer: reviewer.clone(),
    }
    .publish(env);
}

pub fn held(env: &Env, engagement_id: u64, milestone_idx: u32, reviewer: &Address) {
    Held {
        engagement_id,
        milestone_idx,
        reviewer: reviewer.clone(),
    }
    .publish(env);
}

pub fn released(
    env: &Env,
    engagement_id: u64,
    milestone_idx: u32,
    builder: &Address,
    amount: i128,
) {
    Released {
        engagement_id,
        milestone_idx,
        builder: builder.clone(),
        amount,
    }
    .publish(env);
}

pub fn refunded(
    env: &Env,
    engagement_id: u64,
    milestone_idx: u32,
    sponsor: &Address,
    amount: i128,
) {
    Refunded {
        engagement_id,
        milestone_idx,
        sponsor: sponsor.clone(),
        amount,
    }
    .publish(env);
}

pub fn closed(env: &Env, engagement_id: u64) {
    Closed { engagement_id }.publish(env);
}
