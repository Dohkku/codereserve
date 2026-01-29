import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { deposits, pullRequests, repositories, users } from '@codereserve/db';
import type { AppContext } from '../index';

export const depositRoutes = new Hono<AppContext>();

// Auth middleware helper
async function getAuthUser(c: any): Promise<{ userId: string; login: string } | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.slice(7);
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    if (decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * GET /api/deposits/info
 * Get deposit info for a PR (before making deposit)
 */
depositRoutes.get('/info', async (c) => {
  const repo = c.req.query('repo'); // owner/name
  const prNumber = c.req.query('pr');

  if (!repo || !prNumber) {
    return c.json({ error: 'Missing repo or pr parameter' }, 400);
  }

  const db = c.get('db');
  const blockchainService = c.get('blockchainService');

  // Find repository
  const [repoRecord] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.fullName, repo));

  if (!repoRecord) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Find PR
  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repoId, repoRecord.id),
        eq(pullRequests.number, parseInt(prNumber, 10))
      )
    );

  if (!pr) {
    return c.json({ error: 'Pull request not found' }, 404);
  }

  // Generate repo ID for contract
  const repoIdBytes32 = blockchainService.repoNameToId(repo);

  return c.json({
    prId: pr.id,
    repoId: repoIdBytes32,
    prNumber: pr.number,
    repoFullName: repo,
    amount: repoRecord.depositAmount,
    treasuryAddress: repoRecord.treasuryAddress,
    contractAddress: blockchainService.contractAddress,
    chainId: blockchainService.chainId,
    riskScore: pr.riskScore,
  });
});

/**
 * POST /api/deposits
 * Record a deposit (called after on-chain tx)
 */
depositRoutes.post('/', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const schema = z.object({
    prId: z.string(),
    txHash: z.string(),
    onchainId: z.string(), // BigInt as string
  });

  try {
    const body = await c.req.json();
    const { prId, txHash, onchainId } = schema.parse(body);

    const db = c.get('db');

    // Get PR and repo
    const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, prId));

    if (!pr) {
      return c.json({ error: 'Pull request not found' }, 404);
    }

    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, pr.repoId));

    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    // Check if deposit already exists for this PR
    const [existingDeposit] = await db
      .select()
      .from(deposits)
      .where(eq(deposits.prId, prId));

    if (existingDeposit) {
      return c.json({ error: 'Deposit already exists for this PR' }, 400);
    }

    // Create deposit record
    const depositId = uuid();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(deposits).values({
      id: depositId,
      onchainId,
      prId,
      userId: auth.userId,
      repoId: pr.repoId,
      amount: repo.depositAmount,
      treasuryAddress: repo.treasuryAddress,
      txHash,
      status: 'confirmed',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt,
    });

    // Update PR
    await db
      .update(pullRequests)
      .set({
        depositId,
        state: 'open',
        updatedAt: new Date(),
      })
      .where(eq(pullRequests.id, prId));

    // Reopen PR on GitHub
    const githubService = c.get('githubService');
    const octokit = await githubService.getInstallationOctokit(repo.installationId);

    await githubService.reopenPR(
      octokit,
      repo.owner,
      repo.name,
      pr.number,
      '## CodeReserve: Deposit Confirmed\n\nYour deposit has been confirmed. Your PR is now open for review.\n\n---\n*This is an automated message from [CodeReserve](https://codereserve.io)*'
    );

    await githubService.removeLabel(octokit, repo.owner, repo.name, pr.number, 'CR-Pending-Deposit');
    await githubService.addLabel(octokit, repo.owner, repo.name, pr.number, 'CR-Deposit-Active');

    return c.json({
      success: true,
      depositId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    console.error('Deposit error:', error);
    return c.json({ error: 'Failed to record deposit' }, 500);
  }
});

/**
 * GET /api/deposits/:id
 * Get deposit details
 */
depositRoutes.get('/:id', async (c) => {
  const depositId = c.req.param('id');
  const db = c.get('db');

  const [deposit] = await db.select().from(deposits).where(eq(deposits.id, depositId));

  if (!deposit) {
    return c.json({ error: 'Deposit not found' }, 404);
  }

  return c.json({ deposit });
});

/**
 * GET /api/deposits/user
 * Get deposits for authenticated user
 */
depositRoutes.get('/user/me', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.get('db');

  const userDeposits = await db
    .select()
    .from(deposits)
    .where(eq(deposits.userId, auth.userId));

  return c.json({ deposits: userDeposits });
});

/**
 * POST /api/deposits/:id/refund
 * Request refund for a deposit (generates signature)
 */
depositRoutes.post('/:id/refund', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const depositId = c.req.param('id');
  const db = c.get('db');
  const blockchainService = c.get('blockchainService');

  // Get deposit
  const [deposit] = await db.select().from(deposits).where(eq(deposits.id, depositId));

  if (!deposit) {
    return c.json({ error: 'Deposit not found' }, 404);
  }

  if (deposit.status !== 'confirmed') {
    return c.json({ error: 'Deposit is not in refundable state' }, 400);
  }

  // Check if PR is merged or closed (refund conditions)
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, deposit.prId));

  if (!pr || !['merged', 'closed'].includes(pr.state)) {
    return c.json({ error: 'PR must be merged or closed for refund' }, 400);
  }

  try {
    // Generate refund signature
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
    const onchainId = BigInt(deposit.onchainId || '0');

    const { signature } = await blockchainService.createRefundSignature(onchainId, deadline);

    return c.json({
      depositId: deposit.onchainId,
      signature,
      deadline: Number(deadline),
      contractAddress: blockchainService.contractAddress,
      chainId: blockchainService.chainId,
    });
  } catch (error) {
    console.error('Refund signature error:', error);
    return c.json({ error: 'Failed to generate refund signature' }, 500);
  }
});

/**
 * POST /api/deposits/:id/slash
 * Slash a deposit (maintainer action for spam)
 */
depositRoutes.post('/:id/slash', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const depositId = c.req.param('id');
  const db = c.get('db');
  const blockchainService = c.get('blockchainService');
  const githubService = c.get('githubService');

  // Get deposit
  const [deposit] = await db.select().from(deposits).where(eq(deposits.id, depositId));

  if (!deposit) {
    return c.json({ error: 'Deposit not found' }, 404);
  }

  if (deposit.status !== 'confirmed') {
    return c.json({ error: 'Deposit is not in slashable state' }, 400);
  }

  // Get repo and check maintainer permissions
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, deposit.repoId));

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Get user for permission check
  const [user] = await db.select().from(users).where(eq(users.id, auth.userId));

  if (!user?.accessToken) {
    return c.json({ error: 'User access token not found' }, 400);
  }

  // TODO: Check if user has write access to repo
  // For now, trust the auth

  try {
    // Generate slash signature
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
    const onchainId = BigInt(deposit.onchainId || '0');

    const { signature } = await blockchainService.createSlashSignature(onchainId, deadline);

    // Update deposit status
    await db
      .update(deposits)
      .set({ status: 'slashed', updatedAt: new Date() })
      .where(eq(deposits.id, depositId));

    // Update PR
    const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, deposit.prId));

    if (pr) {
      // Add spam label
      const octokit = await githubService.getInstallationOctokit(repo.installationId);
      await githubService.addLabel(octokit, repo.owner, repo.name, pr.number, 'CR-Spam');
    }

    return c.json({
      depositId: deposit.onchainId,
      signature,
      deadline: Number(deadline),
      contractAddress: blockchainService.contractAddress,
      chainId: blockchainService.chainId,
    });
  } catch (error) {
    console.error('Slash signature error:', error);
    return c.json({ error: 'Failed to generate slash signature' }, 500);
  }
});

/**
 * POST /api/deposits/:id/confirm-refund
 * Confirm refund after on-chain tx
 */
depositRoutes.post('/:id/confirm-refund', async (c) => {
  const depositId = c.req.param('id');
  const db = c.get('db');

  const schema = z.object({
    txHash: z.string(),
  });

  try {
    const body = await c.req.json();
    const { txHash } = schema.parse(body);

    await db
      .update(deposits)
      .set({
        status: 'refunded',
        refundTxHash: txHash,
        updatedAt: new Date(),
      })
      .where(eq(deposits.id, depositId));

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to confirm refund' }, 500);
  }
});
