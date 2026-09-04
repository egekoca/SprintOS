use soroban_sdk::contracterror;

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    EngagementNotFound = 3,
    MilestoneNotFound = 4,
    /// The caller is not the role this action requires.
    Unauthorized = 5,
    /// The milestone is not in a status from which this action is legal.
    InvalidState = 6,
    AlreadyReleased = 7,
    NotFunded = 8,
    AlreadyFunded = 9,
    /// Refund attempted before the milestone deadline.
    DeadlineNotReached = 10,
    InvalidAmount = 11,
    /// Sum of milestone amounts does not equal the declared total.
    AmountMismatch = 12,
    TooManyMilestones = 13,
    NoMilestones = 14,
    InvalidDeadline = 15,
    /// sponsor, builder and reviewer must be three distinct addresses.
    DuplicateRole = 16,
    ArithmeticOverflow = 17,
    InvalidTitle = 18,
    InvalidEvidenceUri = 19,
}
