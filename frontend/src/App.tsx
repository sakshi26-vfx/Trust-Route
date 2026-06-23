import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Plus, 
  Layers, 
  History, 
  Lock, 
  HelpCircle, 
  Settings,
  CheckCircle2, 
  AlertTriangle, 
  RefreshCcw, 
  User, 
  ArrowRight,
  TrendingUp,
  Percent,
  Link
} from "lucide-react";
import { EscrowData, EscrowStatus, EventLog } from "./types";
import { 
  getEscrows, 
  getEvents, 
  getBalances, 
  createEscrowMock, 
  depositMock, 
  releaseMilestoneMock, 
  requestRefundMock, 
  disputeMock, 
  resolveDisputeMock 
} from "./lib/soroban";
import { connectWallet } from "./lib/freighter";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "create" | "events" | "admin">("dashboard");
  const [escrows, setEscrows] = useState<EscrowData[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  
  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Form state
  const [buyer, setBuyer] = useState("");
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("3");
  const [affiliate, setAffiliate] = useState("");
  const [affiliateBps, setAffiliateBps] = useState("0");
  const [milestones, setMilestones] = useState<{ amount: string; description: string }[]>([
    { amount: "", description: "" }
  ]);

  // Selected Escrow details
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowData | null>(null);

  // Sync data from localStorage
  const syncData = () => {
    setEscrows(getEscrows());
    setEvents(getEvents());
    setBalances(getBalances());
  };

  useEffect(() => {
    syncData();
    // Pre-populate buyer if wallet is connected
    if (walletAddress) {
      setBuyer(walletAddress);
    }
  }, [walletAddress]);

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    const addr = await connectWallet();
    if (addr) {
      setWalletAddress(addr);
    } else {
      // Fallback/Simulated wallet for quick demo
      setWalletAddress("GBUYER...DEMOWALLET");
    }
    setIsConnecting(false);
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setBuyer("");
  };

  const handleAddMilestone = () => {
    setMilestones([...milestones, { amount: "", description: "" }]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleMilestoneChange = (index: number, field: "amount" | "description", value: string) => {
    const updated = [...milestones];
    updated[index][field] = value;
    setMilestones(updated);
  };

  const handleCreateEscrow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyer || !seller || !amount) {
      alert("Please fill out all required fields.");
      return;
    }

    // Filter out completely blank inputs
    const activeMilestones = milestones.filter(m => m.amount.trim() !== "" && m.description.trim() !== "");

    // Verify milestone sum only if milestones are configured
    if (activeMilestones.length > 0) {
      const totalMilestones = activeMilestones.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
      if (totalMilestones !== parseFloat(amount)) {
        alert(`Milestone amounts (${totalMilestones}) must sum to the total escrow amount (${amount}).`);
        return;
      }
    }

    createEscrowMock(
      buyer,
      seller,
      amount,
      parseInt(deadlineDays),
      activeMilestones,
      affiliate || undefined,
      parseInt(affiliateBps)
    );

    // Reset Form
    setBuyer(walletAddress || "");
    setSeller("");
    setAmount("");
    setDeadlineDays("3");
    setAffiliate("");
    setAffiliateBps("0");
    setMilestones([{ amount: "", description: "" }]);

    syncData();
    setActiveTab("dashboard");
  };

  // Actions
  const handleDeposit = (id: number) => {
    if (depositMock(id)) {
      syncData();
      if (selectedEscrow?.id === id) {
        setSelectedEscrow(getEscrows().find(e => e.id === id) || null);
      }
    }
  };

  const handleReleaseMilestone = (escrowId: number, milestoneIdx: number) => {
    if (releaseMilestoneMock(escrowId, milestoneIdx)) {
      syncData();
      if (selectedEscrow?.id === escrowId) {
        setSelectedEscrow(getEscrows().find(e => e.id === escrowId) || null);
      }
    }
  };

  const handleRefund = (id: number) => {
    if (requestRefundMock(id)) {
      syncData();
      if (selectedEscrow?.id === id) {
        setSelectedEscrow(getEscrows().find(e => e.id === id) || null);
      }
    }
  };

  const handleDispute = (id: number) => {
    const caller = walletAddress || "GBUYER...123456";
    if (disputeMock(id, caller)) {
      syncData();
      if (selectedEscrow?.id === id) {
        setSelectedEscrow(getEscrows().find(e => e.id === id) || null);
      }
    }
  };

  const handleResolveDispute = (id: number, favorSeller: boolean) => {
    if (resolveDisputeMock(id, favorSeller)) {
      syncData();
      if (selectedEscrow?.id === id) {
        setSelectedEscrow(getEscrows().find(e => e.id === id) || null);
      }
    }
  };

  const getStatusBadge = (status: EscrowStatus) => {
    switch (status) {
      case EscrowStatus.Pending:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-300">Pending Deposit</span>;
      case EscrowStatus.Active:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-500/30">Active</span>;
      case EscrowStatus.Released:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">Released</span>;
      case EscrowStatus.Refunded:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-900/80 text-slate-400 border border-slate-500/20">Refunded</span>;
      case EscrowStatus.Disputed:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-rose-950/60 text-rose-400 border border-rose-500/30">Disputed</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Navbar */}
      <header className="flex justify-between items-center mb-8 pb-6 border-b border-navy-700/50">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-xl shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
              Trust<span className="text-indigo-400">Route</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">Decentralized Escrow & Payment Router</p>
          </div>
        </div>

        {/* Ledger Simulation Stats */}
        <div className="hidden md:flex items-center space-x-6 mr-4 bg-navy-800/40 p-2.5 rounded-xl border border-white/5">
          <div className="text-right">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Escrow Balance</span>
            <span className="text-sm font-semibold text-indigo-400">{balances.buyer?.toLocaleString()} XLM</span>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="text-right">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Platform Fees</span>
            <span className="text-sm font-semibold text-emerald-400">{balances.platform?.toLocaleString()} XLM</span>
          </div>
        </div>

        {walletAddress ? (
          <button
            onClick={handleDisconnect}
            className="flex items-center space-x-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/10 font-medium text-sm px-4 py-2.5 rounded-xl transition duration-200"
          >
            <User className="h-4 w-4 text-indigo-400" />
            <span>Disconnect [{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}]</span>
          </button>
        ) : (
          <button
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/10 transition duration-200"
          >
            <User className="h-4 w-4" />
            <span>Connect Freighter</span>
          </button>
        )}
      </header>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-1 space-y-2">
          <button
            onClick={() => { setActiveTab("dashboard"); setSelectedEscrow(null); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === "dashboard"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15"
                : "text-slate-400 hover:bg-navy-800/40 hover:text-white"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Escrows Dashboard</span>
          </button>
          
          <button
            onClick={() => setActiveTab("create")}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === "create"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15"
                : "text-slate-400 hover:bg-navy-800/40 hover:text-white"
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>Create Escrow</span>
          </button>

          <button
            onClick={() => setActiveTab("events")}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === "events"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15"
                : "text-slate-400 hover:bg-navy-800/40 hover:text-white"
            }`}
          >
            <History className="h-4 w-4" />
            <span>Realtime Activity</span>
          </button>

          <button
            onClick={() => setActiveTab("admin")}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
              activeTab === "admin"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15"
                : "text-slate-400 hover:bg-navy-800/40 hover:text-white"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Arbiter Console</span>
          </button>

          <div className="pt-6 border-t border-navy-700/50 mt-6">
            <div className="glass p-4 rounded-xl space-y-2 text-xs text-slate-400">
              <div className="flex items-center space-x-1 text-slate-300 font-semibold mb-1">
                <HelpCircle className="h-3.5 w-3.5 text-indigo-400" />
                <span>How TrustRoute works:</span>
              </div>
              <p>1. Buyer creates escrow & locks funds.</p>
              <p>2. Router splits payments atomically to fee, affiliate & seller.</p>
              <p>3. Support for milestone-based releases, refunds & disputes.</p>
            </div>
          </div>
        </aside>

        {/* Tab Content Display Area */}
        <main className="lg:col-span-3">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && !selectedEscrow && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Your Escrow Agreements</h2>
                <button
                  onClick={syncData}
                  className="p-2 text-slate-400 hover:text-white bg-navy-800/50 border border-white/5 rounded-lg transition"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>

              {escrows.length === 0 ? (
                <div className="glass p-12 text-center rounded-2xl">
                  <Lock className="h-12 w-12 text-indigo-400/40 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white">No escrows found</h3>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto mt-2">
                    Create an escrow agreement to secure payments with milestone triggers.
                  </p>
                  <button
                    onClick={() => setActiveTab("create")}
                    className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-sm transition"
                  >
                    Create New Escrow
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {escrows.map(escrow => (
                    <div
                      key={escrow.id}
                      onClick={() => setSelectedEscrow(escrow)}
                      className="glass glass-hover p-5 rounded-2xl cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="text-xs font-bold text-slate-400 uppercase">Escrow #{escrow.id}</span>
                          {getStatusBadge(escrow.status)}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-slate-400">Total Amount:</span>
                            <span className="text-sm font-semibold text-slate-200">{escrow.amount} XLM</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-slate-400">Released:</span>
                            <span className="text-sm font-semibold text-emerald-400">{escrow.releasedAmount} XLM</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-slate-400">Seller:</span>
                            <span className="text-sm text-slate-300 truncate max-w-[120px]">{escrow.seller}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-5 pt-4 border-t border-white/5 flex justify-between items-center">
                        <span className="text-xs text-slate-400">
                          {escrow.milestones.length} Milestone{escrow.milestones.length !== 1 && "s"}
                        </span>
                        <span className="text-xs text-indigo-400 flex items-center font-medium">
                          Manage Deal <ArrowRight className="h-3 w-3 ml-1" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 1.5: ESCROW DETAIL VIEW */}
          {activeTab === "dashboard" && selectedEscrow && (
            <div className="space-y-6">
              <button
                onClick={() => setSelectedEscrow(null)}
                className="text-sm text-slate-400 hover:text-white transition flex items-center"
              >
                ← Back to Dashboard
              </button>

              <div className="glass p-6 rounded-2xl space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 pb-6 border-b border-white/5">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-xl font-bold text-white">Escrow Agreement #{selectedEscrow.id}</h2>
                      {getStatusBadge(selectedEscrow.status)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Router Address: <span className="font-mono">{selectedEscrow.router}</span></p>
                  </div>
                  
                  {/* Status Actions */}
                  <div className="flex items-center space-x-2">
                    {selectedEscrow.status === EscrowStatus.Pending && (
                      <button
                        onClick={() => handleDeposit(selectedEscrow.id)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
                      >
                        Lock/Deposit Funds
                      </button>
                    )}
                    {selectedEscrow.status === EscrowStatus.Active && (
                      <>
                        <button
                          onClick={() => handleDispute(selectedEscrow.id)}
                          className="bg-rose-950/40 border border-rose-500/30 text-rose-300 hover:bg-rose-900/30 px-4 py-2 rounded-xl text-sm font-medium transition flex items-center space-x-1"
                        >
                          <AlertTriangle className="h-4 w-4" />
                          <span>Raise Dispute</span>
                        </button>
                        
                        {Math.floor(Date.now() / 1000) >= selectedEscrow.deadline && (
                          <button
                            onClick={() => handleRefund(selectedEscrow.id)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition"
                          >
                            Claim Refund
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Info Fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-2">
                  <div className="bg-navy-800/40 p-4 rounded-xl border border-white/5">
                    <span className="block text-xs text-slate-400 font-medium">Buyer Address</span>
                    <span className="font-mono text-sm text-slate-300 block mt-1 truncate">{selectedEscrow.buyer}</span>
                  </div>
                  <div className="bg-navy-800/40 p-4 rounded-xl border border-white/5">
                    <span className="block text-xs text-slate-400 font-medium">Seller Address</span>
                    <span className="font-mono text-sm text-slate-300 block mt-1 truncate">{selectedEscrow.seller}</span>
                  </div>
                  <div className="bg-navy-800/40 p-4 rounded-xl border border-white/5">
                    <span className="block text-xs text-slate-400 font-medium">Affiliate Share</span>
                    <span className="font-mono text-sm text-slate-300 block mt-1">
                      {selectedEscrow.affiliate ? `${selectedEscrow.affiliate.slice(0, 8)}... (${selectedEscrow.affiliateBps / 100}%)` : "None"}
                    </span>
                  </div>
                </div>

                {/* Progress Metric */}
                <div className="bg-navy-800/20 p-4 rounded-xl border border-white/5 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Releases Payout Progress</span>
                    <span className="font-semibold text-slate-200">
                      {selectedEscrow.releasedAmount} / {selectedEscrow.amount} XLM ({((parseFloat(selectedEscrow.releasedAmount) / parseFloat(selectedEscrow.amount)) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${(parseFloat(selectedEscrow.releasedAmount) / parseFloat(selectedEscrow.amount)) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Milestones Checklist */}
                <div>
                  <h3 className="text-base font-bold text-white mb-3">Milestones Breakdown</h3>
                  <div className="space-y-3">
                    {selectedEscrow.milestones.map((ms, idx) => (
                      <div 
                        key={idx} 
                        className={`flex justify-between items-center p-4 rounded-xl border transition ${
                          ms.released 
                            ? "bg-emerald-950/20 border-emerald-500/20" 
                            : "bg-navy-800/30 border-white/5"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          {ms.released ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-slate-600"></div>
                          )}
                          <div>
                            <span className="block font-semibold text-sm text-slate-200">{ms.description}</span>
                            <span className="text-xs text-slate-400">{ms.amount} XLM</span>
                          </div>
                        </div>

                        {/* Release trigger */}
                        {!ms.released && selectedEscrow.status === EscrowStatus.Active && (
                          <button
                            onClick={() => handleReleaseMilestone(selectedEscrow.id, idx)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition"
                          >
                            Release Funds
                          </button>
                        )}
                        {ms.released && (
                          <span className="text-xs text-emerald-400 font-semibold bg-emerald-900/30 px-2.5 py-1 rounded-md border border-emerald-500/20">
                            Split Completed
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CREATE ESCROW */}
          {activeTab === "create" && (
            <div className="glass p-6 rounded-2xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Create Escrow Deal</h2>
                <p className="text-sm text-slate-400 mt-1">Specify payment targets, deadlines, and milestone distributions.</p>
              </div>

              <form onSubmit={handleCreateEscrow} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">Buyer Address (requires Freighter authorization)</label>
                    <input
                      type="text"
                      value={buyer}
                      onChange={(e) => setBuyer(e.target.value)}
                      placeholder="e.g. GBUYER..."
                      className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">Seller Address</label>
                    <input
                      type="text"
                      value={seller}
                      onChange={(e) => setSeller(e.target.value)}
                      placeholder="e.g. GSELLER..."
                      className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">Total Escrow Amount (XLM)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">Refund Deadline (Days from now)</label>
                    <select
                      value={deadlineDays}
                      onChange={(e) => setDeadlineDays(e.target.value)}
                      className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="1">1 Day</option>
                      <option value="3">3 Days</option>
                      <option value="7">7 Days</option>
                      <option value="14">14 Days</option>
                    </select>
                  </div>
                </div>

                {/* Affiliate details (Router testing) */}
                <div className="bg-navy-800/30 p-4 rounded-xl border border-white/5 space-y-4">
                  <div className="flex items-center space-x-1.5 text-xs text-indigo-400 font-bold uppercase tracking-wider">
                    <TrendingUp className="h-4 w-4" />
                    <span>Optional Affiliate Splitting</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 block">Affiliate Address</label>
                      <input
                        type="text"
                        value={affiliate}
                        onChange={(e) => setAffiliate(e.target.value)}
                        placeholder="e.g. GAFFILIATE..."
                        className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 block">Affiliate Share (BPS - e.g. 500 for 5%)</label>
                      <input
                        type="number"
                        value={affiliateBps}
                        onChange={(e) => setAffiliateBps(e.target.value)}
                        placeholder="e.g. 500"
                        className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Milestones wizard */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-300 uppercase">Milestones Configuration</span>
                    <button
                      type="button"
                      onClick={handleAddMilestone}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Milestone</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {milestones.map((ms, idx) => (
                      <div key={idx} className="flex items-center space-x-3 bg-navy-900/40 p-3 rounded-xl border border-white/5">
                        <input
                          type="text"
                          value={ms.description}
                          onChange={(e) => handleMilestoneChange(idx, "description", e.target.value)}
                          placeholder="e.g. Phase 1 Setup"
                          className="flex-1 bg-navy-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <input
                          type="number"
                          value={ms.amount}
                          onChange={(e) => handleMilestoneChange(idx, "amount", e.target.value)}
                          placeholder="Amount"
                          className="w-24 bg-navy-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        {milestones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMilestone(idx)}
                            className="text-xs text-rose-500 hover:text-rose-400 font-semibold"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold text-sm py-3 rounded-xl shadow-lg transition duration-200"
                >
                  Propose Agreement
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: REALTIME ACTIVITY */}
          {activeTab === "events" && (
            <div className="glass p-6 rounded-2xl space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">Realtime Soroban Events</h2>
                  <p className="text-sm text-slate-400 mt-1">Live status log parsed from the testnet RPC subscription.</p>
                </div>
                <button
                  onClick={syncData}
                  className="p-2 text-slate-400 hover:text-white bg-navy-800/50 border border-white/5 rounded-lg transition"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {events.map((evt) => (
                  <div key={evt.id} className="bg-navy-900/50 p-4 rounded-xl border border-white/5 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        evt.type === 'created' || evt.type === 'deposit' ? "bg-slate-800 text-slate-300" :
                        evt.type === 'released' || evt.type === 'routed' ? "bg-emerald-950/40 text-emerald-400" :
                        evt.type === 'disputed' ? "bg-rose-950/40 text-rose-400" : "bg-indigo-950/40 text-indigo-400"
                      }`}>
                        {evt.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-slate-200 font-medium">{evt.details}</p>
                    <div className="flex items-center space-x-1 text-[10px] text-slate-400 pt-1">
                      <Link className="h-3 w-3" />
                      <span className="font-mono truncate max-w-[200px]">{evt.txHash}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: ADMIN / ARBITER CONSOLE */}
          {activeTab === "admin" && (
            <div className="space-y-6">
              <div className="glass p-6 rounded-2xl space-y-4">
                <h2 className="text-xl font-bold text-white">Arbiter Resolution Center</h2>
                <p className="text-sm text-slate-400">Resolve disputed escrow agreements when sellers or buyers fail to reach consensus.</p>
                
                {escrows.filter(e => e.status === EscrowStatus.Disputed).length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm bg-navy-900/30 rounded-xl border border-white/5">
                    No active disputes requiring arbitrage at this time.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {escrows.filter(e => e.status === EscrowStatus.Disputed).map(escrow => (
                      <div key={escrow.id} className="bg-navy-900/60 p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-bold text-slate-400">DISPUTED AGREEMENT #{escrow.id}</span>
                            <span className="block text-sm font-semibold text-white mt-1">Total Amount: {escrow.amount} XLM</span>
                            <span className="block text-xs text-slate-400">Released thus far: {escrow.releasedAmount} XLM</span>
                          </div>
                          
                          {/* Resolution actions */}
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleResolveDispute(escrow.id, false)}
                              className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-3 py-2 rounded-lg transition"
                            >
                              Favor Buyer (Refund)
                            </button>
                            <button
                              onClick={() => handleResolveDispute(escrow.id, true)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-2 rounded-lg transition"
                            >
                              Favor Seller (Route)
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fee Splitting Settings */}
              <div className="glass p-6 rounded-2xl space-y-4">
                <div className="flex items-center space-x-2">
                  <Percent className="h-5 w-5 text-indigo-400" />
                  <h2 className="text-xl font-bold text-white">Payment Router Config</h2>
                </div>
                <p className="text-sm text-slate-400">Manage the atomic platform routing shares.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                  <div className="bg-navy-900/40 p-4 rounded-xl border border-white/5 space-y-1">
                    <span className="text-xs text-slate-400">Router Platform Fee Share</span>
                    <span className="block text-lg font-bold text-slate-200">2.50% (250 BPS)</span>
                  </div>
                  <div className="bg-navy-900/40 p-4 rounded-xl border border-white/5 space-y-1">
                    <span className="text-xs text-slate-400">Global Admin Arbiter</span>
                    <span className="block text-xs font-mono text-slate-300 truncate">{selectedEscrow?.router || "GADMIN...CONTRACT"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
