import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestApp,
  createTestUser,
  createTestRepo,
  createTestPR,
  createTestDeposit,
} from '../test/helpers';

describe('Repos Routes', () => {
  describe('with write access', () => {
    let app: ReturnType<typeof createTestApp>['app'];
    let db: ReturnType<typeof createTestApp>['db'];

    beforeEach(() => {
      const testApp = createTestApp({ hasWriteAccess: true });
      app = testApp.app;
      db = testApp.db;
    });

    describe('GET /api/repos', () => {
      it('returns 401 without auth', async () => {
        const res = await app.request('/api/repos');
        expect(res.status).toBe(401);
      });

      it('returns repositories list', async () => {
        const { token } = await createTestUser(db);
        await createTestRepo(db, { fullName: 'org/repo1' });
        await createTestRepo(db, { githubId: 99999, fullName: 'org/repo2' });

        const res = await app.request('/api/repos', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.repositories).toHaveLength(2);
      });
    });

    describe('GET /api/repos/:id', () => {
      it('returns repository details', async () => {
        const { token } = await createTestUser(db);
        const repo = await createTestRepo(db);

        const res = await app.request(`/api/repos/${repo.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.repository.id).toBe(repo.id);
        expect(data.repository.fullName).toBe(repo.fullName);
      });

      it('returns 404 for non-existent repo', async () => {
        const { token } = await createTestUser(db);

        const res = await app.request('/api/repos/non-existent', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(404);
      });
    });

    describe('PUT /api/repos/:id', () => {
      it('updates repository settings', async () => {
        const { token } = await createTestUser(db);
        const repo = await createTestRepo(db);

        const res = await app.request(`/api/repos/${repo.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            riskThreshold: 80,
            depositAmount: '10000000',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      });

      it('validates treasury address format', async () => {
        const { token } = await createTestUser(db);
        const repo = await createTestRepo(db);

        const res = await app.request(`/api/repos/${repo.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            treasuryAddress: 'invalid-address',
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /api/repos/:id/whitelist', () => {
      it('adds user to whitelist', async () => {
        const { user, token } = await createTestUser(db);
        const { user: otherUser } = await createTestUser(db, {
          githubId: 99999,
          login: 'otheruser',
        });
        const repo = await createTestRepo(db);

        const res = await app.request(`/api/repos/${repo.id}/whitelist`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: otherUser.id,
            reason: 'Trusted contributor',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      });

      it('returns error for duplicate whitelist entry', async () => {
        const { token } = await createTestUser(db);
        const { user: otherUser } = await createTestUser(db, {
          githubId: 99999,
          login: 'otheruser',
        });
        const repo = await createTestRepo(db);

        // First request
        await app.request(`/api/repos/${repo.id}/whitelist`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: otherUser.id }),
        });

        // Second request (duplicate)
        const res = await app.request(`/api/repos/${repo.id}/whitelist`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: otherUser.id }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /api/repos/:id/blacklist', () => {
      it('adds user to blacklist', async () => {
        const { token } = await createTestUser(db);
        const { user: spammer } = await createTestUser(db, {
          githubId: 99999,
          login: 'spammer',
        });
        const repo = await createTestRepo(db);

        const res = await app.request(`/api/repos/${repo.id}/blacklist`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: spammer.id,
            reason: 'Spam PRs',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      });
    });

    describe('GET /api/repos/:id/stats', () => {
      it('returns repository statistics (public endpoint)', async () => {
        const { user } = await createTestUser(db);
        const repo = await createTestRepo(db);

        // Create some test deposits
        const pr1 = await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 1 });
        const pr2 = await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 2 });
        const pr3 = await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 3 });

        await createTestDeposit(db, { prId: pr1.id, userId: user.id, repoId: repo.id, status: 'refunded' });
        await createTestDeposit(db, { prId: pr2.id, userId: user.id, repoId: repo.id, status: 'slashed' });
        await createTestDeposit(db, { prId: pr3.id, userId: user.id, repoId: repo.id, status: 'confirmed' });

        // No auth needed - public endpoint
        const res = await app.request(`/api/repos/${repo.id}/stats`);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.stats.totalDeposits).toBe(3);
        expect(data.stats.slashedDeposits).toBe(1);
        expect(data.stats.refundedDeposits).toBe(1);
        expect(data.stats.confirmedDeposits).toBe(1);
        expect(data.stats.slashRatio).toBe(50); // 1 slashed out of 2 completed = 50%
      });

      it('returns 404 for non-existent repo', async () => {
        const res = await app.request('/api/repos/non-existent/stats');
        expect(res.status).toBe(404);
      });
    });

    describe('GET /api/repos/:id/slash-history', () => {
      it('returns slash history (public endpoint)', async () => {
        const { user } = await createTestUser(db);
        const repo = await createTestRepo(db);

        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'slashed',
          slashReason: 'Spam PR with promotional content',
          slashedById: user.id,
        });

        // No auth needed - public endpoint
        const res = await app.request(`/api/repos/${repo.id}/slash-history`);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.totalSlashes).toBe(1);
        expect(data.slashHistory[0].reason).toBe('Spam PR with promotional content');
      });

      it('returns 404 for non-existent repo', async () => {
        const res = await app.request('/api/repos/non-existent/slash-history');
        expect(res.status).toBe(404);
      });
    });
  });

  describe('without write access', () => {
    let app: ReturnType<typeof createTestApp>['app'];
    let db: ReturnType<typeof createTestApp>['db'];

    beforeEach(() => {
      const testApp = createTestApp({ hasWriteAccess: false });
      app = testApp.app;
      db = testApp.db;
    });

    it('returns 403 when updating repo without write access', async () => {
      const { token } = await createTestUser(db);
      const repo = await createTestRepo(db);

      const res = await app.request(`/api/repos/${repo.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ riskThreshold: 80 }),
      });

      expect(res.status).toBe(403);
    });

    it('returns 403 when adding to whitelist without write access', async () => {
      const { token } = await createTestUser(db);
      const { user: otherUser } = await createTestUser(db, {
        githubId: 99999,
        login: 'otheruser',
      });
      const repo = await createTestRepo(db);

      const res = await app.request(`/api/repos/${repo.id}/whitelist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: otherUser.id }),
      });

      expect(res.status).toBe(403);
    });
  });
});
