use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

/// Hard ceiling from the SOW: an engagement supports at most three milestones.
pub const MAX_MILESTONES: u32 = 3;

/// How many extra wallets the sponsor may authorise to decide payouts.
///
/// Bounded because the list is walked on every decision and stored in one
/// entry: unbounded growth would make an engagement progressively more
/// expensive to act on, and eventually impossible.
pub const MAX_REVIEWERS: u32 = 10;

/// Lifecycle of a single milestone.
///
/// Every transition out of this enum requires a signature from a specific human
/// role. There is no transition that any automated party — including the
/// advisory review module — can trigger on its own.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MilestoneStatus {
    /// Funded and waiting on the builder.
    Pending = 0,
    /// Builder submitted evidence; waiting on the reviewer.
    EvidenceSubmitted = 1,
    /// Reviewer approved. Funds are still in escrow until `release`.
    Approved = 2,
    /// Reviewer asked for revision. Builder may resubmit.
    Held = 3,
    /// Terminal. USDC has moved to the builder.
    Released = 4,
    /// Terminal. USDC has moved back to the sponsor after the deadline.
    Refunded = 5,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EngagementStatus {
    /// Created but not yet funded. No milestone work may start.
    Draft = 0,
    /// Escrow holds the full milestone total.
    Funded = 1,
    /// Every milestone reached a terminal state.
    Closed = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Milestone {
    pub title: String,
    /// sha256 of the canonical off-chain acceptance-criteria document.
    /// The criteria text itself lives off-chain; this makes that record
    /// tamper-evident without paying to store prose on ledger.
    pub criteria_hash: BytesN<32>,
    pub amount: i128,
    /// Ledger timestamp after which the sponsor may reclaim this milestone.
    pub deadline: u64,
    pub status: MilestoneStatus,
    /// sha256 of the canonical off-chain evidence bundle, set on submission.
    pub evidence_hash: Option<BytesN<32>>,
    /// Optional public pointer to that bundle.
    pub evidence_uri: Option<String>,
    pub submitted_at: u64,
    pub decided_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Engagement {
    pub id: u64,
    pub sponsor: Address,
    pub builder: Address,
    /// Extra wallets the sponsor authorised to decide payouts.
    ///
    /// The sponsor always has that authority — they defined the milestones and
    /// they funded them, so they are the one person who must be able to look at
    /// the work and pay for it. This list is who else may, and the sponsor can
    /// change it at any time.
    ///
    /// The builder can never appear here. That is the one collision that would
    /// be a hole rather than an inconvenience: a builder who could approve
    /// would sign off their own work and release their own payment.
    pub reviewers: Vec<Address>,
    /// SAC address of the settlement asset (testnet USDC).
    pub token: Address,
    pub total_amount: i128,
    pub status: EngagementStatus,
    pub created_at: u64,
    pub milestones: Vec<Milestone>,
}

/// Input shape for milestone definition at creation time.
#[contracttype]
#[derive(Clone)]
pub struct MilestoneInput {
    pub title: String,
    pub criteria_hash: BytesN<32>,
    pub amount: i128,
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set once at deploy: which SAC this contract settles in.
    Config,
    /// Monotonic engagement id source.
    Counter,
    Engagement(u64),
}
