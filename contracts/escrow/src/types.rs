use soroban_sdk::{contracttype, Address, Symbol, Vec};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowStatus {
    Pending = 0,
    Active = 1,
    Released = 2,
    Refunded = 3,
    Disputed = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub amount: i128,
    pub released: bool,
    pub description: Symbol,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowData {
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
    pub status: EscrowStatus,
    pub milestones: Vec<Milestone>,
    pub released_amount: i128,
    pub router: Address,
    pub affiliate: Option<Address>,
    pub affiliate_bps: u32,
}
