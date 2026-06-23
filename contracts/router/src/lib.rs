#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Symbol};

pub mod types;
use crate::types::RouterConfig;

mod test;

const CONFIG_KEY: Symbol = symbol_short!("CONFIG");

#[contract]
pub struct RouterContract;

#[contractimpl]
impl RouterContract {
    /// Initialize the router with admin, platform fee recipient, and platform fee in basis points (BPS)
    pub fn initialize(
        env: Env,
        admin: Address,
        platform_fee_recipient: Address,
        platform_fee_bps: u32,
    ) {
        if env.storage().instance().has(&CONFIG_KEY) {
            panic!("already initialized");
        }
        if platform_fee_bps > 10000 {
            panic!("fee bps cannot exceed 10000");
        }

        let config = RouterConfig {
            admin,
            platform_fee_recipient,
            platform_fee_bps,
        };
        env.storage().instance().set(&CONFIG_KEY, &config);
    }

    /// Route a payment by splitting it into seller, platform fee, and affiliate payouts.
    /// Note: The escrow contract must have transferred `total_amount` of `token` to the Router contract
    /// before calling this function.
    pub fn route(
        env: Env,
        token: Address,
        total_amount: i128,
        seller: Address,
        affiliate: Option<Address>,
        affiliate_bps: u32,
    ) {
        let config: RouterConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if total_amount <= 0 {
            panic!("total amount must be positive");
        }
        if affiliate_bps > 10000 {
            panic!("affiliate bps cannot exceed 10000");
        }
        if config.platform_fee_bps + affiliate_bps > 10000 {
            panic!("total fee bps cannot exceed 10000");
        }

        // Calculations using i128 to prevent overflow
        let platform_fee = (total_amount * (config.platform_fee_bps as i128)) / 10000;
        
        let mut affiliate_fee = 0i128;
        if affiliate.is_some() && affiliate_bps > 0 {
            affiliate_fee = (total_amount * (affiliate_bps as i128)) / 10000;
        }

        let seller_amount = total_amount - platform_fee - affiliate_fee;
        if seller_amount < 0 {
            panic!("seller amount is negative");
        }

        let token_client = token::Client::new(&env, &token);
        let my_address = env.current_contract_address();

        // 1. Pay platform fee
        if platform_fee > 0 {
            token_client.transfer(&my_address, &config.platform_fee_recipient, &platform_fee);
            env.events().publish(
                (symbol_short!("fee_paid"), token.clone(), config.platform_fee_recipient.clone()),
                platform_fee,
            );
        }

        // 2. Pay affiliate fee
        if let Some(aff_addr) = affiliate {
            if affiliate_fee > 0 {
                token_client.transfer(&my_address, &aff_addr, &affiliate_fee);
                env.events().publish(
                    (symbol_short!("aff_paid"), token.clone(), aff_addr.clone()),
                    affiliate_fee,
                );
            }
        }

        // 3. Pay seller
        if seller_amount > 0 {
            token_client.transfer(&my_address, &seller, &seller_amount);
            env.events().publish(
                (symbol_short!("routed"), token.clone(), seller.clone()),
                seller_amount,
            );
        }
    }

    /// Update fee config (admin only)
    pub fn update_fee(env: Env, new_platform_fee_bps: u32) {
        let mut config: RouterConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        config.admin.require_auth();

        if new_platform_fee_bps > 10000 {
            panic!("fee bps cannot exceed 10000");
        }

        config.platform_fee_bps = new_platform_fee_bps;
        env.storage().instance().set(&CONFIG_KEY, &config);

        env.events().publish(
            (symbol_short!("fee_upd"), config.admin.clone()),
            new_platform_fee_bps,
        );
    }

    /// Update fee recipient (admin only)
    pub fn update_recipient(env: Env, new_recipient: Address) {
        let mut config: RouterConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        config.admin.require_auth();

        config.platform_fee_recipient = new_recipient.clone();
        env.storage().instance().set(&CONFIG_KEY, &config);

        env.events().publish(
            (symbol_short!("rcpt_upd"), config.admin.clone()),
            new_recipient,
        );
    }

    /// Get router config
    pub fn get_config(env: Env) -> RouterConfig {
        env.storage()
            .instance()
            .get(&CONFIG_KEY)
            .expect("not initialized")
    }
}
