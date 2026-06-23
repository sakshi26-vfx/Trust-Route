import { EscrowData, EscrowStatus, EventLog, Milestone } from "../types";
import { 
  rpc, 
  Contract, 
  Address, 
  nativeToScVal, 
  scValToNative, 
  TransactionBuilder, 
  Networks,
  Account,
  xdr
} from "@stellar/stellar-sdk";
import { signTx } from "./freighter";

// Configurations
export const STELLAR_TESTNET_RPC = "https://soroban-testnet.stellar.org";
export const NATIVE_TOKEN_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const getContractConfig = () => {
  const escrowId = localStorage.getItem("trustroute_escrow_id") || "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
  const routerId = localStorage.getItem("trustroute_router_id") || "CBH2W42YWRH4T727T4PZJTRQ4G3AZEZGB2RMQQVU2HHGCYSCW4QZ4L2";
  const mode = localStorage.getItem("trustroute_network_mode") || "simulation";
  return { escrowId, routerId, mode };
};

export const setContractConfig = (escrowId: string, routerId: string, mode: string) => {
  localStorage.setItem("trustroute_escrow_id", escrowId);
  localStorage.setItem("trustroute_router_id", routerId);
  localStorage.setItem("trustroute_network_mode", mode);
};

// --- MOCK STORAGE FALLBACK FOR WEB DEMO ---
const INITIAL_ESCROWS: EscrowData[] = [
  {
    id: 1,
    buyer: "GBUYER...123456",
    seller: "GSELLER...ABCDEF",
    token: "XLM (mock)",
    amount: "5000",
    deadline: Math.floor(Date.now() / 1000) + 86400 * 3,
    status: EscrowStatus.Active,
    milestones: [
      { amount: "2000", released: true, description: "UI Mockup Designs" },
      { amount: "3000", released: false, description: "Backend API Integration" }
    ],
    releasedAmount: "2000",
    router: "CBH2W42YWRH4T727T4PZJTRQ4G3AZEZGB2RMQQVU2HHGCYSCW4QZ4L2",
    affiliate: "GAFFILIATE...789012",
    affiliateBps: 500,
  },
  {
    id: 2,
    buyer: "GDEMO...BUYER",
    seller: "GDEMO...SELLER",
    token: "XLM (mock)",
    amount: "10000",
    deadline: Math.floor(Date.now() / 1000) - 3600,
    status: EscrowStatus.Active,
    milestones: [
      { amount: "5000", released: false, description: "Smart Contracts" },
      { amount: "5000", released: false, description: "Frontend Integration" }
    ],
    releasedAmount: "0",
    router: "CBH2W42YWRH4T727T4PZJTRQ4G3AZEZGB2RMQQVU2HHGCYSCW4QZ4L2",
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
    details: "Escrow #1 created by buyer GBUYER...123456 with amount 5000 XLM"
  },
  {
    id: "evt_2",
    type: "deposit",
    timestamp: Date.now() - 3600000 * 1.9,
    txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    details: "Buyer GBUYER...123456 deposited 5000 XLM into Escrow #1"
  },
  {
    id: "evt_3",
    type: "released",
    timestamp: Date.now() - 3600000 * 0.5,
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    details: "Milestone 'UI Mockup Designs' (2000 XLM) released for Escrow #1"
  },
  {
    id: "evt_4",
    type: "routed",
    timestamp: Date.now() - 3600000 * 0.5,
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    details: "Router split 2000 XLM: 1850 XLM to Seller, 50 XLM (2.5%) to Platform, 100 XLM (5%) to Affiliate"
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

const updateBalances = (updater: (prev: Record<string, number>) => Record<string, number>) => {
  const prev = JSON.parse(localStorage.getItem("trustroute_balances") || "{}");
  const next = updater(prev);
  localStorage.setItem("trustroute_balances", JSON.stringify(next));
};

// --- ON-CHAIN UTILITIES ---

const mapOnChainEscrowToUi = (id: number, val: any): EscrowData => {
  const amount = (Number(val.amount) / 10000000).toString();
  const releasedAmount = (Number(val.released_amount || val.releasedAmount || 0) / 10000000).toString();
  
  const milestones = (val.milestones || []).map((ms: any) => ({
    amount: (Number(ms.amount) / 10000000).toString(),
    released: ms.released,
    description: typeof ms.description === "string" ? ms.description : String(ms.description),
  }));
  
  return {
    id,
    buyer: val.buyer.toString(),
    seller: val.seller.toString(),
    token: val.token.toString(),
    amount,
    deadline: Number(val.deadline),
    status: Number(val.status),
    milestones,
    releasedAmount,
    router: val.router.toString(),
    affiliate: val.affiliate ? val.affiliate.toString() : undefined,
    affiliateBps: Number(val.affiliate_bps || val.affiliateBps || 0),
  };
};

export const fetchEscrowOnChain = async (id: number, escrowContractId: string): Promise<EscrowData | null> => {
  const server = new rpc.Server(STELLAR_TESTNET_RPC);
  const contract = new Contract(escrowContractId);
  const tx = new TransactionBuilder(
    new Account("GCQ3MZTETR2XO3Z4OHTCJWRHD4BDNWS2U27QS65KRUSY4U4QLIVAGMWC", "0"),
    { fee: "100", networkPassphrase: Networks.TESTNET }
  )
    .addOperation(contract.call("get_escrow", nativeToScVal(BigInt(id), { type: "u64" })))
    .setTimeout(0)
    .build();
  
  try {
    const sim = await server.simulateTransaction(tx);
    const simAny = sim as any;
    if (simAny.error || !rpc.Api.isSimulationSuccess(sim)) {
      return null;
    }
    const nativeVal = scValToNative(simAny.result.retval);
    return mapOnChainEscrowToUi(id, nativeVal);
  } catch (err) {
    return null;
  }
};

const submitSorobanTransaction = async (
  senderAddress: string,
  contractId: string,
  functionName: string,
  args: any[],
  setStatusText?: (text: string) => void
): Promise<string> => {
  const server = new rpc.Server(STELLAR_TESTNET_RPC);
  
  if (setStatusText) setStatusText("Querying source account from network...");
  const sourceAccount = await server.getAccount(senderAddress);
  
  if (setStatusText) setStatusText("Building transaction call...");
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(120)
    .build();

  if (setStatusText) setStatusText("Simulating transaction on-chain...");
  const sim = await server.simulateTransaction(tx);
  const simAny = sim as any;
  if (simAny.error || !rpc.Api.isSimulationSuccess(sim)) {
    const errText = simAny.error ? JSON.stringify(simAny.error) : "Simulation failed (check inputs or allowance)";
    throw new Error(`Simulation failed: ${errText}`);
  }

  if (setStatusText) setStatusText("Assembling resource footprint...");
  const assembledTxBuilder = rpc.assembleTransaction(tx, sim);
  const assembledTx = assembledTxBuilder.build();

  if (setStatusText) setStatusText("Awaiting Freighter Wallet approval...");
  const signedXdr = await signTx(assembledTx.toXDR(), "TESTNET");
  if (!signedXdr) {
    throw new Error("Transaction signing rejected or failed.");
  }

  if (setStatusText) setStatusText("Submitting signed XDR to Stellar RPC...");
  const response = await server.sendTransaction(
    TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
  );
  if (response.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${JSON.stringify(response.errorResult)}`);
  }

  let status: string = response.status;
  
  if (setStatusText) setStatusText("Waiting for Stellar ledger confirmation...");
  while (status === "PENDING") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const txResult = await server.getTransaction(response.hash);
    status = txResult.status as string;
    if (status === "SUCCESS") {
      return response.hash;
    }
    if (status === "FAILED") {
      throw new Error(`Transaction execution failed: ${JSON.stringify(txResult)}`);
    }
  }

  return response.hash;
};

// --- CLIENT EXPORTS ---

export const getEscrows = async (): Promise<EscrowData[]> => {
  const { mode, escrowId } = getContractConfig();
  if (mode === "simulation") {
    return JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
  }

  const promises = [];
  // Probe escrow IDs 1 to 20 parallelly
  for (let i = 1; i <= 20; i++) {
    promises.push(fetchEscrowOnChain(i, escrowId));
  }
  const results = await Promise.all(promises);
  return results.filter((e): e is EscrowData => e !== null);
};

export const getEvents = async (): Promise<EventLog[]> => {
  const { mode, escrowId } = getContractConfig();
  if (mode === "simulation") {
    return JSON.parse(localStorage.getItem("trustroute_events") || "[]");
  }

  const server = new rpc.Server(STELLAR_TESTNET_RPC);
  try {
    const latestLedgerRes = await server.getLatestLedger();
    const latestLedger = latestLedgerRes.sequence;
    const startLedger = Math.max(1, latestLedger - 10000); // Poll last ~10000 ledgers

    const response = await server.getEvents({
      startLedger,
      filters: [
        {
          type: "contract",
          contractIds: [escrowId]
        }
      ],
      limit: 50
    });

    return (response.events || []).map((evt: any) => {
      const topics = evt.topic.map((t: any) => scValToNative(t));
      const value = scValToNative(evt.value);
      const typeTopic = topics[0];
      
      let details = `Event ${typeTopic} detected on contract`;
      let type: EventLog["type"] = "created";

      if (typeTopic === "created") {
        type = "created";
        details = `Escrow #${topics[1]} created by buyer ${topics[2]} with amount ${(Number(value) / 10000000).toFixed(2)} XLM`;
      } else if (typeTopic === "deposit") {
        type = "deposit";
        details = `Buyer ${topics[2]} deposited ${(Number(value) / 10000000).toFixed(2)} XLM into Escrow #${topics[1]}`;
      } else if (typeTopic === "rel_ms") {
        type = "released";
        details = `Milestone #${Number(topics[2]) + 1} released for Escrow #${topics[1]} with amount ${(Number(value) / 10000000).toFixed(2)} XLM`;
      } else if (typeTopic === "refund") {
        type = "refund";
        details = `Buyer claimed refund of ${(Number(value) / 10000000).toFixed(2)} XLM from Escrow #${topics[1]}`;
      } else if (typeTopic === "disputed") {
        type = "disputed";
        details = `Dispute raised on Escrow #${topics[1]} by ${topics[2]}`;
      } else if (typeTopic === "resolved") {
        type = "resolved";
        details = `Dispute on Escrow #${topics[1]} resolved by Admin. Outcome: ${value === 1 ? "Favor Seller" : "Favor Buyer"}`;
      }

      return {
        id: evt.id,
        type,
        timestamp: new Date(evt.ledgerClosedAt || Date.now()).getTime(),
        txHash: evt.txHash,
        details
      };
    });
  } catch (err) {
    console.error("Failed to query on-chain events:", err);
    return [];
  }
};

export const getBalances = async (walletAddress?: string | null): Promise<Record<string, number>> => {
  const { mode, escrowId } = getContractConfig();
  if (mode === "simulation") {
    return JSON.parse(localStorage.getItem("trustroute_balances") || "{}");
  }

  const res: Record<string, number> = {
    buyer: 0,
    platform: 0,
    affiliate: 0,
  };

  if (!walletAddress) return res;

  const server = new rpc.Server(STELLAR_TESTNET_RPC);
  const tokenContract = new Contract(NATIVE_TOKEN_CONTRACT);

  // 1. Fetch connected wallet XLM balance
  try {
    const tx = new TransactionBuilder(
      new Account(walletAddress, "0"),
      { fee: "100", networkPassphrase: Networks.TESTNET }
    )
      .addOperation(tokenContract.call("balance", nativeToScVal(Address.fromString(walletAddress))))
      .setTimeout(0)
      .build();
    const sim = await server.simulateTransaction(tx);
    const simAny = sim as any;
    if (!simAny.error && rpc.Api.isSimulationSuccess(sim)) {
      res.buyer = Number(scValToNative(simAny.result.retval)) / 10000000;
    }
  } catch (err) {
    console.error("Failed to fetch wallet balance:", err);
  }

  // 2. Fetch Escrow Contract XLM balance
  try {
    const tx = new TransactionBuilder(
      new Account(walletAddress, "0"),
      { fee: "100", networkPassphrase: Networks.TESTNET }
    )
      .addOperation(tokenContract.call("balance", nativeToScVal(Address.fromString(escrowId))))
      .setTimeout(0)
      .build();
    const sim = await server.simulateTransaction(tx);
    const simAny = sim as any;
    if (!simAny.error && rpc.Api.isSimulationSuccess(sim)) {
      res.platform = Number(scValToNative(simAny.result.retval)) / 10000000;
    }
  } catch (err) {
    console.error("Failed to fetch contract balance:", err);
  }

  return res;
};

export const createEscrow = async (
  buyer: string,
  seller: string,
  amount: string,
  deadlineDays: number,
  milestones: { amount: string; description: string }[],
  affiliate?: string,
  affiliateBps: number = 0,
  setStatusText?: (text: string) => void
): Promise<string | null> => {
  const { mode, escrowId, routerId } = getContractConfig();

  if (mode === "simulation") {
    const escrows = JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
    const nextId = escrows.length > 0 ? Math.max(...escrows.map((e: any) => e.id)) + 1 : 1;
    
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
      token: "XLM (mock)",
      amount,
      deadline: Math.floor(Date.now() / 1000) + 86400 * deadlineDays,
      status: EscrowStatus.Pending,
      milestones: parsedMilestones,
      releasedAmount: "0",
      router: routerId,
      affiliate,
      affiliateBps,
    };

    escrows.push(newEscrow);
    localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

    const events = JSON.parse(localStorage.getItem("trustroute_events") || "[]");
    const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    events.unshift({
      id: `evt_${Date.now()}`,
      type: "created",
      timestamp: Date.now(),
      txHash,
      details: `Escrow #${nextId} created by buyer ${buyer.slice(0, 8)}... with amount ${amount} XLM`
    });
    localStorage.setItem("trustroute_events", JSON.stringify(events));

    return txHash;
  }

  // --- ON-CHAIN EXECUTION ---
  const numericAmount = BigInt(Math.round(parseFloat(amount) * 10000000));
  const deadlineUnix = BigInt(Math.floor(Date.now() / 1000) + deadlineDays * 86400);

  // Map milestones array into ScVal Vec
  const scMilestonesArray = milestones.map(m => {
    return xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("amount"),
        val: nativeToScVal(BigInt(Math.round(parseFloat(m.amount) * 10000000)), { type: "i128" })
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("description"),
        val: xdr.ScVal.scvSymbol(m.description.slice(0, 32))
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("released"),
        val: xdr.ScVal.scvBool(false)
      })
    ]);
  });
  const scMilestones = xdr.ScVal.scvVec(scMilestonesArray);

  const affiliateScVal = affiliate ? nativeToScVal(Address.fromString(affiliate)) : nativeToScVal(null);

  const args = [
    nativeToScVal(Address.fromString(buyer)),
    nativeToScVal(Address.fromString(seller)),
    nativeToScVal(Address.fromString(NATIVE_TOKEN_CONTRACT)),
    nativeToScVal(numericAmount, { type: "i128" }),
    nativeToScVal(deadlineUnix, { type: "u64" }),
    scMilestones,
    nativeToScVal(Address.fromString(routerId)),
    affiliateScVal,
    nativeToScVal(affiliateBps, { type: "u32" }),
  ];

  try {
    return await submitSorobanTransaction(buyer, escrowId, "create_escrow", args, setStatusText);
  } catch (err: any) {
    alert(`Transaction Failed: ${err.message}`);
    return null;
  }
};

export const deposit = async (
  id: number,
  callerAddress: string,
  setStatusText?: (text: string) => void
): Promise<boolean> => {
  const { mode, escrowId } = getContractConfig();

  if (mode === "simulation") {
    const escrows = JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
    const idx = escrows.findIndex((e: any) => e.id === id);
    if (idx === -1) return false;

    const escrow = escrows[idx];
    if (escrow.status !== EscrowStatus.Pending) return false;

    escrow.status = EscrowStatus.Active;
    escrows[idx] = escrow;
    localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

    const numAmt = parseFloat(escrow.amount);
    updateBalances(prev => ({
      ...prev,
      buyer: prev.buyer - numAmt,
    }));

    const events = JSON.parse(localStorage.getItem("trustroute_events") || "[]");
    const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    events.unshift({
      id: `evt_${Date.now()}`,
      type: "deposit",
      timestamp: Date.now(),
      txHash,
      details: `Buyer ${escrow.buyer.slice(0, 8)}... deposited ${escrow.amount} XLM into Escrow #${id}`
    });
    localStorage.setItem("trustroute_events", JSON.stringify(events));

    return true;
  }

  // --- ON-CHAIN EXECUTION ---
  const args = [nativeToScVal(BigInt(id), { type: "u64" })];
  try {
    await submitSorobanTransaction(callerAddress, escrowId, "deposit", args, setStatusText);
    return true;
  } catch (err: any) {
    alert(`Transaction Failed: ${err.message}`);
    return false;
  }
};

export const releaseMilestone = async (
  escrowId: number,
  milestoneIdx: number,
  callerAddress: string,
  setStatusText?: (text: string) => void
): Promise<boolean> => {
  const { mode, escrowId: escrowContractId } = getContractConfig();

  if (mode === "simulation") {
    const escrows = JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
    const idx = escrows.findIndex((e: any) => e.id === escrowId);
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

    const platformFee = (releasedVal * 250) / 10000;
    const affiliateFee = escrow.affiliate ? (releasedVal * escrow.affiliateBps) / 10000 : 0;
    const sellerAmount = releasedVal - platformFee - affiliateFee;

    updateBalances(prev => ({
      ...prev,
      platform: prev.platform + platformFee,
      affiliate: prev.affiliate + affiliateFee,
      seller: prev.seller + sellerAmount,
    }));

    const events = JSON.parse(localStorage.getItem("trustroute_events") || "[]");
    const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    
    events.unshift({
      id: `evt_rel_${Date.now()}`,
      type: "released",
      timestamp: Date.now(),
      txHash,
      details: `Milestone '${milestone.description}' (${milestone.amount} XLM) released for Escrow #${escrowId}`
    });

    events.unshift({
      id: `evt_route_${Date.now()}`,
      type: "routed",
      timestamp: Date.now(),
      txHash,
      details: `Router split ${milestone.amount} XLM: ${sellerAmount.toFixed(2)} XLM to Seller, ${platformFee.toFixed(2)} XLM (2.5%) to Platform${affiliateFee > 0 ? `, ${affiliateFee.toFixed(2)} XLM (${escrow.affiliateBps / 100}%) to Affiliate` : ""}`
    });

    localStorage.setItem("trustroute_events", JSON.stringify(events));
    return true;
  }

  // --- ON-CHAIN EXECUTION ---
  const args = [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
    nativeToScVal(milestoneIdx, { type: "u32" }),
  ];
  try {
    await submitSorobanTransaction(callerAddress, escrowContractId, "release_milestone", args, setStatusText);
    return true;
  } catch (err: any) {
    alert(`Transaction Failed: ${err.message}`);
    return false;
  }
};

export const requestRefund = async (
  id: number,
  callerAddress: string,
  setStatusText?: (text: string) => void
): Promise<boolean> => {
  const { mode, escrowId } = getContractConfig();

  if (mode === "simulation") {
    const escrows = JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
    const idx = escrows.findIndex((e: any) => e.id === id);
    if (idx === -1) return false;

    const escrow = escrows[idx];
    if (escrow.status !== EscrowStatus.Active) return false;

    if (Math.floor(Date.now() / 1000) < escrow.deadline) {
      alert("Deadline has not passed yet!");
      return false;
    }

    const remaining = parseFloat(escrow.amount) - parseFloat(escrow.releasedAmount);
    if (remaining <= 0) return false;

    escrow.status = EscrowStatus.Refunded;
    escrows[idx] = escrow;
    localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

    updateBalances(prev => ({
      ...prev,
      buyer: prev.buyer + remaining,
    }));

    const events = JSON.parse(localStorage.getItem("trustroute_events") || "[]");
    const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    events.unshift({
      id: `evt_ref_${Date.now()}`,
      type: "refund",
      timestamp: Date.now(),
      txHash,
      details: `Buyer claimed refund of ${remaining} XLM from Escrow #${id} after deadline`
    });
    localStorage.setItem("trustroute_events", JSON.stringify(events));

    return true;
  }

  // --- ON-CHAIN EXECUTION ---
  const args = [nativeToScVal(BigInt(id), { type: "u64" })];
  try {
    await submitSorobanTransaction(callerAddress, escrowId, "request_refund", args, setStatusText);
    return true;
  } catch (err: any) {
    alert(`Transaction Failed: ${err.message}`);
    return false;
  }
};

export const dispute = async (
  id: number,
  callerAddress: string,
  setStatusText?: (text: string) => void
): Promise<boolean> => {
  const { mode, escrowId } = getContractConfig();

  if (mode === "simulation") {
    const escrows = JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
    const idx = escrows.findIndex((e: any) => e.id === id);
    if (idx === -1) return false;

    const escrow = escrows[idx];
    if (escrow.status !== EscrowStatus.Active) return false;

    escrow.status = EscrowStatus.Disputed;
    escrows[idx] = escrow;
    localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

    const events = JSON.parse(localStorage.getItem("trustroute_events") || "[]");
    const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    events.unshift({
      id: `evt_disp_${Date.now()}`,
      type: "disputed",
      timestamp: Date.now(),
      txHash,
      details: `Dispute raised on Escrow #${id} by ${callerAddress.slice(0, 8)}...`
    });
    localStorage.setItem("trustroute_events", JSON.stringify(events));

    return true;
  }

  // --- ON-CHAIN EXECUTION ---
  const args = [
    nativeToScVal(BigInt(id), { type: "u64" }),
    nativeToScVal(Address.fromString(callerAddress)),
  ];
  try {
    await submitSorobanTransaction(callerAddress, escrowId, "dispute", args, setStatusText);
    return true;
  } catch (err: any) {
    alert(`Transaction Failed: ${err.message}`);
    return false;
  }
};

export const resolveDispute = async (
  id: number,
  favorSeller: boolean,
  callerAddress: string,
  setStatusText?: (text: string) => void
): Promise<boolean> => {
  const { mode, escrowId } = getContractConfig();

  if (mode === "simulation") {
    const escrows = JSON.parse(localStorage.getItem("trustroute_escrows") || "[]");
    const idx = escrows.findIndex((e: any) => e.id === id);
    if (idx === -1) return false;

    const escrow = escrows[idx];
    if (escrow.status !== EscrowStatus.Disputed) return false;

    const remaining = parseFloat(escrow.amount) - parseFloat(escrow.releasedAmount);

    if (favorSeller) {
      escrow.status = EscrowStatus.Released;
      escrow.releasedAmount = escrow.amount;

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

      updateBalances(prev => ({
        ...prev,
        buyer: prev.buyer + remaining,
      }));
    }

    escrows[idx] = escrow;
    localStorage.setItem("trustroute_escrows", JSON.stringify(escrows));

    const events = JSON.parse(localStorage.getItem("trustroute_events") || "[]");
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
  }

  // --- ON-CHAIN EXECUTION ---
  const args = [
    nativeToScVal(BigInt(id), { type: "u64" }),
    nativeToScVal(favorSeller),
  ];
  try {
    await submitSorobanTransaction(callerAddress, escrowId, "resolve_dispute", args, setStatusText);
    return true;
  } catch (err: any) {
    alert(`Transaction Failed: ${err.message}`);
    return false;
  }
};
