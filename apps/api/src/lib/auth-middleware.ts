import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { users } from '@codereserve/db';
import { verifyToken } from './jwt';

export interface AuthUser {
  id: string;
  githubId: number;
  login: string;
  email: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * Middleware that requires authentication
 * Sets c.get('user') on success
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Fetch user from database
  const db = c.get('db');
  const [user] = await db
    .select({
      id: users.id,
      githubId: users.githubId,
      login: users.login,
      email: users.email,
      avatarUrl: users.avatarUrl,
      walletAddress: users.walletAddress,
    })
    .from(users)
    .where(eq(users.id, decoded.userId));

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  c.set('user', user);

  await next();
}

/**
 * Optional auth - sets user if token present, continues anyway
 */
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    if (decoded) {
      const db = c.get('db');
      const [user] = await db
        .select({
          id: users.id,
          githubId: users.githubId,
          login: users.login,
          email: users.email,
          avatarUrl: users.avatarUrl,
          walletAddress: users.walletAddress,
        })
        .from(users)
        .where(eq(users.id, decoded.userId));

      if (user) {
        c.set('user', user);
      }
    }
  }

  await next();
}
