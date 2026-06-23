import { EscrowData, EscrowStatus, EventLog, Milestone } from "../types";

// Configuration
export const ESCROW_CONTRACT_ID = "C...";
export const ROUTER_CONTRACT_ID = "C...";
export const STELLAR_TESTNET_RPC = "https://soroban-testnet.stellar.org";

// --- MOCK STORAGE FALLBACK FOR WEB DEMO ---
// This ensures that the user can immediately demo the entire lifecycle (milestones, router splits, refund, dispute)
// even without Freighter or Stellar testnet config, while maintaining a real-looking on-chain UX.

const INITIAL_ESCROWS: EscrowData[] = [
  {
    id: 1,
    buyer: "GBUYER...123456",
    seller: "GSELLER...ABCDEF",
    token: "USDC (mock)",
    amount: "5000",
    deadline: Math.floor(Date.now() / 1000) + 86400 * 3, // 3 days from now
    status: EscrowStatus.Active,
    milestones: [
      { amount: "2000", released: true, description: "UI Mockup Designs" },
      { amount: "3000", released: false, description: "Backend API Integration" }
    ],
    releasedAmount: "2000",
    router: ROUTER_CONTRACT_ID,
    affiliate: "GAFFILIATE...789012",
    affiliateBps: 500, // 5%
  },
  {
    id: 2,
    buyer: "GDEMO...BUYER",
    seller: "GDEMO...SELLER",
    token: "USDC (mock)",
    amount: "10000",
    deadline: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    status: EscrowStatus.Active,
    milestones: [
      { amount: "5000", released: false, description: "Smart Contracts" },
      { amount: "5000", released: false, description: "Frontend Integration" }
    ],
    releasedAmount: "0",
    router: ROUTER_CONTRACT_ID,
    affiliate: undefined,
    affiliateBps: 0,
  }
];

const INITIAL_EVENTS: EventLog[] = [
  {
    id: "evt_1",
    type: "created",
    timestamp: Date.now() - 3600000 * 2,
    txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    details: "Escrow #1 created by buyer GBUYER...123456 with amount 5000 USDC"
  },
  {
    id: "evt_2",
    type: "deposit",
    timestamp: Date.now() - 3600000 * 1.9,
    txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    details: "Buyer GBUYER...123456 deposited 5000 USDC into Escrow #1"
  },
  {
    id: "evt_3",
    type: "released",
    timestamp: Date.now() - 3600000 * 0.5,
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    details: "Milestone 'UI Mockup Designs' (2000 USDC) released for Escrow #1"
  },
  {
    id: "evt_4",
    type: "routed",
    timestamp: Date.now() - 3600000 * 0.5,
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    details: "Router split 2000 USDC: 1850 USDC to Seller, 50 USDC (2.5%) to Platform, 100 USDC (5%) to Affiliate"
  }
];

// Initialize local storage if empty
if (!localStorage.getItem("trustroute_escrows")) {
  localStorage.setItem("trustroute_escrows", JSON.stringify(INITIAL_ESCROWS));
}
if (!localStorage.getItem("trustroute_events")) {
  localStorage.setItem("trustroute_events", JSON.stringify(INITIAL_EVENTS));
}
if (!localStorage.getItem("trustroute_balances")) {
  localStorage.setItem("trustroute_balances", JSON.stringify({
    buyer: 25000,
    seller: 1850,
    platform: 50,
    affiliate: 100,
  }));
}

export const getEscrows = (): EscrowData[] => {
  return JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
};

export const getEvents = (): EventLog[] => {
  return JSON.parse(localStorage.getItem("trustroute_events") || "[]");
};

export const getBalances = (): Record<string, number> => {
  return JSON.parse(localStorage.getItem("trustroute_balances") || "{}");
};

const updateBalances = (updater: (prev: Record<string, number>) => Record<string, number>) => {
  const prev = getBalances();
  const next = updater(prev);
  localStorage.setItem("trustroute_balances", JSON.stringify(next));
};

export const createEscrowMock = (
  buyer: string,
  seller: string,
  amount: string,
  deadlineDays: number,
  milestones: { amount: string; description: string }[],
  affiliate?: string,
  affiliateBps: number = 0
): EscrowData => {
  const escrows = getEscrows();
  const nextId = escrows.length > 0 ? Math.max(...escrows.map(e => e.id)) + 1 : 1;
  
  let parsedMilestones: Milestone[] = milestones.map(m => ({
    amount: m.amount,
    released: false,
    description: m.description,
  }));

  if (parsedMilestones.length === 0) {
    parsedMilestones = [{
      amount: amount,
      released: false,
      description: "Default Release Payout",
    }];
  }

  const newEscrow: EscrowData = {
    id: nextId,
    buyer,
    seller,
    token: "USDC (mock)",
    amount,
    deadline: Math.floor(Date.now() / 1000) + 86400 * deadlineDays,
    status: EscrowStatus.Pending,
    milestones: parsedMilestones,
    releasedAmount: "0",
    router: ROUTER_CONTRACT_ID,
    affiliate,
    affiliateBps,
  };

  escrows.push(newEscrow);
  localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

  // Add event
  const events = getEvents();
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  events.unshift({
    id: `evt_${Date.now()}`,
    type: "created",
    timestamp: Date.now(),
    txHash,
    details: `Escrow #${nextId} created by buyer ${buyer.slice(0, 8)}... with amount ${amount} USDC`
  });
  localStorage.setItem("trustroute_events", JSON.stringify(events));

  return newEscrow;
};

export const depositMock = (id: number): boolean => {
  const escrows = getEscrows();
  const idx = escrows.findIndex(e => e.id === id);
  if (idx === -1) return false;

  const escrow = escrows[idx];
  if (escrow.status !== EscrowStatus.Pending) return false;

  escrow.status = EscrowStatus.Active;
  escrows[idx] = escrow;
  localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

  // Deduct from buyer
  const numAmt = parseFloat(escrow.amount);
  updateBalances(prev => ({
    ...prev,
    buyer: prev.buyer - numAmt,
  }));

  // Add event
  const events = getEvents();
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  events.unshift({
    id: `evt_${Date.now()}`,
    type: "deposit",
    timestamp: Date.now(),
    txHash,
    details: `Buyer ${escrow.buyer.slice(0, 8)}... deposited ${escrow.amount} USDC into Escrow #${id}`
  });
  localStorage.setItem("trustroute_events", JSON.stringify(events));

  return true;
};

export const releaseMilestoneMock = (escrowId: number, milestoneIdx: number): boolean => {
  const escrows = getEscrows();
  const idx = escrows.findIndex(e => e.id === escrowId);
  if (idx === -1) return false;

  const escrow = escrows[idx];
  if (escrow.status !== EscrowStatus.Active && escrow.status !== EscrowStatus.Disputed) return false;
  if (milestoneIdx >= escrow.milestones.length) return false;

  const milestone = escrow.milestones[milestoneIdx];
  if (milestone.released) return false;

  milestone.released = true;
  const releasedVal = parseFloat(milestone.amount);
  const prevReleased = parseFloat(escrow.releasedAmount);
  const nextReleased = prevReleased + releasedVal;
  escrow.releasedAmount = nextReleased.toString();

  if (nextReleased >= parseFloat(escrow.amount)) {
    escrow.status = EscrowStatus.Released;
  }

  escrows[idx] = escrow;
  localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

  // Router Splitting Mathematics Simulation:
  // Platform Fee = 2.5% (250 BPS)
  // Affiliate Fee = escrow.affiliateBps / 10000
  const platformFee = (releasedVal * 250) / 10000;
  const affiliateFee = escrow.affiliate ? (releasedVal * escrow.affiliateBps) / 10000 : 0;
  const sellerAmount = releasedVal - platformFee - affiliateFee;

  updateBalances(prev => ({
    ...prev,
    platform: prev.platform + platformFee,
    affiliate: prev.affiliate + affiliateFee,
    seller: prev.seller + sellerAmount,
  }));

  // Add Events
  const events = getEvents();
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  
  events.unshift({
    id: `evt_rel_${Date.now()}`,
    type: "released",
    timestamp: Date.now(),
    txHash,
    details: `Milestone '${milestone.description}' (${milestone.amount} USDC) released for Escrow #${escrowId}`
  });

  events.unshift({
    id: `evt_route_${Date.now()}`,
    type: "routed",
    timestamp: Date.now(),
    txHash,
    details: `Router split ${milestone.amount} USDC: ${sellerAmount.toFixed(2)} USDC to Seller, ${platformFee.toFixed(2)} USDC (2.5%) to Platform${affiliateFee > 0 ? `, ${affiliateFee.toFixed(2)} USDC (${escrow.affiliateBps / 100}%) to Affiliate` : ""}`
  });

  localStorage.setItem("trustroute_events", JSON.stringify(events));
  return true;
};

export const requestRefundMock = (id: number): boolean => {
  const escrows = getEscrows();
  const idx = escrows.findIndex(e => e.id === id);
  if (idx === -1) return false;

  const escrow = escrows[idx];
  if (escrow.status !== EscrowStatus.Active) return false;

  // Verify deadline has passed
  if (Math.floor(Date.now() / 1000) < escrow.deadline) {
    alert("Deadline has not passed yet!");
    return false;
  }

  const remaining = parseFloat(escrow.amount) - parseFloat(escrow.releasedAmount);
  if (remaining <= 0) return false;

  escrow.status = EscrowStatus.Refunded;
  escrows[idx] = escrow;
  localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

  // Refund to buyer
  updateBalances(prev => ({
    ...prev,
    buyer: prev.buyer + remaining,
  }));

  // Add Event
  const events = getEvents();
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  events.unshift({
    id: `evt_ref_${Date.now()}`,
    type: "refund",
    timestamp: Date.now(),
    txHash,
    details: `Buyer claimed refund of ${remaining} USDC from Escrow #${id} after deadline`
  });
  localStorage.setItem("trustroute_events", JSON.stringify(events));

  return true;
};

export const disputeMock = (id: number, caller: string): boolean => {
  const escrows = getEscrows();
  const idx = escrows.findIndex(e => e.id === id);
  if (idx === -1) return false;

  const escrow = escrows[idx];
  if (escrow.status !== EscrowStatus.Active) return false;

  escrow.status = EscrowStatus.Disputed;
  escrows[idx] = escrow;
  localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

  // Add Event
  const events = getEvents();
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  events.unshift({
    id: `evt_disp_${Date.now()}`,
    type: "disputed",
    timestamp: Date.now(),
    txHash,
    details: `Dispute raised on Escrow #${id} by ${caller.slice(0, 8)}...`
  });
  localStorage.setItem("trustroute_events", JSON.stringify(events));

  return true;
};

export const resolveDisputeMock = (id: number, favorSeller: boolean): boolean => {
  const escrows = getEscrows();
  const idx = escrows.findIndex(e => e.id === id);
  if (idx === -1) return false;

  const escrow = escrows[idx];
  if (escrow.status !== EscrowStatus.Disputed) return false;

  const remaining = parseFloat(escrow.amount) - parseFloat(escrow.releasedAmount);

  if (favorSeller) {
    escrow.status = EscrowStatus.Released;
    escrow.releasedAmount = escrow.amount;

    // Split remaining via router
    const platformFee = (remaining * 250) / 10000;
    const affiliateFee = escrow.affiliate ? (remaining * escrow.affiliateBps) / 10000 : 0;
    const sellerAmount = remaining - platformFee - affiliateFee;

    updateBalances(prev => ({
      ...prev,
      platform: prev.platform + platformFee,
      affiliate: prev.affiliate + affiliateFee,
      seller: prev.seller + sellerAmount,
    }));
  } else {
    escrow.status = EscrowStatus.Refunded;

    // Refund remaining to buyer
    updateBalances(prev => ({
      ...prev,
      buyer: prev.buyer + remaining,
    }));
  }

  escrows[idx] = escrow;
  localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

  // Add Event
  const events = getEvents();
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  events.unshift({
    id: `evt_resol_${Date.now()}`,
    type: "resolved",
    timestamp: Date.now(),
    txHash,
    details: `Dispute on Escrow #${id} resolved by Admin. Outcome: ${favorSeller ? "Favor Seller (routed to seller/router)" : "Favor Buyer (refunded to buyer)"}`
  });
  localStorage.setItem("trustroute_events", JSON.stringify(events));

  return true;
};
