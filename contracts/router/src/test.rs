#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env};

#[test]
fn test_router_fee_splitting() {
    let env = Env::default();
    env.mock_all_auths();

    // Register Router
    let router_id = env.register_contract(None, RouterContract);
    let router_client = RouterContractClient::new(&env, &router_id);

    // Set up accounts
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let seller = Address::generate(&env);
    let affiliate = Address::generate(&env);

    // Initialize Router
    router_client.initialize(&admin, &recipient, &250); // 2.5% fee

    // Register a mock token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token_client = token::StellarAssetClient::new(&env, &token_id);
    let token_token_client = token::Client::new(&env, &token_id);

    // Mint tokens to router (simulating escrow transfer)
    token_client.mint(&router_id, &10000);

    // Route payment with affiliate (5% fee)
    router_client.route(&token_id, &10000, &seller, &Some(affiliate.clone()), &500);

    // Check balances
    // Total: 10000
    // Platform fee: 10000 * 250 / 10000 = 250
    // Affiliate fee: 10000 * 500 / 10000 = 500
    // Seller payout: 10000 - 250 - 500 = 9250
    assert_eq!(token_token_client.balance(&recipient), 250);
    assert_eq!(token_token_client.balance(&affiliate), 500);
    assert_eq!(token_token_client.balance(&seller), 9250);
    assert_eq!(token_token_client.balance(&router_id), 0);
}

#[test]
fn test_router_no_affiliate() {
    let env = Env::default();
    env.mock_all_auths();

    // Register Router
    let router_id = env.register_contract(None, RouterContract);
    let router_client = RouterContractClient::new(&env, &router_id);

    // Set up accounts
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let seller = Address::generate(&env);

    // Initialize Router
    router_client.initialize(&admin, &recipient, &200); // 2% fee

    // Register a mock token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token_client = token::StellarAssetClient::new(&env, &token_id);
    let token_token_client = token::Client::new(&env, &token_id);

    // Mint tokens to router (simulating escrow transfer)
    token_client.mint(&router_id, &10000);

    // Route payment without affiliate
    router_client.route(&token_id, &10000, &seller, &None, &0);

    // Check balances
    // Total: 10000
    // Platform fee: 10000 * 200 / 10000 = 200
    // Seller payout: 9800
    assert_eq!(token_token_client.balance(&recipient), 200);
    assert_eq!(token_token_client.balance(&seller), 9800);
    assert_eq!(token_token_client.balance(&router_id), 0);
}

#[test]
fn test_update_config() {
    let env = Env::default();
    env.mock_all_auths();

    // Register Router
    let router_id = env.register_contract(None, RouterContract);
    let router_client = RouterContractClient::new(&env, &router_id);

    // Set up accounts
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Initialize Router
    router_client.initialize(&admin, &recipient, &200);

    // Update fee and recipient
    router_client.update_fee(&500);
    let new_recipient = Address::generate(&env);
    router_client.update_recipient(&new_recipient);

    let config = router_client.get_config();
    assert_eq!(config.platform_fee_bps, 500);
    assert_eq!(config.platform_fee_recipient, new_recipient);
}
