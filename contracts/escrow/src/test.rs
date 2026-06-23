#![cfg(test)]
use super::*;
use crate::types::EscrowStatus;
use soroban_sdk::{testutils::{Address as _, Ledger, LedgerInfo}, token, Address, Env, Vec};
use trustroute_router::RouterContract;

#[test]
fn test_escrow_milestone_releases() {
    let env = Env::default();
    env.mock_all_auths();

    // Register Escrow
    let escrow_id_contract = env.register_contract(None, EscrowContract);
    let escrow_client = EscrowContractClient::new(&env, &escrow_id_contract);

    // Register Router
    let router_id_contract = env.register_contract(None, RouterContract);
    let router_client = trustroute_router::RouterContractClient::new(&env, &router_id_contract);

    // Set up accounts
    let admin = Address::generate(&env);
    let platform_recipient = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let affiliate = Address::generate(&env);

    // Initialize Escrow and Router
    escrow_client.initialize(&admin);
    router_client.initialize(&admin, &platform_recipient, &250); // 2.5% platform fee

    // Register a mock token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token_client = token::StellarAssetClient::new(&env, &token_id);
    let token_token_client = token::Client::new(&env, &token_id);

    // Set up milestones
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 4000,
        released: false,
        description: symbol_short!("phase1"),
    });
    milestones.push_back(Milestone {
        amount: 6000,
        released: false,
        description: symbol_short!("phase2"),
    });

    // Create escrow (total amount = 10000)
    let escrow_idx = escrow_client.create_escrow(
        &buyer,
        &seller,
        &token_id,
        &10000,
        &1700000000, // deadline timestamp
        &milestones,
        &router_id_contract,
        &Some(affiliate.clone()),
        &500, // 5% affiliate BPS
    );

    assert_eq!(escrow_idx, 1);

    // Mint tokens to buyer and deposit
    token_client.mint(&buyer, &10000);
    escrow_client.deposit(&escrow_idx);

    // Verify deposit status and escrow contract holds the tokens
    let escrow_data = escrow_client.get_escrow(&escrow_idx);
    assert_eq!(escrow_data.status, EscrowStatus::Active);
    assert_eq!(token_token_client.balance(&escrow_id_contract), 10000);

    // Release Milestone 1 (4000 tokens)
    escrow_client.release_milestone(&escrow_idx, &0);

    // Check balances after Milestone 1 release
    // Milestone amount: 4000
    // Platform fee: 4000 * 2.5% = 100 tokens
    // Affiliate fee: 4000 * 5% = 200 tokens
    // Seller payout: 4000 - 100 - 200 = 3700 tokens
    assert_eq!(token_token_client.balance(&platform_recipient), 100);
    assert_eq!(token_token_client.balance(&affiliate), 200);
    assert_eq!(token_token_client.balance(&seller), 3700);
    assert_eq!(token_token_client.balance(&escrow_id_contract), 6000); // 6000 left for Phase 2

    // Release Milestone 2 (6000 tokens)
    escrow_client.release_milestone(&escrow_idx, &1);

    // Check balances after Milestone 2 release
    // Cumulative platform fee: 100 + (6000 * 2.5% = 150) = 250
    // Cumulative affiliate fee: 200 + (6000 * 5% = 300) = 500
    // Cumulative seller payout: 3700 + (6000 - 150 - 300 = 5550) = 9250
    assert_eq!(token_token_client.balance(&platform_recipient), 250);
    assert_eq!(token_token_client.balance(&affiliate), 500);
    assert_eq!(token_token_client.balance(&seller), 9250);
    assert_eq!(token_token_client.balance(&escrow_id_contract), 0);

    // Check escrow status is now Released
    let updated_escrow = escrow_client.get_escrow(&escrow_idx);
    assert_eq!(updated_escrow.status, EscrowStatus::Released);
}

#[test]
fn test_escrow_refund_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();

    // Register Escrow
    let escrow_id_contract = env.register_contract(None, EscrowContract);
    let escrow_client = EscrowContractClient::new(&env, &escrow_id_contract);

    // Register Router (needed for initialization parameters)
    let router_id_contract = env.register_contract(None, RouterContract);

    // Set up accounts
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);

    // Initialize Escrow
    escrow_client.initialize(&admin);

    // Register a mock token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token_client = token::StellarAssetClient::new(&env, &token_id);
    let token_token_client = token::Client::new(&env, &token_id);

    // Create escrow with 1000 deadline
    let escrow_idx = escrow_client.create_escrow(
        &buyer,
        &seller,
        &token_id,
        &5000,
        &1000,
        &Vec::new(&env),
        &router_id_contract,
        &None,
        &0,
    );

    // Deposit
    token_client.mint(&buyer, &5000);
    escrow_client.deposit(&escrow_idx);

    // Try refunding before deadline - should panic
    env.ledger().set(LedgerInfo {
        timestamp: 500, // before 1000
        protocol_version: 22,
        sequence_number: 1,
        network_id: [0; 32],
        base_reserve: 0,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 1000,
    });

    let res = escrow_client.try_request_refund(&escrow_idx);
    assert!(res.is_err());

    // Advance ledger timestamp beyond deadline
    env.ledger().set(LedgerInfo {
        timestamp: 1001, // after 1000
        protocol_version: 22,
        sequence_number: 2,
        network_id: [0; 32],
        base_reserve: 0,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 1000,
    });

    // Refund should work
    escrow_client.request_refund(&escrow_idx);

    // Check balances
    assert_eq!(token_token_client.balance(&buyer), 5000);
    assert_eq!(token_token_client.balance(&escrow_id_contract), 0);

    let updated_escrow = escrow_client.get_escrow(&escrow_idx);
    assert_eq!(updated_escrow.status, EscrowStatus::Refunded);
}

#[test]
fn test_escrow_dispute_resolution() {
    let env = Env::default();
    env.mock_all_auths();

    // Register Escrow
    let escrow_id_contract = env.register_contract(None, EscrowContract);
    let escrow_client = EscrowContractClient::new(&env, &escrow_id_contract);

    // Register Router
    let router_id_contract = env.register_contract(None, RouterContract);
    let router_client = trustroute_router::RouterContractClient::new(&env, &router_id_contract);

    // Set up accounts
    let admin = Address::generate(&env);
    let platform_recipient = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);

    // Initialize Escrow and Router
    escrow_client.initialize(&admin);
    router_client.initialize(&admin, &platform_recipient, &500); // 5% fee

    // Register a mock token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token_client = token::StellarAssetClient::new(&env, &token_id);
    let token_token_client = token::Client::new(&env, &token_id);

    // Create escrow (total amount = 10000)
    let escrow_idx = escrow_client.create_escrow(
        &buyer,
        &seller,
        &token_id,
        &10000,
        &2000,
        &Vec::new(&env),
        &router_id_contract,
        &None,
        &0,
    );

    token_client.mint(&buyer, &10000);
    escrow_client.deposit(&escrow_idx);

    // Dispute raised by seller
    escrow_client.dispute(&escrow_idx, &seller);
    let escrow_data = escrow_client.get_escrow(&escrow_idx);
    assert_eq!(escrow_data.status, EscrowStatus::Disputed);

    // Resolve favor seller
    escrow_client.resolve_dispute(&escrow_idx, &true);

    // Check balances
    // 5% of 10000 goes to platform, 95% goes to seller
    assert_eq!(token_token_client.balance(&platform_recipient), 500);
    assert_eq!(token_token_client.balance(&seller), 9500);
    assert_eq!(token_token_client.balance(&escrow_id_contract), 0);

    let updated_escrow = escrow_client.get_escrow(&escrow_idx);
    assert_eq!(updated_escrow.status, EscrowStatus::Released);
}
