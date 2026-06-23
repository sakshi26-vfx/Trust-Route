export enum EscrowStatus {
  Pending = 0,
  Active = 1,
  Released = 2,
  Refunded = 3,
  Disputed = 4,
}

export interface Milestone {
  amount: string; // BigInt representation / display format
  released: boolean;
  description: string;
}

export interface EscrowData {
  id: number;
  buyer: string;
  seller: string;
  token: string;
  amount: string;
  deadline: number; // UNIX timestamp
  status: EscrowStatus;
  milestones: Milestone[];
  releasedAmount: string;
  router: string;
  affiliate?: string;
  affiliateBps: number;
}

export interface EventLog {
  id: string;
  type: 'created' | 'deposit' | 'released' | 'refund' | 'disputed' | 'resolved' | 'fee_paid' | 'aff_paid' | 'routed';
  timestamp: number;
  txHash: string;
  details: string;
}
