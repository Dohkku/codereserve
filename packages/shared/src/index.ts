// ============================================
// CodeReserve Shared Types
// ============================================

// Repository configuration
export interface Repository {
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  treasuryAddress: string;
  riskThreshold: number; // Score above this requires deposit
  depositAmount: bigint; // In USDC smallest unit (6 decimals)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// User (GitHub)
export interface User {
  id: string;
  githubId: number;
  login: string;
  email: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Pull Request
export interface PullRequest {
  id: string;
  githubId: number;
  repoId: string;
  number: number;
  authorId: string;
  title: string;
  state: PRState;
  riskScore: number;
  depositRequired: boolean;
  depositId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PRState = 'open' | 'closed' | 'merged' | 'pending_deposit';

// Deposit on blockchain
export interface Deposit {
  id: string;
  onchainId: bigint; // ID on the smart contract
  prId: string;
  userId: string;
  repoId: string;
  amount: bigint;
  treasuryAddress: string;
  txHash: string;
  status: DepositStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date; // 30 days after creation
}

export type DepositStatus =
  | 'pending'      // Waiting for confirmation
  | 'confirmed'    // On-chain confirmed
  | 'refunded'     // Returned to contributor
  | 'slashed'      // Sent to treasury (spam)
  | 'expired';     // Claimed via timeout

// Whitelist/Blacklist entries
export interface RepoUserEntry {
  id: string;
  repoId: string;
  userId: string;
  type: 'whitelist' | 'blacklist';
  reason: string | null;
  addedBy: string; // Maintainer who added
  createdAt: Date;
}

// Risk Score calculation
export interface RiskScoreInput {
  accountAgeDays: number;
  mergedPRCount: number;
  emailVerified: boolean;
  followerCount: number;
  isWhitelisted: boolean;
  isBlacklisted: boolean;
}

export interface RiskScoreResult {
  score: number;
  requiresDeposit: boolean;
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  modifier: number;
  reason: string;
}

// GitHub Webhook Events
export interface PRWebhookPayload {
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'edited';
  pull_request: {
    id: number;
    number: number;
    title: string;
    state: string;
    merged: boolean;
    user: {
      id: number;
      login: string;
      avatar_url: string;
      created_at: string;
    };
    head: {
      sha: string;
    };
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  installation?: {
    id: number;
  };
}

// API Responses
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DepositInfoResponse {
  depositId: string;
  amount: string;
  repoFullName: string;
  prNumber: number;
  contractAddress: string;
  chainId: number;
}

export interface RefundSignatureResponse {
  depositId: bigint;
  signature: string;
  deadline: number;
}

// Contract types
export interface DepositParams {
  repoId: string;
  prNumber: number;
  treasuryAddress: string;
}

export interface ContractDeposit {
  depositor: string;
  amount: bigint;
  repoId: string;
  prNumber: bigint;
  treasury: string;
  timestamp: bigint;
  status: number; // 0: Active, 1: Refunded, 2: Slashed, 3: TimedOut
}

// Constants
export const DEPOSIT_AMOUNT_USDC = 5_000_000n; // 5 USDC (6 decimals)
export const DEPOSIT_TIMEOUT_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// Risk score constants
export const RISK_SCORE_BASE = 50;
export const RISK_SCORE_MODIFIERS = {
  ACCOUNT_NEW: 20,      // < 1 month
  ACCOUNT_OLD: -30,     // > 2 years
  PR_MERGED: -8,        // per PR, max -40
  PR_MERGED_MAX: -40,
  EMAIL_VERIFIED: -5,
  MANY_FOLLOWERS: -10,  // 50+
  WHITELISTED: -100,    // Sets to 0
  BLACKLISTED: 100,     // Sets to 100
} as const;
