#![no_std]
//! # SprintOS Settlement
//!
//! Milestone escrow for grant, bounty and contributor work on Stellar.
//!
//! A sponsor funds up to three milestones with a SEP-41 asset (testnet USDC via
//! the Stellar Asset Contract). A builder submits evidence. An assigned human
//! reviewer approves or holds, and releases payment.
//!
//! ## The one guarantee this contract exists to make
//!
//! SprintOS ships an AI module that scores submitted evidence. That module
//! **cannot move funds**, and the reason is structural rather than procedural:
//!
//! - No function in this interface accepts a score, a recommendation, or any
//!   other advisory input. Search this file for "score" — there is nothing.
//! - `release`, `claim`, and `refund` are the only functions that move value,
//!   and each is gated by `require_auth` on a specific human role recorded at
//!   creation time.
//! - There is no admin, no owner, no pause, no upgrade path, and no
//!   `set_status` escape hatch. Nothing here can be talked into paying out.
//!
//! The advisory report is not an input to this contract. It never touches the
//! ledger. See `test_ai_score_100_cannot_release`.

mod errors;
mod events;
mod types;

#[cfg(test)]
mod test;

pub use errors::Error;
pub use types::{
    DataKey, Engagement, EngagementStatus, Milestone, MilestoneInput, MilestoneStatus,
    MAX_MILESTONES,
};

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, String, Vec};

const DAY_IN_LEDGERS: u32 = 17_280;
/// Engagements outlive a 30-day sprint with room to spare.
const BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;
const MAX_TITLE_BYTES: u32 = 200;
const MAX_EVIDENCE_URI_BYTES: u32 = 2_048;

#[contract]
pub struct SettlementContract;

#[contractimpl]
impl SettlementContract {
    // ---------------------------------------------------------------- setup

    /// Pin the settlement asset once, at deploy time.
    ///
    /// Deliberately not re-callable: if the token could be swapped later, an
    /// engagement funded in USDC could be released in something worthless.
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Config, &token);
        env.storage().instance().set(&DataKey::Counter, &0u64);
    }

    /// The SEP-41 asset every engagement settles in.
    pub fn token(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    // ----------------------------------------------------------- engagement

    /// Define an engagement and its milestones. Does not move funds — see `fund`.
    ///
    /// Requires the sponsor's signature.
    pub fn create_engagement(
        env: Env,
        sponsor: Address,
        builder: Address,
        reviewer: Address,
        milestones: Vec<MilestoneInput>,
    ) -> Result<u64, Error> {
        sponsor.require_auth();

        if sponsor == builder || sponsor == reviewer || builder == reviewer {
            return Err(Error::DuplicateRole);
        }

        let count = milestones.len();
        if count == 0 {
            return Err(Error::NoMilestones);
        }
        if count > MAX_MILESTONES {
            return Err(Error::TooManyMilestones);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)?;

        let now = env.ledger().timestamp();
        let mut total: i128 = 0;
        let mut built: Vec<Milestone> = Vec::new(&env);

        for input in milestones.iter() {
            if input.title.is_empty() || input.title.len() > MAX_TITLE_BYTES {
                return Err(Error::InvalidTitle);
            }
            if input.amount <= 0 {
                return Err(Error::InvalidAmount);
            }
            if input.deadline <= now {
                return Err(Error::InvalidDeadline);
            }
            total = total
                .checked_add(input.amount)
                .ok_or(Error::ArithmeticOverflow)?;
            built.push_back(Milestone {
                title: input.title,
                criteria_hash: input.criteria_hash,
                amount: input.amount,
                deadline: input.deadline,
                status: MilestoneStatus::Pending,
                evidence_hash: None,
                evidence_uri: None,
                submitted_at: 0,
                decided_at: 0,
            });
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0u64);
        let next = id.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
        env.storage().instance().set(&DataKey::Counter, &next);

        let engagement = Engagement {
            id,
            sponsor: sponsor.clone(),
            builder: builder.clone(),
            reviewer: reviewer.clone(),
            token,
            total_amount: total,
            status: EngagementStatus::Draft,
            created_at: now,
            milestones: built,
        };

        Self::save(&env, &engagement);
        events::engagement_created(&env, id, &sponsor, &builder, &reviewer, total);
        Ok(id)
    }

    /// Move the full milestone total into escrow.
    ///
    /// All-or-nothing on purpose: partial funding would let a sponsor advertise
    /// three milestones while only backing one, which is exactly the ambiguity
    /// SprintOS exists to remove.
    pub fn fund(env: Env, engagement_id: u64) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        e.sponsor.require_auth();

        if e.status != EngagementStatus::Draft {
            return Err(Error::AlreadyFunded);
        }

        token::TokenClient::new(&env, &e.token).transfer(
            &e.sponsor,
            env.current_contract_address(),
            &e.total_amount,
        );

        e.status = EngagementStatus::Funded;
        let amount = e.total_amount;
        let sponsor = e.sponsor.clone();
        Self::save(&env, &e);
        events::funded(&env, engagement_id, &sponsor, amount);
        Ok(())
    }

    // ------------------------------------------------------------- builder

    /// Attach an evidence bundle to a milestone.
    ///
    /// Legal from `Pending` (first submission) and from `Held` (revision after
    /// the reviewer asked for changes).
    pub fn submit_evidence(
        env: Env,
        engagement_id: u64,
        milestone_idx: u32,
        evidence_hash: BytesN<32>,
        evidence_uri: String,
    ) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        e.builder.require_auth();

        if evidence_uri.is_empty() || evidence_uri.len() > MAX_EVIDENCE_URI_BYTES {
            return Err(Error::InvalidEvidenceUri);
        }

        if e.status != EngagementStatus::Funded {
            return Err(Error::NotFunded);
        }

        let mut m = Self::milestone(&e, milestone_idx)?;
        match m.status {
            MilestoneStatus::Pending | MilestoneStatus::Held => {}
            MilestoneStatus::Released => return Err(Error::AlreadyReleased),
            _ => return Err(Error::InvalidState),
        }

        m.status = MilestoneStatus::EvidenceSubmitted;
        m.evidence_hash = Some(evidence_hash);
        m.evidence_uri = Some(evidence_uri);
        m.submitted_at = env.ledger().timestamp();

        e.milestones.set(milestone_idx, m);
        let builder = e.builder.clone();
        Self::save(&env, &e);
        events::evidence_submitted(&env, engagement_id, milestone_idx, &builder);
        Ok(())
    }

    // ------------------------------------------------------------ reviewer

    /// Record the reviewer's decision that the milestone is met.
    ///
    /// Approving does not pay. `release` is a separate signature so that the
    /// judgement and the money movement are two distinct, auditable acts.
    pub fn approve(env: Env, engagement_id: u64, milestone_idx: u32) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        e.reviewer.require_auth();

        let mut m = Self::milestone(&e, milestone_idx)?;
        if m.status != MilestoneStatus::EvidenceSubmitted {
            return Err(Error::InvalidState);
        }

        m.status = MilestoneStatus::Approved;
        m.decided_at = env.ledger().timestamp();
        e.milestones.set(milestone_idx, m);

        let reviewer = e.reviewer.clone();
        Self::save(&env, &e);
        events::approved(&env, engagement_id, milestone_idx, &reviewer);
        Ok(())
    }

    /// Send the milestone back for revision. The builder may resubmit.
    pub fn hold(env: Env, engagement_id: u64, milestone_idx: u32) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        e.reviewer.require_auth();

        let mut m = Self::milestone(&e, milestone_idx)?;
        if m.status != MilestoneStatus::EvidenceSubmitted {
            return Err(Error::InvalidState);
        }

        m.status = MilestoneStatus::Held;
        m.decided_at = env.ledger().timestamp();
        e.milestones.set(milestone_idx, m);

        let reviewer = e.reviewer.clone();
        Self::save(&env, &e);
        events::held(&env, engagement_id, milestone_idx, &reviewer);
        Ok(())
    }

    /// Pay an approved milestone out to the builder.
    ///
    /// The reviewer-controlled payout path. Requires the reviewer's signature
    /// and an `Approved` status — no score or recommendation can reach this
    /// line. After that human approval, `claim` is the builder's recovery path.
    pub fn release(env: Env, engagement_id: u64, milestone_idx: u32) -> Result<(), Error> {
        let e = Self::load(&env, engagement_id)?;
        e.reviewer.require_auth();
        Self::pay_approved(&env, engagement_id, milestone_idx, e)
    }

    /// Let the builder recover an already-approved payment if the reviewer
    /// cannot return for the second signature. The binding human judgement has
    /// already happened in `approve`; this path cannot approve work.
    pub fn claim(env: Env, engagement_id: u64, milestone_idx: u32) -> Result<(), Error> {
        let e = Self::load(&env, engagement_id)?;
        e.builder.require_auth();
        Self::pay_approved(&env, engagement_id, milestone_idx, e)
    }

    fn pay_approved(
        env: &Env,
        engagement_id: u64,
        milestone_idx: u32,
        mut e: Engagement,
    ) -> Result<(), Error> {
        let mut m = Self::milestone(&e, milestone_idx)?;
        if m.status == MilestoneStatus::Released {
            return Err(Error::AlreadyReleased);
        }
        if m.status != MilestoneStatus::Approved {
            return Err(Error::InvalidState);
        }

        token::TokenClient::new(env, &e.token).transfer(
            &env.current_contract_address(),
            &e.builder,
            &m.amount,
        );

        m.status = MilestoneStatus::Released;
        let amount = m.amount;
        e.milestones.set(milestone_idx, m);

        let builder = e.builder.clone();
        Self::save(env, &e);
        events::released(env, engagement_id, milestone_idx, &builder, amount);
        Self::close_if_settled(env, engagement_id)?;
        Ok(())
    }

    // ------------------------------------------------------------- sponsor

    /// Reclaim a milestone the builder did not deliver in time.
    ///
    /// Only after the deadline, and never once the reviewer has approved — an
    /// approved milestone is owed to the builder regardless of the clock.
    pub fn refund(env: Env, engagement_id: u64, milestone_idx: u32) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        e.sponsor.require_auth();

        if e.status != EngagementStatus::Funded {
            return Err(Error::NotFunded);
        }

        let mut m = Self::milestone(&e, milestone_idx)?;
        match m.status {
            MilestoneStatus::Pending
            | MilestoneStatus::EvidenceSubmitted
            | MilestoneStatus::Held => {}
            MilestoneStatus::Released => return Err(Error::AlreadyReleased),
            _ => return Err(Error::InvalidState),
        }

        if env.ledger().timestamp() <= m.deadline {
            return Err(Error::DeadlineNotReached);
        }

        token::TokenClient::new(&env, &e.token).transfer(
            &env.current_contract_address(),
            &e.sponsor,
            &m.amount,
        );

        m.status = MilestoneStatus::Refunded;
        let amount = m.amount;
        e.milestones.set(milestone_idx, m);

        let sponsor = e.sponsor.clone();
        Self::save(&env, &e);
        events::refunded(&env, engagement_id, milestone_idx, &sponsor, amount);
        Self::close_if_settled(&env, engagement_id)?;
        Ok(())
    }

    // ---------------------------------------------------------------- views

    pub fn get_engagement(env: Env, engagement_id: u64) -> Result<Engagement, Error> {
        Self::load(&env, engagement_id)
    }

    pub fn get_milestone(
        env: Env,
        engagement_id: u64,
        milestone_idx: u32,
    ) -> Result<Milestone, Error> {
        let e = Self::load(&env, engagement_id)?;
        Self::milestone(&e, milestone_idx)
    }

    /// Value still held in escrow for this engagement.
    pub fn get_balance(env: Env, engagement_id: u64) -> Result<i128, Error> {
        let e = Self::load(&env, engagement_id)?;
        if e.status == EngagementStatus::Draft {
            return Ok(0);
        }
        let mut locked: i128 = 0;
        for m in e.milestones.iter() {
            match m.status {
                MilestoneStatus::Released | MilestoneStatus::Refunded => {}
                _ => locked += m.amount,
            }
        }
        Ok(locked)
    }

    pub fn engagement_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0u64)
    }

    // -------------------------------------------------------------- helpers

    fn load(env: &Env, id: u64) -> Result<Engagement, Error> {
        let key = DataKey::Engagement(id);
        let e: Engagement = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::EngagementNotFound)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
        Ok(e)
    }

    fn save(env: &Env, e: &Engagement) {
        let key = DataKey::Engagement(e.id);
        env.storage().persistent().set(&key, e);
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }

    fn milestone(e: &Engagement, idx: u32) -> Result<Milestone, Error> {
        e.milestones.get(idx).ok_or(Error::MilestoneNotFound)
    }

    /// Mark the engagement closed once no milestone can move again.
    fn close_if_settled(env: &Env, id: u64) -> Result<(), Error> {
        let mut e = Self::load(env, id)?;
        let settled = e.milestones.iter().all(|m| {
            matches!(
                m.status,
                MilestoneStatus::Released | MilestoneStatus::Refunded
            )
        });
        if settled && e.status != EngagementStatus::Closed {
            e.status = EngagementStatus::Closed;
            Self::save(env, &e);
            events::closed(env, id);
        }
        Ok(())
    }
}
