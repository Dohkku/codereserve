import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { pullRequests, repositories, users, deposits } from '@codereserve/db';
import type { AppContext } from '../index';
import { verifyToken } from '../lib';

export const prRoutes = new Hono<AppContext>();

// Auth helper using JWT
async function getAuthUser(c: any): Promise<{ userId: string; login: string; githubId: number } | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  return verifyToken(token);
}

// Permission check helper using injected GitHub service
async function checkMaintainerAccess(
  c: any,
  userId: string,
  repo: { owner: string; name: string; installationId: number }
): Promise<boolean> {
  const db = c.get('db');
  const githubService = c.get('githubService');

  // Get user
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return false;

  try {
    const octokit = await githubService.getInstallationOctokit(repo.installationId);
    return await githubService.hasWriteAccess(octokit, repo.owner, repo.name, user.login);
  } catch {
    return false;
  }
}

/**
 * GET /api/prs
 * List PRs for a repository
 */
prRoutes.get('/', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const repoId = c.req.query('repoId');
  const state = c.req.query('state');
  // Bounds check: limit 1-100, offset >= 0
  const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') || '50', 10) || 50), 100);
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0);

  const db = c.get('db');

  let query = db
    .select({
      pr: pullRequests,
      author: {
        id: users.id,
        login: users.login,
        avatarUrl: users.avatarUrl,
      },
      repo: {
        id: repositories.id,
        fullName: repositories.fullName,
      },
    })
    .from(pullRequests)
    .leftJoin(users, eq(pullRequests.authorId, users.id))
    .leftJoin(repositories, eq(pullRequests.repoId, repositories.id));

  if (repoId) {
    query = query.where(eq(pullRequests.repoId, repoId)) as any;
  }

  const results = await query
    .orderBy(desc(pullRequests.createdAt))
    .limit(limit)
    .offset(offset);

  // Filter by state in memory if needed (SQLite doesn't support dynamic where easily)
  const filtered = state
    ? results.filter((r) => r.pr.state === state)
    : results;

  return c.json({
    pullRequests: filtered.map(({ pr, author, repo }) => ({
      id: pr.id,
      githubId: pr.githubId,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      riskScore: pr.riskScore,
      depositRequired: pr.depositRequired,
      depositId: pr.depositId,
      author,
      repository: repo,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
    })),
  });
});

/**
 * GET /api/prs/:id
 * Get PR details
 */
prRoutes.get('/:id', async (c) => {
  const prId = c.req.param('id');
  const db = c.get('db');

  const [result] = await db
    .select({
      pr: pullRequests,
      author: {
        id: users.id,
        login: users.login,
        avatarUrl: users.avatarUrl,
      },
      repo: {
        id: repositories.id,
        fullName: repositories.fullName,
      },
    })
    .from(pullRequests)
    .leftJoin(users, eq(pullRequests.authorId, users.id))
    .leftJoin(repositories, eq(pullRequests.repoId, repositories.id))
    .where(eq(pullRequests.id, prId));

  if (!result) {
    return c.json({ error: 'Pull request not found' }, 404);
  }

  // Get deposit if exists
  let deposit = null;
  if (result.pr.depositId) {
    const [dep] = await db
      .select()
      .from(deposits)
      .where(eq(deposits.id, result.pr.depositId));
    deposit = dep;
  }

  return c.json({
    pullRequest: {
      id: result.pr.id,
      githubId: result.pr.githubId,
      number: result.pr.number,
      title: result.pr.title,
      state: result.pr.state,
      riskScore: result.pr.riskScore,
      depositRequired: result.pr.depositRequired,
      headSha: result.pr.headSha,
      author: result.author,
      repository: result.repo,
      deposit,
      createdAt: result.pr.createdAt,
      updatedAt: result.pr.updatedAt,
    },
  });
});

/**
 * GET /api/prs/user/me
 * Get PRs for authenticated user
 */
prRoutes.get('/user/me', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.get('db');

  const results = await db
    .select({
      pr: pullRequests,
      repo: {
        id: repositories.id,
        fullName: repositories.fullName,
      },
    })
    .from(pullRequests)
    .leftJoin(repositories, eq(pullRequests.repoId, repositories.id))
    .where(eq(pullRequests.authorId, auth.userId))
    .orderBy(desc(pullRequests.createdAt));

  return c.json({
    pullRequests: results.map(({ pr, repo }) => ({
      id: pr.id,
      githubId: pr.githubId,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      riskScore: pr.riskScore,
      depositRequired: pr.depositRequired,
      depositId: pr.depositId,
      repository: repo,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
    })),
  });
});

/**
 * POST /api/prs/:id/mark-spam
 * Mark a PR as spam (maintainer action)
 */
prRoutes.post('/:id/mark-spam', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const prId = c.req.param('id');
  const db = c.get('db');
  const githubService = c.get('githubService');

  // Get PR
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, prId));

  if (!pr) {
    return c.json({ error: 'Pull request not found' }, 404);
  }

  // Get repo
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, pr.repoId));

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Check maintainer permissions
  const hasAccess = await checkMaintainerAccess(c, auth.userId, repo);
  if (!hasAccess) {
    return c.json({ error: 'You do not have maintainer access to this repository' }, 403);
  }

  // If there's a deposit, redirect to slash endpoint
  if (pr.depositId) {
    return c.json({
      requiresSlash: true,
      depositId: pr.depositId,
      message: 'This PR has a deposit. Use /api/deposits/:id/slash to mark as spam and slash the deposit.',
    });
  }

  // Otherwise just close the PR and add spam label
  try {
    const octokit = await githubService.getInstallationOctokit(repo.installationId);

    await githubService.closePRWithComment(
      octokit,
      repo.owner,
      repo.name,
      pr.number,
      '## CodeReserve: Spam\n\nThis PR has been marked as spam by a maintainer.\n\n---\n*This is an automated message from [CodeReserve](https://codereserve.io)*'
    );

    await githubService.addLabel(octokit, repo.owner, repo.name, pr.number, 'CR-Spam');

    // Update PR state
    await db
      .update(pullRequests)
      .set({ state: 'closed', updatedAt: new Date() })
      .where(eq(pullRequests.id, prId));

    return c.json({ success: true });
  } catch (error) {
    console.error('Mark spam error:', error);
    return c.json({ error: 'Failed to mark as spam' }, 500);
  }
});

/**
 * POST /api/prs/:id/approve
 * Manually approve a PR (for trusted contributors)
 */
prRoutes.post('/:id/approve', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const prId = c.req.param('id');
  const db = c.get('db');
  const githubService = c.get('githubService');

  // Get PR
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, prId));

  if (!pr) {
    return c.json({ error: 'Pull request not found' }, 404);
  }

  // Get repo
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, pr.repoId));

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Check maintainer permissions
  const hasAccess = await checkMaintainerAccess(c, auth.userId, repo);
  if (!hasAccess) {
    return c.json({ error: 'You do not have maintainer access to this repository' }, 403);
  }

  try {
    const octokit = await githubService.getInstallationOctokit(repo.installationId);

    // Reopen PR if closed
    if (pr.state === 'pending_deposit' || pr.state === 'closed') {
      await githubService.reopenPR(
        octokit,
        repo.owner,
        repo.name,
        pr.number,
        '## CodeReserve: Approved\n\nThis PR has been manually approved by a maintainer.\n\n---\n*This is an automated message from [CodeReserve](https://codereserve.io)*'
      );
    }

    await githubService.removeLabel(octokit, repo.owner, repo.name, pr.number, 'CR-Pending-Deposit');
    await githubService.addLabel(octokit, repo.owner, repo.name, pr.number, 'CR-Trusted');

    // Update PR state
    await db
      .update(pullRequests)
      .set({
        state: 'open',
        depositRequired: false,
        updatedAt: new Date(),
      })
      .where(eq(pullRequests.id, prId));

    return c.json({ success: true });
  } catch (error) {
    console.error('Approve error:', error);
    return c.json({ error: 'Failed to approve PR' }, 500);
  }
});
