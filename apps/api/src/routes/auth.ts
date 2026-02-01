import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { users } from '@codereserve/db';
import type { AppContext } from '../index';
import { encrypt, signToken, verifyToken } from '../lib';
import { authRateLimit } from '../lib/rate-limit';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';

export const authRoutes = new Hono<AppContext>();

// Cookie configuration
const COOKIE_NAME = 'cr_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Helper to get token from cookie or Authorization header
function getSessionToken(c: any): string | null {
  // First try cookie (preferred)
  const cookieToken = getCookie(c, COOKIE_NAME);
  if (cookieToken) return cookieToken;

  // Fallback to Authorization header (for API clients)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

// Apply stricter rate limiting to auth endpoints
authRoutes.use('*', authRateLimit);

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

    // Encrypt the access token before storing
    const encryptedToken = encrypt(accessToken);

    if (!userRecord) {
      const userId = uuid();
      await db.insert(users).values({
        id: userId,
        githubId: userInfo.id,
        login: userInfo.login,
        email: userInfo.email,
        avatarUrl: userInfo.avatarUrl,
        accessToken: encryptedToken,
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
          accessToken: encryptedToken,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRecord.id));
    }

    // Generate signed JWT session token
    const sessionToken = signToken({
      userId: userRecord.id,
      githubId: userInfo.id,
      login: userInfo.login,
    });

    // Set httpOnly cookie
    setCookie(c, COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: isProduction() ? 'Strict' : 'Lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });

    // Redirect to frontend (no token in URL)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return c.redirect(`${frontendUrl}/auth/callback`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return c.redirect(`${frontendUrl}/auth/callback?error=auth_failed`);
  }
});

/**
 * GET /api/auth/me
 * Get current user info (reads from cookie or Authorization header)
 */
authRoutes.get('/me', async (c) => {
  const token = getSessionToken(c);

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return c.json({ error: 'Invalid or expired token' }, 401);
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
});

/**
 * PUT /api/auth/wallet
 * Link wallet address to user
 */
authRoutes.put('/wallet', async (c) => {
  const token = getSessionToken(c);

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  try {
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
    throw error;
  }
});

/**
 * POST /api/auth/logout
 * Clear session cookie
 */
authRoutes.post('/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
  });
  return c.json({ success: true });
});
