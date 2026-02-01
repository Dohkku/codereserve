import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@codereserve/db';
import { authRoutes } from '../routes/auth';
import { repoRoutes } from '../routes/repos';
import { prRoutes } from '../routes/prs';
import { depositRoutes } from '../routes/deposits';
import { signToken, encrypt } from '../lib';
import { v4 as uuid } from 'uuid';

// Create in-memory SQLite database
export function createTestDb() {
  const sqlite = new Database(':memory:');

  // Create tables
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      github_id INTEGER NOT NULL UNIQUE,
      login TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      wallet_address TEXT,
      access_token TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE repositories (
      id TEXT PRIMARY KEY,
      github_id INTEGER NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      installation_id INTEGER NOT NULL,
      treasury_address TEXT NOT NULL,
      risk_threshold INTEGER NOT NULL DEFAULT 60,
      deposit_amount TEXT NOT NULL DEFAULT '5000000',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE pull_requests (
      id TEXT PRIMARY KEY,
      github_id INTEGER NOT NULL,
      repo_id TEXT NOT NULL REFERENCES repositories(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      deposit_required INTEGER NOT NULL,
      deposit_id TEXT,
      head_sha TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE deposits (
      id TEXT PRIMARY KEY,
      onchain_id TEXT,
      pr_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      repo_id TEXT NOT NULL REFERENCES repositories(id),
      amount TEXT NOT NULL,
      treasury_address TEXT NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      refund_tx_hash TEXT,
      slash_tx_hash TEXT,
      slash_reason TEXT,
      slashed_by_id TEXT REFERENCES users(id),
      slashed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE repo_user_entries (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      reason TEXT,
      added_by_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );
  `);

  return drizzle(sqlite, { schema });
}

// Mock GitHub service
export function createMockGitHubService(options: {
  hasWriteAccess?: boolean;
} = {}) {
  const { hasWriteAccess = true } = options;

  // Mock Octokit with methods we use
  const mockOctokit = {
    rest: {
      issues: {
        createComment: async () => ({ data: { id: 1 } }),
      },
    },
  };

  return {
    getInstallationOctokit: async () => mockOctokit,
    getUserInfo: async () => ({
      id: 12345,
      login: 'testuser',
      email: 'test@example.com',
      avatarUrl: 'https://github.com/testuser.png',
      createdAt: '2020-01-01T00:00:00Z',
      followers: 100,
    }),
    getMergedPRCount: async () => 5,
    closePRWithComment: async () => {},
    reopenPR: async () => {},
    addLabel: async () => {},
    removeLabel: async () => {},
    hasWriteAccess: async () => hasWriteAccess,
    exchangeCodeForToken: async () => ({ accessToken: 'mock-token' }),
    getAuthenticatedUser: async () => ({
      id: 12345,
      login: 'testuser',
      email: 'test@example.com',
      avatarUrl: 'https://github.com/testuser.png',
      createdAt: '2020-01-01T00:00:00Z',
      followers: 100,
    }),
    generateDepositComment: () => 'deposit comment',
    generateTrustedComment: () => 'trusted comment',
  };
}

// Mock blockchain service
export function createMockBlockchainService() {
  return {
    contractAddress: '0x0000000000000000000000000000000000000001',
    chainId: 84532,
    repoNameToId: (name: string) => `0x${Buffer.from(name).toString('hex').padEnd(64, '0')}`,
    createRefundSignature: async () => ({ signature: '0xmocksig' }),
    createSlashSignature: async () => ({ signature: '0xmocksig' }),
  };
}

// Create test app
export function createTestApp(options: {
  hasWriteAccess?: boolean;
} = {}) {
  const db = createTestDb();
  const githubService = createMockGitHubService(options);
  const blockchainService = createMockBlockchainService();

  const app = new Hono();

  app.use('*', cors({ origin: '*', credentials: true }));

  // Inject services
  app.use('*', async (c, next) => {
    c.set('db', db as any);
    c.set('githubService', githubService as any);
    c.set('blockchainService', blockchainService as any);
    await next();
  });

  // Routes
  app.route('/api/auth', authRoutes);
  app.route('/api/repos', repoRoutes);
  app.route('/api/prs', prRoutes);
  app.route('/api/deposits', depositRoutes);

  return { app, db, githubService, blockchainService };
}

// Create test user and return auth token
export async function createTestUser(db: any, userData: Partial<{
  id: string;
  githubId: number;
  login: string;
  email: string;
  avatarUrl: string;
  walletAddress: string;
  accessToken: string;
}> = {}) {
  const user = {
    id: userData.id || uuid(),
    githubId: userData.githubId || 12345,
    login: userData.login || 'testuser',
    email: userData.email || 'test@example.com',
    avatarUrl: userData.avatarUrl || 'https://github.com/testuser.png',
    walletAddress: userData.walletAddress || null,
    accessToken: userData.accessToken || encrypt('mock-github-token'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.users).values(user);

  const token = signToken({
    userId: user.id,
    githubId: user.githubId,
    login: user.login,
  });

  return { user, token };
}

// Create test repository
export async function createTestRepo(db: any, repoData: Partial<{
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  installationId: number;
  treasuryAddress: string;
  riskThreshold: number;
  depositAmount: string;
  isActive: boolean;
}> = {}) {
  const repo = {
    id: repoData.id || uuid(),
    githubId: repoData.githubId || 67890,
    owner: repoData.owner || 'testorg',
    name: repoData.name || 'testrepo',
    fullName: repoData.fullName || 'testorg/testrepo',
    installationId: repoData.installationId || 111,
    treasuryAddress: repoData.treasuryAddress || '0x0000000000000000000000000000000000000002',
    riskThreshold: repoData.riskThreshold ?? 60,
    depositAmount: repoData.depositAmount || '5000000',
    isActive: repoData.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.repositories).values(repo);

  return repo;
}

// Create test PR
export async function createTestPR(db: any, prData: {
  repoId: string;
  authorId: string;
  number?: number;
  title?: string;
  state?: string;
  riskScore?: number;
  depositRequired?: boolean;
  depositId?: string;
}) {
  const pr = {
    id: uuid(),
    githubId: Math.floor(Math.random() * 1000000),
    repoId: prData.repoId,
    authorId: prData.authorId,
    number: prData.number || 1,
    title: prData.title || 'Test PR',
    state: prData.state || 'open',
    riskScore: prData.riskScore ?? 50,
    depositRequired: prData.depositRequired ?? false,
    depositId: prData.depositId || null,
    headSha: 'abc123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.pullRequests).values(pr);

  return pr;
}

// Create test deposit
export async function createTestDeposit(db: any, depositData: {
  prId: string;
  userId: string;
  repoId: string;
  status?: string;
  amount?: string;
  treasuryAddress?: string;
  onchainId?: string;
  slashReason?: string;
  slashedById?: string;
}) {
  const deposit = {
    id: uuid(),
    onchainId: depositData.onchainId || '1',
    prId: depositData.prId,
    userId: depositData.userId,
    repoId: depositData.repoId,
    amount: depositData.amount || '5000000',
    treasuryAddress: depositData.treasuryAddress || '0x0000000000000000000000000000000000000002',
    txHash: '0xtxhash',
    status: depositData.status || 'confirmed',
    slashReason: depositData.slashReason || null,
    slashedById: depositData.slashedById || null,
    slashedAt: depositData.slashedById ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  await db.insert(schema.deposits).values(deposit);

  return deposit;
}
