#![no_std]
use soroban_sdk::{
    contract, contractimpl, symbol_short, token, Address, Env, IntoVal, Symbol, Vec, Val
};

pub mod types;
use crate::types::{EscrowData, EscrowStatus, Milestone};

mod test;

const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const COUNTER_KEY: Symbol = symbol_short!("COUNTER");
const ESCROW_PREFIX: Symbol = symbol_short!("escrow");

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the Escrow contract with an admin (arbiter) address
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("already initialized");
        }
        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&COUNTER_KEY, &0u64);
    }

    /// Create a new escrow agreement
    pub fn create_escrow(
        env: Env,
        buyer: Address,
        seller: Address,
        token: Address,
        amount: i128,
        deadline: u64,
        milestones: Vec<Milestone>,
        router: Address,
        affiliate: Option<Address>,
        affiliate_bps: u32,
    ) -> u64 {
        buyer.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Validate milestone sum matches the total amount
        let mut total_milestone_amount = 0i128;
        for i in 0..milestones.len() {
            let milestone = milestones.get(i).unwrap();
            if milestone.amount <= 0 {
                panic!("milestone amount must be positive");
            }
            total_milestone_amount += milestone.amount;
        }

        if milestones.len() > 0 && total_milestone_amount != amount {
            panic!("sum of milestone amounts must match total amount");
        }

        // If no milestones are provided, create one default milestone for the whole amount
        let mut final_milestones = milestones;
        if final_milestones.len() == 0 {
            final_milestones.push_back(Milestone {
                amount,
                released: false,
                description: symbol_short!("default"),
            });
        }

        let mut counter: u64 = env.storage().instance().get(&COUNTER_KEY).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&COUNTER_KEY, &counter);

        let escrow_data = EscrowData {
            buyer: buyer.clone(),
            seller: seller.clone(),
            token: token.clone(),
            amount,
            deadline,
            status: EscrowStatus::Pending,
            milestones: final_milestones,
            released_amount: 0,
            router,
            affiliate,
            affiliate_bps,
        };

        env.storage().persistent().set(&(ESCROW_PREFIX, counter), &escrow_data);

        env.events().publish(
            (symbol_short!("created"), counter, buyer, seller),
            amount,
        );

        counter
    }

    /// Deposit funds into the escrow agreement (called by buyer)
    pub fn deposit(env: Env, escrow_id: u64) {
        let mut escrow = Self::get_escrow(env.clone(), escrow_id);
        escrow.buyer.require_auth();

        if escrow.status != EscrowStatus::Pending {
            panic!("escrow is not pending");
        }

        // Transfer funds from buyer to this contract
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&escrow.buyer, &env.current_contract_address(), &escrow.amount);

        escrow.status = EscrowStatus::Active;
        env.storage().persistent().set(&(ESCROW_PREFIX, escrow_id), &escrow);

        env.events().publish(
            (symbol_short!("deposit"), escrow_id, escrow.buyer.clone()),
            escrow.amount,
        );
    }

    /// Release a specific milestone of the escrow (called by buyer)
    pub fn release_milestone(env: Env, escrow_id: u64, milestone_idx: u32) {
        let mut escrow = Self::get_escrow(env.clone(), escrow_id);
        escrow.buyer.require_auth();

        if escrow.status != EscrowStatus::Active && escrow.status != EscrowStatus::Disputed {
            panic!("escrow is not active or disputed");
        }

        if milestone_idx >= escrow.milestones.len() {
            panic!("invalid milestone index");
        }

        let mut milestone = escrow.milestones.get(milestone_idx).unwrap();
        if milestone.released {
            panic!("milestone already released");
        }

        milestone.released = true;
        escrow.milestones.set(milestone_idx, milestone.clone());
        escrow.released_amount += milestone.amount;

        if escrow.released_amount == escrow.amount {
            escrow.status = EscrowStatus::Released;
        }

        env.storage().persistent().set(&(ESCROW_PREFIX, escrow_id), &escrow);

        // Perform cross-contract call to the router
        // First transfer the milestone amount from Escrow contract to Router contract
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.router, &milestone.amount);

        // Call the router
        let args: Vec<Val> = (
            escrow.token.clone(),
            milestone.amount,
            escrow.seller.clone(),
            escrow.affiliate.clone(),
            escrow.affiliate_bps,
        )
            .into_val(&env);
        env.invoke_contract::<()>(&escrow.router, &Symbol::new(&env, "route"), args);

        env.events().publish(
            (symbol_short!("rel_ms"), escrow_id, milestone_idx),
            milestone.amount,
        );
    }

    /// Claim refund after the deadline has passed (called by buyer)
    pub fn request_refund(env: Env, escrow_id: u64) {
        let mut escrow = Self::get_escrow(env.clone(), escrow_id);
        escrow.buyer.require_auth();

        if escrow.status != EscrowStatus::Active {
            panic!("escrow is not active");
        }

        if env.ledger().timestamp() < escrow.deadline {
            panic!("deadline has not passed");
        }

        let remaining_amount = escrow.amount - escrow.released_amount;
        if remaining_amount <= 0 {
            panic!("no funds remaining");
        }

        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&(ESCROW_PREFIX, escrow_id), &escrow);

        // Transfer remaining funds back to buyer
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.buyer, &remaining_amount);

        env.events().publish(
            (symbol_short!("refund"), escrow_id, escrow.buyer.clone()),
            remaining_amount,
        );
    }

    /// Raise a dispute (updated version with caller param)
    pub fn dispute(env: Env, escrow_id: u64, caller: Address) {
        caller.require_auth();
        let mut escrow = Self::get_escrow(env.clone(), escrow_id);
        
        if caller != escrow.buyer && caller != escrow.seller {
            panic!("unauthorized caller");
        }

        if escrow.status != EscrowStatus::Active {
            panic!("escrow is not active");
        }

        escrow.status = EscrowStatus::Disputed;
        env.storage().persistent().set(&(ESCROW_PREFIX, escrow_id), &escrow);

        env.events().publish(
            (symbol_short!("disputed"), escrow_id, caller),
            escrow.amount - escrow.released_amount,
        );
    }

    /// Resolve a dispute (called by admin)
    pub fn resolve_dispute(env: Env, escrow_id: u64, favor_seller: bool) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN_KEY)
            .expect("not initialized");
        admin.require_auth();

        let mut escrow = Self::get_escrow(env.clone(), escrow_id);
        if escrow.status != EscrowStatus::Disputed {
            panic!("escrow is not in dispute");
        }

        let remaining_amount = escrow.amount - escrow.released_amount;
        if remaining_amount <= 0 {
            panic!("no funds remaining");
        }

        if favor_seller {
            escrow.status = EscrowStatus::Released;
            escrow.released_amount = escrow.amount;
            env.storage().persistent().set(&(ESCROW_PREFIX, escrow_id), &escrow);

            // Transfer to router and route
            let token_client = token::Client::new(&env, &escrow.token);
            token_client.transfer(&env.current_contract_address(), &escrow.router, &remaining_amount);

            let args: Vec<Val> = (
                escrow.token.clone(),
                remaining_amount,
                escrow.seller.clone(),
                escrow.affiliate.clone(),
                escrow.affiliate_bps,
            )
                .into_val(&env);
            env.invoke_contract::<()>(&escrow.router, &Symbol::new(&env, "route"), args);
        } else {
            escrow.status = EscrowStatus::Refunded;
            env.storage().persistent().set(&(ESCROW_PREFIX, escrow_id), &escrow);

            // Refund to buyer
            let token_client = token::Client::new(&env, &escrow.token);
            token_client.transfer(&env.current_contract_address(), &escrow.buyer, &remaining_amount);
        }

        env.events().publish(
            (symbol_short!("resolved"), escrow_id, admin),
            if favor_seller { 1u32 } else { 0u32 },
        );
    }

    /// Fetch escrow agreement details
    pub fn get_escrow(env: Env, escrow_id: u64) -> EscrowData {
        env.storage()
            .persistent()
            .get(&(ESCROW_PREFIX, escrow_id))
            .expect("escrow not found")
    }

    /// Get admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&ADMIN_KEY)
            .expect("not initialized")
    }
}
