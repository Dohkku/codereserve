import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { users } from '@codereserve/db';
import type { AppContext } from '../index';

export const authRoutes = new Hono<AppContext>();

// GitHub OAuth callback schema
const callbackSchema = z.object({
  code: z.string(),
});

/**
 * GET /api/auth/github
 * Redirect to GitHub OAuth
 */
authRoutes.get('/github', (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.API_URL || 'http://localhost:3001'}/api/auth/github/callback`;

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId || '');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'read:user user:email');

  return c.redirect(authUrl.toString());
});

/**
 * GET /api/auth/github/callback
 * Handle GitHub OAuth callback
 */
authRoutes.get('/github/callback', async (c) => {
  const code = c.req.query('code');

  if (!code) {
    return c.json({ error: 'Missing code parameter' }, 400);
  }

  try {
    const githubService = c.get('githubService');
    const db = c.get('db');

    // Exchange code for token
    const { accessToken } = await githubService.exchangeCodeForToken(code);

    // Get user info
    const userInfo = await githubService.getAuthenticatedUser(accessToken);

    // Upsert user
    let [userRecord] = await db
      .select()
      .from(users)
      .where(eq(users.githubId, userInfo.id));

    if (!userRecord) {
      const userId = uuid();
      await db.insert(users).values({
        id: userId,
        githubId: userInfo.id,
        login: userInfo.login,
        email: userInfo.email,
        avatarUrl: userInfo.avatarUrl,
        accessToken, // TODO: Encrypt this
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      [userRecord] = await db.select().from(users).where(eq(users.id, userId));
    } else {
      await db
        .update(users)
        .set({
          login: userInfo.login,
          email: userInfo.email,
          avatarUrl: userInfo.avatarUrl,
          accessToken,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRecord.id));
    }

    // Generate session token (simple JWT-like token for now)
    // In production, use proper JWT with signing
    const sessionToken = Buffer.from(
      JSON.stringify({
        userId: userRecord.id,
        githubId: userInfo.id,
        login: userInfo.login,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      })
    ).toString('base64');

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return c.redirect(`${frontendUrl}/auth/callback?token=${sessionToken}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return c.redirect(`${frontendUrl}/auth/callback?error=auth_failed`);
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

    if (decoded.exp < Date.now()) {
      return c.json({ error: 'Token expired' }, 401);
    }

    const db = c.get('db');
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId));

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      id: user.id,
      githubId: user.githubId,
      login: user.login,
      email: user.email,
      avatarUrl: user.avatarUrl,
      walletAddress: user.walletAddress,
    });
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

/**
 * PUT /api/auth/wallet
 * Link wallet address to user
 */
authRoutes.put('/wallet', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

    if (decoded.exp < Date.now()) {
      return c.json({ error: 'Token expired' }, 401);
    }

    const body = await c.req.json();
    const walletAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/).parse(body.walletAddress);

    const db = c.get('db');
    await db
      .update(users)
      .set({ walletAddress, updatedAt: new Date() })
      .where(eq(users.id, decoded.userId));

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid wallet address' }, 400);
    }
    return c.json({ error: 'Invalid token' }, 401);
  }
});
