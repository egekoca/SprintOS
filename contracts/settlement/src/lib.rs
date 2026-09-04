#![no_std]
//! # SprintOS Settlement
//!
//! Milestone escrow for grant, bounty and contributor work on Stellar.
//!
//! A sponsor funds up to three milestones with a SEP-41 asset (testnet USDC via
//! the Stellar Asset Contract). A builder submits evidence. An assigned human
//! reviewer approves or holds, and releases payment.
//!
//! ## Who may decide a payout
//!
//! The sponsor. They wrote the milestones and they funded them, so they are the
//! one person who must be able to look at the work and pay for it. An earlier
//! version refused an engagement whose sponsor and reviewer were the same
//! address, on the theory that separating them protected the builder. It did
//! not: the sponsor picks the reviewer, so a sponsor minded to withhold payment
//! simply nominated their own second wallet. The rule stopped the honest case
//! and inconvenienced nobody else.
//!
//! The sponsor may authorise further wallets with `add_reviewer`, and withdraw
//! that authority again. Any authorised wallet acts alone; a team that wants
//! "two of us must agree" gets it by making an authorised address a Stellar
//! multisig account, which this contract needs to know nothing about.
//!
//! One collision is still refused, at creation and on every later addition:
//! **the builder can never decide a payout.** That one is a hole rather than an
//! inconvenience — a builder who could approve would sign off their own work and
//! release their own payment.
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
    MAX_MILESTONES, MAX_REVIEWERS,
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
    /// `first_id` starts the engagement counter above whatever the previous
    /// deployment reached, so an id names exactly one engagement across both and
    /// a link written against the old contract never resolves to a new one.
    pub fn __constructor(env: Env, token: Address, first_id: u64) {
        env.storage().instance().set(&DataKey::Config, &token);
        env.storage().instance().set(&DataKey::Counter, &first_id);
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
    /// The sponsor signs, and by signing becomes the account that decides every
    /// payout. `reviewers` is who else may — it can be empty, and the sponsor can
    /// change it later with `add_reviewer` and `remove_reviewer`.
    pub fn create_engagement(
        env: Env,
        sponsor: Address,
        builder: Address,
        reviewers: Vec<Address>,
        milestones: Vec<MilestoneInput>,
    ) -> Result<u64, Error> {
        sponsor.require_auth();

        if sponsor == builder {
            return Err(Error::DuplicateRole);
        }
        if reviewers.len() > MAX_REVIEWERS {
            return Err(Error::TooManyReviewers);
        }
        for (i, who) in reviewers.iter().enumerate() {
            /* The one collision that is a hole rather than an inconvenience. */
            if who == builder {
                return Err(Error::BuilderCannotReview);
            }
            /* The sponsor already decides; listing them again would only make
            `remove_reviewer` look as though it could take that away. */
            if who == sponsor {
                return Err(Error::AlreadyReviewer);
            }
            for other in reviewers.iter().skip(i + 1) {
                if other == who {
                    return Err(Error::AlreadyReviewer);
                }
            }
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
            reviewers: reviewers.clone(),
            token,
            total_amount: total,
            status: EngagementStatus::Draft,
            created_at: now,
            milestones: built,
        };

        Self::save(&env, &engagement);
        events::engagement_created(&env, id, &sponsor, &builder, total);
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
    pub fn approve(
        env: Env,
        caller: Address,
        engagement_id: u64,
        milestone_idx: u32,
    ) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        /* Prove who is calling, then ask whether they may. Soroban has no way to
        require "one of these addresses", so the caller names themselves and
        the contract checks the claim against the engagement. */
        caller.require_auth();
        Self::require_reviewer(&e, &caller)?;

        let mut m = Self::milestone(&e, milestone_idx)?;
        if m.status != MilestoneStatus::EvidenceSubmitted {
            return Err(Error::InvalidState);
        }

        m.status = MilestoneStatus::Approved;
        m.decided_at = env.ledger().timestamp();
        e.milestones.set(milestone_idx, m);

        Self::save(&env, &e);
        events::approved(&env, engagement_id, milestone_idx, &caller);
        Ok(())
    }

    /// Send the milestone back for revision. The builder may resubmit.
    pub fn hold(
        env: Env,
        caller: Address,
        engagement_id: u64,
        milestone_idx: u32,
    ) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        caller.require_auth();
        Self::require_reviewer(&e, &caller)?;

        let mut m = Self::milestone(&e, milestone_idx)?;
        if m.status != MilestoneStatus::EvidenceSubmitted {
            return Err(Error::InvalidState);
        }

        m.status = MilestoneStatus::Held;
        m.decided_at = env.ledger().timestamp();
        e.milestones.set(milestone_idx, m);

        Self::save(&env, &e);
        events::held(&env, engagement_id, milestone_idx, &caller);
        Ok(())
    }

    /// Pay an approved milestone out to the builder.
    ///
    /// The reviewer-controlled payout path. Requires the reviewer's signature
    /// and an `Approved` status — no score or recommendation can reach this
    /// line. After that human approval, `claim` is the builder's recovery path.
    pub fn release(
        env: Env,
        caller: Address,
        engagement_id: u64,
        milestone_idx: u32,
    ) -> Result<(), Error> {
        let e = Self::load(&env, engagement_id)?;
        caller.require_auth();
        Self::require_reviewer(&e, &caller)?;
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

    // ------------------------------------------------------- authorisation

    /// Whether this address may approve, hold or release on this engagement.
    pub fn can_decide(env: Env, engagement_id: u64, who: Address) -> Result<bool, Error> {
        let e = Self::load(&env, engagement_id)?;
        Ok(Self::is_reviewer(&e, &who))
    }

    /// Authorise another wallet to decide payouts on this engagement.
    ///
    /// Only the sponsor may call this. The builder is refused however the call
    /// is dressed up: a builder who could approve would sign off their own work
    /// and release their own payment, and that is the one collision this
    /// contract will not allow at any point in an engagement's life.
    pub fn add_reviewer(env: Env, engagement_id: u64, who: Address) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        e.sponsor.require_auth();

        if who == e.builder {
            return Err(Error::BuilderCannotReview);
        }
        if Self::is_reviewer(&e, &who) {
            return Err(Error::AlreadyReviewer);
        }
        if e.reviewers.len() >= MAX_REVIEWERS {
            return Err(Error::TooManyReviewers);
        }

        e.reviewers.push_back(who.clone());
        let sponsor = e.sponsor.clone();
        Self::save(&env, &e);
        events::reviewer_added(&env, engagement_id, &sponsor, &who);
        Ok(())
    }

    /// Withdraw that authority again.
    ///
    /// The sponsor cannot remove themselves. Their authority comes from having
    /// funded the work rather than from a list entry, and an engagement nobody
    /// can decide would leave the builder waiting for a deadline instead of a
    /// decision.
    pub fn remove_reviewer(env: Env, engagement_id: u64, who: Address) -> Result<(), Error> {
        let mut e = Self::load(&env, engagement_id)?;
        e.sponsor.require_auth();

        let mut kept: Vec<Address> = Vec::new(&env);
        let mut found = false;
        for existing in e.reviewers.iter() {
            if existing == who {
                found = true;
            } else {
                kept.push_back(existing);
            }
        }
        if !found {
            return Err(Error::NotAReviewer);
        }

        e.reviewers = kept;
        let sponsor = e.sponsor.clone();
        Self::save(&env, &e);
        events::reviewer_removed(&env, engagement_id, &sponsor, &who);
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

    /// The sponsor always decides. Anyone they authorised decides too.
    fn is_reviewer(e: &Engagement, who: &Address) -> bool {
        if *who == e.sponsor {
            return true;
        }
        /* Defence in depth. The builder cannot get onto this list through
        `create_engagement` or `add_reviewer`, so this can only fire if one of
        those checks is ever weakened — which is exactly when it matters. */
        if *who == e.builder {
            return false;
        }
        e.reviewers.iter().any(|listed| listed == *who)
    }

    fn require_reviewer(e: &Engagement, who: &Address) -> Result<(), Error> {
        if Self::is_reviewer(e, who) {
            Ok(())
        } else {
            Err(Error::Unauthorized)
        }
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
