import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { eq, and, sql, desc } from 'drizzle-orm';
import { repositories, users, repoUserEntries, deposits } from '@codereserve/db';
import type { AppContext } from '../index';
import { verifyToken } from '../lib';

export const repoRoutes = new Hono<AppContext>();

// Auth helper using JWT
async function getAuthUser(c: any): Promise<{ userId: string; login: string; githubId: number } | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  return decoded;
}

// Permission check helper using injected GitHub service
async function checkRepoWriteAccess(
  c: any,
  userId: string,
  repoOwner: string,
  repoName: string
): Promise<boolean> {
  const db = c.get('db');
  const githubService = c.get('githubService');

  // Get user
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return false;

  // Get repo to get installation ID
  const [repo] = await db.select().from(repositories)
    .where(and(eq(repositories.owner, repoOwner), eq(repositories.name, repoName)));
  if (!repo) return false;

  try {
    const octokit = await githubService.getInstallationOctokit(repo.installationId);
    return await githubService.hasWriteAccess(octokit, repoOwner, repoName, user.login);
  } catch {
    return false;
  }
}

/**
 * GET /api/repos
 * List repos where user has write access
 */
repoRoutes.get('/', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.get('db');
  const githubService = c.get('githubService');

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, auth.userId));

  if (!user?.accessToken) {
    return c.json({ error: 'User not found or no access token' }, 400);
  }

  // Get all registered repos
  const allRepos = await db.select().from(repositories).where(eq(repositories.isActive, true));

  // Filter to repos where user has write access
  const accessibleRepos = [];
  for (const repo of allRepos) {
    try {
      const octokit = await githubService.getInstallationOctokit(repo.installationId);
      const hasAccess = await githubService.hasWriteAccess(octokit, repo.owner, repo.name, user.login);
      if (hasAccess) {
        accessibleRepos.push(repo);
      }
    } catch {
      // Skip repos where we can't verify access
    }
  }

  return c.json({
    repositories: accessibleRepos.map((r) => ({
      id: r.id,
      githubId: r.githubId,
      owner: r.owner,
      name: r.name,
      fullName: r.fullName,
      treasuryAddress: r.treasuryAddress,
      riskThreshold: r.riskThreshold,
      depositAmount: r.depositAmount,
      isActive: r.isActive,
    })),
  });
});

/**
 * GET /api/repos/:id
 * Get repo details including slash statistics
 */
repoRoutes.get('/:id', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const repoId = c.req.param('id');
  const db = c.get('db');

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Get whitelist and blacklist
  const entries = await db
    .select()
    .from(repoUserEntries)
    .where(eq(repoUserEntries.repoId, repoId));

  const whitelist = entries.filter((e) => e.type === 'whitelist');
  const blacklist = entries.filter((e) => e.type === 'blacklist');

  // Calculate slash statistics for transparency
  const allDeposits = await db
    .select()
    .from(deposits)
    .where(eq(deposits.repoId, repoId));

  const totalDeposits = allDeposits.length;
  const slashedDeposits = allDeposits.filter(d => d.status === 'slashed').length;
  const refundedDeposits = allDeposits.filter(d => d.status === 'refunded').length;
  const completedDeposits = slashedDeposits + refundedDeposits;
  const slashRatio = completedDeposits > 0 ? Math.round((slashedDeposits / completedDeposits) * 100) : 0;

  return c.json({
    repository: {
      id: repo.id,
      githubId: repo.githubId,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      treasuryAddress: repo.treasuryAddress,
      riskThreshold: repo.riskThreshold,
      depositAmount: repo.depositAmount,
      isActive: repo.isActive,
    },
    whitelist,
    blacklist,
    stats: {
      totalDeposits,
      slashedDeposits,
      refundedDeposits,
      slashRatio, // Percentage of slashed vs completed
    },
  });
});

/**
 * PUT /api/repos/:id
 * Update repo settings
 */
repoRoutes.put('/:id', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const repoId = c.req.param('id');
  const db = c.get('db');

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Check if user has write access to this repo
  const hasAccess = await checkRepoWriteAccess(c, auth.userId, repo.owner, repo.name);
  if (!hasAccess) {
    return c.json({ error: 'You do not have write access to this repository' }, 403);
  }

  const updateSchema = z.object({
    treasuryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
    riskThreshold: z.number().min(0).max(100).optional(),
    depositAmount: z.string().optional(),
    isActive: z.boolean().optional(),
  });

  try {
    const body = await c.req.json();
    const updates = updateSchema.parse(body);

    await db
      .update(repositories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(repositories.id, repoId));

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input' }, 400);
    }
    throw error;
  }
});

/**
 * POST /api/repos/:id/whitelist
 * Add user to whitelist
 */
repoRoutes.post('/:id/whitelist', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const repoId = c.req.param('id');
  const db = c.get('db');

  // Get repo and check permissions
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));
  if (!repo) return c.json({ error: 'Repository not found' }, 404);

  const hasAccess = await checkRepoWriteAccess(c, auth.userId, repo.owner, repo.name);
  if (!hasAccess) {
    return c.json({ error: 'You do not have write access to this repository' }, 403);
  }

  const schema = z.object({
    userId: z.string(),
    reason: z.string().optional(),
  });

  try {
    const body = await c.req.json();
    const { userId, reason } = schema.parse(body);

    // Check if entry already exists
    const [existing] = await db
      .select()
      .from(repoUserEntries)
      .where(
        and(
          eq(repoUserEntries.repoId, repoId),
          eq(repoUserEntries.userId, userId),
          eq(repoUserEntries.type, 'whitelist')
        )
      );

    if (existing) {
      return c.json({ error: 'User already whitelisted' }, 400);
    }

    // Remove from blacklist if present
    await db
      .delete(repoUserEntries)
      .where(
        and(
          eq(repoUserEntries.repoId, repoId),
          eq(repoUserEntries.userId, userId),
          eq(repoUserEntries.type, 'blacklist')
        )
      );

    await db.insert(repoUserEntries).values({
      id: uuid(),
      repoId,
      userId,
      type: 'whitelist',
      reason,
      addedById: auth.userId,
      createdAt: new Date(),
    });

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input' }, 400);
    }
    throw error;
  }
});

/**
 * POST /api/repos/:id/blacklist
 * Add user to blacklist
 */
repoRoutes.post('/:id/blacklist', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const repoId = c.req.param('id');
  const db = c.get('db');

  // Get repo and check permissions
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));
  if (!repo) return c.json({ error: 'Repository not found' }, 404);

  const hasAccess = await checkRepoWriteAccess(c, auth.userId, repo.owner, repo.name);
  if (!hasAccess) {
    return c.json({ error: 'You do not have write access to this repository' }, 403);
  }

  const schema = z.object({
    userId: z.string(),
    reason: z.string().optional(),
  });

  try {
    const body = await c.req.json();
    const { userId, reason } = schema.parse(body);

    // Check if entry already exists
    const [existing] = await db
      .select()
      .from(repoUserEntries)
      .where(
        and(
          eq(repoUserEntries.repoId, repoId),
          eq(repoUserEntries.userId, userId),
          eq(repoUserEntries.type, 'blacklist')
        )
      );

    if (existing) {
      return c.json({ error: 'User already blacklisted' }, 400);
    }

    // Remove from whitelist if present
    await db
      .delete(repoUserEntries)
      .where(
        and(
          eq(repoUserEntries.repoId, repoId),
          eq(repoUserEntries.userId, userId),
          eq(repoUserEntries.type, 'whitelist')
        )
      );

    await db.insert(repoUserEntries).values({
      id: uuid(),
      repoId,
      userId,
      type: 'blacklist',
      reason,
      addedById: auth.userId,
      createdAt: new Date(),
    });

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input' }, 400);
    }
    throw error;
  }
});

/**
 * DELETE /api/repos/:id/whitelist/:userId
 * Remove user from whitelist
 */
repoRoutes.delete('/:id/whitelist/:userId', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const repoId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  const db = c.get('db');

  // Get repo and check permissions
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));
  if (!repo) return c.json({ error: 'Repository not found' }, 404);

  const hasAccess = await checkRepoWriteAccess(c, auth.userId, repo.owner, repo.name);
  if (!hasAccess) {
    return c.json({ error: 'You do not have write access to this repository' }, 403);
  }

  await db
    .delete(repoUserEntries)
    .where(
      and(
        eq(repoUserEntries.repoId, repoId),
        eq(repoUserEntries.userId, targetUserId),
        eq(repoUserEntries.type, 'whitelist')
      )
    );

  return c.json({ success: true });
});

/**
 * DELETE /api/repos/:id/blacklist/:userId
 * Remove user from blacklist
 */
repoRoutes.delete('/:id/blacklist/:userId', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const repoId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  const db = c.get('db');

  // Get repo and check permissions
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));
  if (!repo) return c.json({ error: 'Repository not found' }, 404);

  const hasAccess = await checkRepoWriteAccess(c, auth.userId, repo.owner, repo.name);
  if (!hasAccess) {
    return c.json({ error: 'You do not have write access to this repository' }, 403);
  }

  await db
    .delete(repoUserEntries)
    .where(
      and(
        eq(repoUserEntries.repoId, repoId),
        eq(repoUserEntries.userId, targetUserId),
        eq(repoUserEntries.type, 'blacklist')
      )
    );

  return c.json({ success: true });
});

/**
 * GET /api/repos/:id/stats
 * Get repository statistics including slash ratio (public endpoint for transparency)
 */
repoRoutes.get('/:id/stats', async (c) => {
  const repoId = c.req.param('id');
  const db = c.get('db');

  // Get repo
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Get deposit statistics
  const allDeposits = await db
    .select()
    .from(deposits)
    .where(eq(deposits.repoId, repoId));

  const totalDeposits = allDeposits.length;
  const slashedDeposits = allDeposits.filter(d => d.status === 'slashed').length;
  const refundedDeposits = allDeposits.filter(d => d.status === 'refunded').length;
  const confirmedDeposits = allDeposits.filter(d => d.status === 'confirmed').length;

  // Calculate slash ratio (slashed / total completed deposits)
  const completedDeposits = slashedDeposits + refundedDeposits;
  const slashRatio = completedDeposits > 0 ? slashedDeposits / completedDeposits : 0;

  return c.json({
    repository: {
      id: repo.id,
      fullName: repo.fullName,
      owner: repo.owner,
      name: repo.name,
    },
    stats: {
      totalDeposits,
      confirmedDeposits, // Active/pending resolution
      refundedDeposits,
      slashedDeposits,
      completedDeposits,
      slashRatio: Math.round(slashRatio * 100), // Percentage
    },
  });
});

/**
 * GET /api/repos/:id/slash-history
 * Get public slash history for transparency (public endpoint)
 */
repoRoutes.get('/:id/slash-history', async (c) => {
  const repoId = c.req.param('id');
  const db = c.get('db');

  // Get repo
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Get slashed deposits with user info
  const slashedDeposits = await db
    .select({
      id: deposits.id,
      amount: deposits.amount,
      slashReason: deposits.slashReason,
      slashedAt: deposits.slashedAt,
      slashedById: deposits.slashedById,
      createdAt: deposits.createdAt,
    })
    .from(deposits)
    .where(and(eq(deposits.repoId, repoId), eq(deposits.status, 'slashed')))
    .orderBy(desc(deposits.slashedAt));

  // Get slasher usernames
  const slashHistory = await Promise.all(
    slashedDeposits.map(async (deposit) => {
      let slashedByLogin = 'Unknown';
      if (deposit.slashedById) {
        const [slasher] = await db
          .select({ login: users.login })
          .from(users)
          .where(eq(users.id, deposit.slashedById));
        if (slasher) slashedByLogin = slasher.login;
      }

      return {
        id: deposit.id,
        amount: deposit.amount,
        reason: deposit.slashReason || 'No reason provided (legacy)',
        slashedAt: deposit.slashedAt,
        slashedBy: slashedByLogin,
        depositedAt: deposit.createdAt,
      };
    })
  );

  return c.json({
    repository: {
      id: repo.id,
      fullName: repo.fullName,
    },
    slashHistory,
    totalSlashes: slashHistory.length,
  });
});
