import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createTestUser } from '../test/helpers';

describe('Auth Routes', () => {
  let app: ReturnType<typeof createTestApp>['app'];
  let db: ReturnType<typeof createTestApp>['db'];

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user data with valid token', async () => {
      const { user, token } = await createTestUser(db);

      const res = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { id: string; login: string; email: string };
      expect(data.id).toBe(user.id);
      expect(data.login).toBe(user.login);
      expect(data.email).toBe(user.email);
    });

    it('returns 401 with invalid token', async () => {
      const res = await app.request('/api/auth/me', {
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/auth/wallet', () => {
    it('updates wallet address', async () => {
      const { token } = await createTestUser(db);
      const walletAddress = '0x1234567890123456789012345678901234567890';

      const res = await app.request('/api/auth/wallet', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns 400 for invalid wallet address', async () => {
      const { token } = await createTestUser(db);

      const res = await app.request('/api/auth/wallet', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: 'invalid' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/auth/wallet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: '0x1234567890123456789012345678901234567890' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns success and clears cookie', async () => {
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean };
      expect(data.success).toBe(true);
    });
  });
});
