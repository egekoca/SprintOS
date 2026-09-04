#![cfg(test)]
//! Test suite for the SprintOS settlement contract.
//!
//! The modules map to the scenarios the Statement of Work names explicitly:
//!
//! | module               | covers                                            |
//! |----------------------|---------------------------------------------------|
//! | `happy`              | successful transactions                           |
//! | `negative_auth`      | unauthorized calls                                |
//! | `negative_state`     | invalid states, duplicate release, wrong amounts   |
//! | `refund`             | deadline refunds, early refunds                    |
//! | `ai_cannot_release`  | a score of 100 cannot move funds                   |
//! | `authorisation`      | who may decide a payout, and who never may         |

mod ai_cannot_release;
mod authorisation;
mod happy;
mod negative_auth;
mod negative_state;
mod refund;

use crate::{MilestoneInput, SettlementContract, SettlementContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, BytesN, Env, String, Vec,
};

/// USDC carries 7 decimals on Stellar.
pub const UNIT: i128 = 10_000_000;
pub const DAY: u64 = 86_400;

pub struct Fixture<'a> {
    pub env: Env,
    pub contract_id: Address,
    pub client: SettlementContractClient<'a>,
    pub sponsor: Address,
    pub builder: Address,
    pub reviewer: Address,
    pub stranger: Address,
    pub token: Address,
    pub start: u64,
}

impl Fixture<'_> {
    /// Deterministic stand-in for the sha256 of an off-chain document.
    pub fn hash(&self, seed: u8) -> BytesN<32> {
        BytesN::from_array(&self.env, &[seed; 32])
    }

    /// Settlement-asset balance of an account.
    pub fn balance(&self, who: &Address) -> i128 {
        token::TokenClient::new(&self.env, &self.token).balance(who)
    }

    pub fn uri(&self, s: &str) -> String {
        String::from_str(&self.env, s)
    }

    /// Advance the ledger clock.
    pub fn warp(&self, seconds: u64) {
        self.env.ledger().with_mut(|li| li.timestamp += seconds);
    }
}

/// A funded engagement is the common starting point, so `setup` stops just
/// short of it and each test decides how far to go.
pub fn setup<'a>() -> Fixture<'a> {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);
    let start = env.ledger().timestamp();

    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token = sac.address();

    let sponsor = Address::generate(&env);
    let builder = Address::generate(&env);
    let reviewer = Address::generate(&env);
    let stranger = Address::generate(&env);

    let contract_id = env.register(SettlementContract, (token.clone(), 0u64));
    let client = SettlementContractClient::new(&env, &contract_id);

    // Fund the sponsor so it can actually escrow.
    env.mock_all_auths();
    token::StellarAssetClient::new(&env, &token).mint(&sponsor, &(10_000 * UNIT));

    Fixture {
        env,
        contract_id,
        client,
        sponsor,
        builder,
        reviewer,
        stranger,
        token: token.clone(),
        start,
    }
}

/// Three milestones: 500 / 300 / 200 USDC, due 7, 14 and 21 days out.
pub fn three_milestones(f: &Fixture) -> Vec<MilestoneInput> {
    let mut v = Vec::new(&f.env);
    v.push_back(MilestoneInput {
        title: f.uri("Soroban settlement contract"),
        criteria_hash: f.hash(1),
        amount: 500 * UNIT,
        deadline: f.start + 7 * DAY,
    });
    v.push_back(MilestoneInput {
        title: f.uri("Advisory review module"),
        criteria_hash: f.hash(2),
        amount: 300 * UNIT,
        deadline: f.start + 14 * DAY,
    });
    v.push_back(MilestoneInput {
        title: f.uri("Web MVP"),
        criteria_hash: f.hash(3),
        amount: 200 * UNIT,
        deadline: f.start + 21 * DAY,
    });
    v
}

pub const TOTAL: i128 = 1_000 * UNIT;

/// The engagement's extra authorised wallets — just the named reviewer.
///
/// The sponsor decides payouts whether or not this list is empty; most tests
/// use the separate reviewer so the two authorities can be told apart.
pub fn reviewers(f: &Fixture) -> Vec<Address> {
    let mut v = Vec::new(&f.env);
    v.push_back(f.reviewer.clone());
    v
}

/// create + fund, with all auths mocked. Returns the engagement id.
pub fn funded_engagement(f: &Fixture) -> u64 {
    f.env.mock_all_auths();
    let id =
        f.client
            .create_engagement(&f.sponsor, &f.builder, &reviewers(f), &three_milestones(f));
    f.client.fund(&id);
    id
}
