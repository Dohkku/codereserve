import { Context } from 'hono';
import { Webhooks } from '@octokit/webhooks';
import { v4 as uuid } from 'uuid';
import { eq, and } from 'drizzle-orm';
import {
  users,
  repositories,
  pullRequests,
  webhookEvents,
  repoUserEntries,
} from '@codereserve/db';
import { calculateRiskScore, getAccountAgeDays } from '../services/riskCalculator';
import type { AppContext } from '../index';

// Lazy-load webhooks instance only when secret is available
let webhooks: Webhooks | null = null;

function getWebhooks(): Webhooks | null {
  if (webhooks) return webhooks;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    webhooks = new Webhooks({ secret });
  }
  return webhooks;
}

export async function githubWebhookHandler(c: Context<AppContext>) {
  const signature = c.req.header('x-hub-signature-256') || '';
  const deliveryId = c.req.header('x-github-delivery') || '';
  const eventType = c.req.header('x-github-event') || '';

  const body = await c.req.text();

  // Verify signature (skip in development if no secret configured)
  const wh = getWebhooks();
  if (wh) {
    try {
      const isValid = await wh.verify(body, signature);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return c.json({ error: 'Invalid signature' }, 401);
      }
    } catch (error) {
      console.error('Signature verification error:', error);
      return c.json({ error: 'Signature verification failed' }, 401);
    }
  } else {
    console.warn('GITHUB_WEBHOOK_SECRET not set - skipping signature verification (dev mode)');
  }

  const payload = JSON.parse(body);
  const db = c.get('db');

  // Log webhook event
  try {
    await db.insert(webhookEvents).values({
      id: uuid(),
      eventType,
      action: payload.action,
      deliveryId,
      payload: body,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Error logging webhook event:', error);
  }

  // Handle events
  try {
    if (eventType === 'pull_request') {
      await handlePullRequest(c, payload);
    } else if (eventType === 'installation') {
      await handleInstallation(c, payload);
    } else if (eventType === 'installation_repositories') {
      await handleInstallationRepositories(c, payload);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error handling webhook:', error);

    // Update webhook event with error
    try {
      await db
        .update(webhookEvents)
        .set({
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(webhookEvents.deliveryId, deliveryId));
    } catch {}

    return c.json({ error: 'Webhook processing failed' }, 500);
  }
}

async function handlePullRequest(c: Context<AppContext>, payload: any) {
  const { action, pull_request: pr, repository: repo, installation } = payload;

  if (!['opened', 'reopened', 'synchronize'].includes(action)) {
    return;
  }

  const db = c.get('db');
  const githubService = c.get('githubService');

  // Check if repo is registered
  const [repoRecord] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.githubId, repo.id));

  if (!repoRecord || !repoRecord.isActive) {
    console.log(`Repository ${repo.full_name} not registered or inactive`);
    return;
  }

  // Get or create user
  let [userRecord] = await db
    .select()
    .from(users)
    .where(eq(users.githubId, pr.user.id));

  if (!userRecord) {
    const newUserId = uuid();
    await db.insert(users).values({
      id: newUserId,
      githubId: pr.user.id,
      login: pr.user.login,
      avatarUrl: pr.user.avatar_url,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    [userRecord] = await db.select().from(users).where(eq(users.id, newUserId));
  }

  // Get installation Octokit
  const octokit = await githubService.getInstallationOctokit(installation.id);

  // Check whitelist/blacklist
  const [whitelistEntry] = await db
    .select()
    .from(repoUserEntries)
    .where(
      and(
        eq(repoUserEntries.repoId, repoRecord.id),
        eq(repoUserEntries.userId, userRecord.id),
        eq(repoUserEntries.type, 'whitelist')
      )
    );

  const [blacklistEntry] = await db
    .select()
    .from(repoUserEntries)
    .where(
      and(
        eq(repoUserEntries.repoId, repoRecord.id),
        eq(repoUserEntries.userId, userRecord.id),
        eq(repoUserEntries.type, 'blacklist')
      )
    );

  // Get additional user info for risk calculation
  const userInfo = await githubService.getUserInfo(octokit, pr.user.login);
  const mergedPRCount = await githubService.getMergedPRCount(
    octokit,
    repo.owner.login,
    repo.name,
    pr.user.login
  );

  // Calculate risk score
  const riskResult = calculateRiskScore(
    {
      accountAgeDays: getAccountAgeDays(userInfo.createdAt),
      mergedPRCount,
      emailVerified: !!userInfo.email,
      followerCount: userInfo.followers,
      isWhitelisted: !!whitelistEntry,
      isBlacklisted: !!blacklistEntry,
    },
    repoRecord.riskThreshold
  );

  // Create or update PR record
  const [existingPR] = await db
    .select()
    .from(pullRequests)
    .where(eq(pullRequests.githubId, pr.id));

  const prId = existingPR?.id || uuid();

  if (existingPR) {
    await db
      .update(pullRequests)
      .set({
        title: pr.title,
        state: riskResult.requiresDeposit ? 'pending_deposit' : 'open',
        riskScore: riskResult.score,
        depositRequired: riskResult.requiresDeposit,
        headSha: pr.head.sha,
        updatedAt: new Date(),
      })
      .where(eq(pullRequests.id, existingPR.id));
  } else {
    await db.insert(pullRequests).values({
      id: prId,
      githubId: pr.id,
      repoId: repoRecord.id,
      authorId: userRecord.id,
      number: pr.number,
      title: pr.title,
      state: riskResult.requiresDeposit ? 'pending_deposit' : 'open',
      riskScore: riskResult.score,
      depositRequired: riskResult.requiresDeposit,
      headSha: pr.head.sha,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const dashboardUrl = process.env.FRONTEND_URL || 'https://codereserve.io';
  const depositAmount = (Number(repoRecord.depositAmount) / 1_000_000).toFixed(2);

  if (riskResult.requiresDeposit) {
    // Close PR and add instructions
    const comment = githubService.generateDepositComment(
      repo.full_name,
      pr.number,
      depositAmount,
      dashboardUrl
    );

    await githubService.closePRWithComment(
      octokit,
      repo.owner.login,
      repo.name,
      pr.number,
      comment
    );

    await githubService.addLabel(
      octokit,
      repo.owner.login,
      repo.name,
      pr.number,
      'CR-Pending-Deposit'
    );

    console.log(
      `PR #${pr.number} in ${repo.full_name} closed - deposit required (score: ${riskResult.score})`
    );
  } else {
    // Trusted contributor
    await githubService.addLabel(
      octokit,
      repo.owner.login,
      repo.name,
      pr.number,
      'CR-Trusted'
    );

    console.log(
      `PR #${pr.number} in ${repo.full_name} approved - trusted (score: ${riskResult.score})`
    );
  }
}

async function handleInstallation(c: Context<AppContext>, payload: any) {
  const { action, installation, repositories: repos } = payload;
  const db = c.get('db');

  if (action === 'created') {
    // Installation created - add repositories
    for (const repo of repos || []) {
      const existing = await db
        .select()
        .from(repositories)
        .where(eq(repositories.githubId, repo.id));

      if (existing.length === 0) {
        await db.insert(repositories).values({
          id: uuid(),
          githubId: repo.id,
          owner: installation.account.login,
          name: repo.name,
          fullName: repo.full_name,
          installationId: installation.id,
          treasuryAddress: '0x0000000000000000000000000000000000000000', // To be configured
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    console.log(`Installation ${installation.id} created for ${installation.account.login}`);
  } else if (action === 'deleted') {
    // Installation deleted - deactivate repositories
    await db
      .update(repositories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(repositories.installationId, installation.id));

    console.log(`Installation ${installation.id} deleted`);
  }
}

async function handleInstallationRepositories(c: Context<AppContext>, payload: any) {
  const { action, installation, repositories_added, repositories_removed } = payload;
  const db = c.get('db');

  // Add new repositories
  for (const repo of repositories_added || []) {
    const existing = await db
      .select()
      .from(repositories)
      .where(eq(repositories.githubId, repo.id));

    if (existing.length === 0) {
      await db.insert(repositories).values({
        id: uuid(),
        githubId: repo.id,
        owner: installation.account.login,
        name: repo.name,
        fullName: repo.full_name,
        installationId: installation.id,
        treasuryAddress: '0x0000000000000000000000000000000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      await db
        .update(repositories)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(repositories.githubId, repo.id));
    }
  }

  // Deactivate removed repositories
  for (const repo of repositories_removed || []) {
    await db
      .update(repositories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(repositories.githubId, repo.id));
  }

  console.log(
    `Installation ${installation.id}: +${repositories_added?.length || 0} -${repositories_removed?.length || 0} repos`
  );
}
