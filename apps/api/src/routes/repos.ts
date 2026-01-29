import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { repositories, users, repoUserEntries } from '@codereserve/db';
import type { AppContext } from '../index';

export const repoRoutes = new Hono<AppContext>();

// Auth middleware
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
 * GET /api/repos
 * List repos where user is a maintainer
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
  const repos = await db.select().from(repositories).where(eq(repositories.isActive, true));

  // Filter to repos where user has write access (would need to check each one)
  // For now, return all repos (frontend will filter)
  return c.json({
    repositories: repos.map((r) => ({
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
 * Get repo details
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

  // TODO: Check if user has write access to this repo

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
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
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
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
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
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
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
  const userId = c.req.param('userId');
  const db = c.get('db');

  await db
    .delete(repoUserEntries)
    .where(
      and(
        eq(repoUserEntries.repoId, repoId),
        eq(repoUserEntries.userId, userId),
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
  const userId = c.req.param('userId');
  const db = c.get('db');

  await db
    .delete(repoUserEntries)
    .where(
      and(
        eq(repoUserEntries.repoId, repoId),
        eq(repoUserEntries.userId, userId),
        eq(repoUserEntries.type, 'blacklist')
      )
    );

  return c.json({ success: true });
});
