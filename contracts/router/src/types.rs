use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouterConfig {
    pub admin: Address,
    pub platform_fee_recipient: Address,
    pub platform_fee_bps: u32, // e.g., 250 for 2.5%
}
